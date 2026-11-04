// Routes db
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getTeacherId, getUser, inScopeStudent, inScopeSubject, linkedIds, teacherAssignedIds, teacherScope } from '../lib/auth'
import { notifyNewContent, notifyParent, sendReceiptTelegram } from '../lib/notifications'
import { SOFT_DELETE_TABLES, YEAR_TABLES, currentYear, requestedYear, sb, softDeleteSupported } from '../lib/supabase'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- CRUD générique avec filtrage par rôle ----------
const TABLES = ['students', 'teachers', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events', 'notifications', 'registrations', 'settings', 'teacher_students']
const WRITE_ADMIN_TEACHER = ['students', 'teachers', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events']
const STUDENT_SCOPED = ['grades', 'attendance', 'fees', 'notifications']

app.get('/api/db/:table', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const url = new URL(c.req.url)
  let qs = url.search.slice(1)
  // Filtrage parent/élève : accès uniquement aux données de leurs enfants
  if ((user.role === 'parent' || user.role === 'student')) {
    const ids = linkedIds(user)
    if (STUDENT_SCOPED.includes(table)) {
      if (!ids.length) return c.json([])
      qs += (qs ? '&' : '') + `student_id=in.(${ids.join(',')})`
    }
    if (table === 'students') {
      if (!ids.length) return c.json([])
      qs += (qs ? '&' : '') + `id=in.(${ids.join(',')})`
    }
    if (table === 'registrations') return c.json({ error: 'Accès refusé' }, 403)
    if (table === 'teacher_students') return c.json({ error: 'Accès refusé' }, 403)
  }
  // Filtrage enseignant : uniquement les élèves qui lui sont affectés par l'admin
  if (user.role === 'teacher') {
    if (table === 'settings' && /key=eq\.notebook_/.test(qs)) { const tid = await getTeacherId(c.env, user); if (!tid) return c.json([]); qs = qs.replace(/(key=eq\.notebook_[^&_]+)(_t\d+)?/, `$1_t${tid}`) }
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null) {
      if (STUDENT_SCOPED.includes(table)) {
        if (!aids.length) return c.json([])
        qs += (qs ? '&' : '') + `student_id=in.(${aids.join(',')})`
      }
      if (table === 'students') {
        if (!aids.length) return c.json([])
        qs += (qs ? '&' : '') + `id=in.(${aids.join(',')})`
      }
    }
    if (table === 'registrations') return c.json({ error: 'Accès refusé' }, 403)
  }
  // Année scolaire : filtrer les tables datées sur l'année demandée (ou courante) sauf all_years=1 (admin)
  if (YEAR_TABLES.includes(table) && !qs.includes('school_year=') && !(url.searchParams.get('all_years') === '1' && user.role === 'admin')) {
    const y = requestedYear(c) || await currentYear(c.env)
    if (y) qs += (qs ? '&' : '') + `school_year=eq.${y}`
  }
  qs = qs.replace(/(^|&)all_years=[^&]*/g, '')
  // Soft-delete : masquer les éléments dans la corbeille (sauf demande explicite admin ?include_deleted=1)
  if (SOFT_DELETE_TABLES.includes(table) && !(user.role === 'admin' && url.searchParams.get('include_deleted') === '1') && await softDeleteSupported(c.env)) {
    qs = qs.replace(/(^|&)include_deleted=[^&]*/g, '')
    qs += (qs ? '&' : '') + 'deleted_at=is.null'
  }
  const r = await sb(c.env, `${table}?${qs || 'select=*'}`)
  return c.json(r.data || [], r.ok ? 200 : (r.status as any))
})

app.post('/api/db/:table', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  // Inscriptions publiques autorisées sans compte
  if (table !== 'registrations') {
    if (!user) return c.json({ error: 'Non authentifié' }, 401)
    if (WRITE_ADMIN_TEACHER.includes(table) && !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
    if ((table === 'settings' || table === 'notifications') && user.role !== 'admin' && !(table === 'notifications' && user.role === 'teacher') && !(table === 'settings' && user.role === 'teacher' && String((await c.req.raw.clone().json().catch(() => ({})) as any)?.key || '').startsWith('notebook_'))) return c.json({ error: 'Accès refusé' }, 403)
    if (table === 'teacher_students' && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  }
  const body = await c.req.json()
  // Matière obligatoire pour chaque enseignant
  if (table === 'teachers' && !String(body.subject || '').trim()) {
    return c.json({ error: "La matière enseignée est obligatoire pour chaque enseignant." }, 400)
  }
  // Identifiant élève (12 chiffres) : format + unicité (élève déjà enregistré => refus)
  if (table === 'students' || table === 'registrations') {
    const nid = String(body.national_id || '').replace(/\s+/g, '')
    if (table === 'students' && !/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
    if (nid) {
      if (!/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
      body.national_id = nid
      const dup = await sb(c.env, `students?national_id=eq.${nid}&select=id,first_name,last_name`)
      if (dup.data?.length) return c.json({ error: `Cet élève est déjà enregistré (identifiant ${nid} — ${dup.data[0].first_name} ${dup.data[0].last_name}). Double enregistrement refusé.` }, 409)
      if (table === 'registrations') {
        const dupReg = await sb(c.env, `registrations?national_id=eq.${nid}&status=eq.pending&select=id`)
        if (dupReg.data?.length) return c.json({ error: `Une demande d'inscription avec l'identifiant ${nid} est déjà en attente.` }, 409)
      }
    }
  }
  // F59 : un enseignant ne note / n'observe que SA matière et SES élèves affectés par l'admin
  if (user?.role === 'teacher' && (table === 'grades' || table === 'attendance' || (table === 'settings' && String(body?.key || '').startsWith('notebook_')))) {
    const scope = await teacherScope(c.env, user)
    if (table === 'grades') {
      const rowsIn = Array.isArray(body) ? body : [body]
      for (const g of rowsIn) {
        if (!inScopeSubject(scope, g.subject_id)) return c.json({ error: 'Vous ne pouvez saisir des notes que pour votre matière affectée par l\'administration.' }, 403)
        if (!inScopeStudent(scope, g.student_id)) return c.json({ error: 'Cet élève ne vous est pas affecté par l\'administration.' }, 403)
        if (scope.teacher_id) g.teacher_id = scope.teacher_id
      }
    }
    if (table === 'attendance') { const rowsIn = Array.isArray(body) ? body : [body]; for (const a of rowsIn) if (!inScopeStudent(scope, a.student_id)) return c.json({ error: 'Cet élève ne vous est pas affecté par l\'administration.' }, 403) }
    if (table === 'settings') {
      // Carnet de classe : chaque enseignant a son propre carnet (clé notebook_<niveau>_t<id>) et ne peut y placer que ses élèves
      if (!scope.teacher_id) return c.json({ error: 'Compte non relié à une fiche enseignant.' }, 403)
      const base = String(body.key).replace(/_t\d+$/, ''); body.key = `${base}_t${scope.teacher_id}`
      if (scope.student_ids !== null && body.value && typeof body.value === 'object') {
        const ok = new Set(scope.student_ids.map(String))
        for (const k of Object.keys(body.value.seats || {})) if (!ok.has(String(body.value.seats[k]))) delete body.value.seats[k]
        for (const k of Object.keys(body.value.evals || {})) if (!ok.has(String(k))) delete body.value.evals[k]
        body.value.raised = (body.value.raised || []).filter((x: any) => ok.has(String(x)))
      }
    }
  }
  // Notes & cours interactifs créés par un enseignant : enregistrer l'auteur (sa fiche teacher)
  if ((table === 'grades' || table === 'interactive_courses') && user?.role === 'teacher' && !body.teacher_id) {
    try { const tid = await getTeacherId(c.env, user); if (tid) body.teacher_id = tid } catch (e) {}
  }
  // Année scolaire : tamponner les créations avec l'année courante (refus si l'année sélectionnée est clôturée)
  if (YEAR_TABLES.includes(table)) {
    const cy = await currentYear(c.env)
    if (cy) {
      const ry = requestedYear(c)
      if (ry && ry !== cy) return c.json({ error: `L'année scolaire ${ry} est clôturée (lecture seule). Revenez sur l'année courante ${cy} pour saisir des données.` }, 423)
      const stamp = (o: any) => { if (o && typeof o === 'object' && !o.school_year) o.school_year = cy }
      if (Array.isArray(body)) body.forEach(stamp); else stamp(body)
    }
  }
  const isUpsert = table === 'attendance' || table === 'settings'
  const headers: Record<string, string> = isUpsert ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {}
  let r = await sb(c.env, table + (isUpsert ? (table === 'attendance' ? '?on_conflict=student_id,date' : '?on_conflict=key') : ''), { method: 'POST', body: JSON.stringify(body), headers })
  if (!r.ok && table === 'teachers' && r.data?.code === 'PGRST204' && 'subject_ids' in body) { delete (body as any).subject_ids; r = await sb(c.env, table, { method: 'POST', body: JSON.stringify(body), headers }) }
  // Repli : colonnes migration 0004 absentes (teacher_id / course_type / content / external_url)
  if (!r.ok && (table === 'grades' || table === 'interactive_courses') && (r.data?.code === 'PGRST204')) {
    for (const col of ['teacher_id', 'course_type', 'content', 'external_url']) delete (body as any)[col]
    r = await sb(c.env, table, { method: 'POST', body: JSON.stringify(body), headers })
  }
  // Repli : colonnes migration 0005 absentes (students.monthly_fee / fees.period)
  if (!r.ok && (table === 'students' || table === 'fees') && (r.data?.code === 'PGRST204')) {
    for (const col of ['monthly_fee', 'period']) delete (body as any)[col]
    r = await sb(c.env, table, { method: 'POST', body: JSON.stringify(body), headers })
  }
  if (!r.ok) return c.json({ error: 'Erreur', detail: r.data }, 500)

  // ---- Notifications automatiques ----
  const rows = Array.isArray(r.data) ? r.data : [r.data]
  try {
    if (table === 'attendance') {
      for (const row of rows) {
        if (row.status === 'absent') await notifyParent(c.env, row.student_id, 'absence', 'Absence signalée', `Votre enfant a été marqué(e) ABSENT(E) le ${row.date}.${row.notes ? ' Note : ' + row.notes : ''}`)
        else if (row.status === 'retard') await notifyParent(c.env, row.student_id, 'retard', 'Retard signalé', `Votre enfant est arrivé(e) en RETARD le ${row.date}.${row.notes ? ' Note : ' + row.notes : ''}`)
      }
    }
    if (table === 'grades' && c.req.header('X-Skip-Notify') !== '1') {
      for (const row of rows) {
        const subj = await sb(c.env, `subjects?id=eq.${row.subject_id}&select=name`)
        const sname = subj.data?.[0]?.name || 'Matière'
        await notifyParent(c.env, row.student_id, 'note', 'Nouvelle note', `Nouvelle note en ${sname} : ${row.score}/${row.max_score || 20} (Trimestre ${row.trimester}).${row.comment ? ' Commentaire : ' + row.comment : ''}`)
      }
    }
    // Frais créé directement payé -> envoyer lien quittance via Telegram
    if (table === 'fees') {
      const origin = `https://${new URL(c.req.url).host}`
      for (const row of rows) {
        if (row.status === 'paid') await sendReceiptTelegram(c.env, origin, row)
      }
    }
    // Nouveau cours / cours interactif / événement / examen -> notification ciblée par rôle
    if ((table === 'courses' || table === 'interactive_courses' || table === 'events') && c.req.header('X-Skip-Notify') !== '1') {
      const origin = `https://${new URL(c.req.url).host}`
      for (const row of rows) await notifyNewContent(c.env, origin, table, row, user)
    }
  } catch (e) { /* notifications non bloquantes */ }
  if (table !== 'registrations' || user) for (const row of rows) await audit(c.env, c, user, 'create', table, row?.id ?? row?.key, null, row)
  return c.json(rows.length === 1 ? rows[0] : rows, 201)
})

app.put('/api/db/:table/:id', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if ((table === 'settings' || table === 'registrations') && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  // Année clôturée : lecture seule
  if (YEAR_TABLES.includes(table)) { const ry = requestedYear(c); const cy = await currentYear(c.env); if (ry && cy && ry !== cy) return c.json({ error: `L'année scolaire ${ry} est clôturée (lecture seule).` }, 423) }
  const body = await c.req.json()
  // Matière obligatoire pour chaque enseignant (si le champ est envoyé)
  if (table === 'teachers' && 'subject' in body && !String(body.subject || '').trim()) {
    return c.json({ error: "La matière enseignée est obligatoire pour chaque enseignant." }, 400)
  }
  if (table === 'teacher_students' && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher' && (table === 'grades' || table === 'attendance')) {
    const scope = await teacherScope(c.env, user)
    const cur = (await sb(c.env, `${table}?id=eq.${c.req.param('id')}&select=student_id${table === 'grades' ? ',subject_id' : ''}`)).data?.[0]
    if (!cur) return c.json({ error: 'Introuvable' }, 404)
    if (!inScopeStudent(scope, body.student_id ?? cur.student_id)) return c.json({ error: 'Cet élève ne vous est pas affecté par l\'administration.' }, 403)
    if (table === 'grades' && (!inScopeSubject(scope, cur.subject_id) || !inScopeSubject(scope, body.subject_id ?? cur.subject_id))) return c.json({ error: 'Vous ne pouvez modifier que les notes de votre matière affectée.' }, 403)
  }
  // Identifiant élève : format + unicité (en excluant l'élève lui-même)
  if (table === 'students' && 'national_id' in body) {
    const nid = String(body.national_id || '').replace(/\s+/g, '')
    if (!/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
    body.national_id = nid
    const dup = await sb(c.env, `students?national_id=eq.${nid}&id=neq.${c.req.param('id')}&select=id,first_name,last_name`)
    if (dup.data?.length) return c.json({ error: `Cet identifiant est déjà utilisé par ${dup.data[0].first_name} ${dup.data[0].last_name}.` }, 409)
  }
  const pk = table === 'settings' ? 'key' : 'id'
  // Examen : détecter un changement de date (avant le PATCH) -> notification « date modifiée »
  let examDateChanged = false
  if (table === 'events' && ('date' in body || 'end_date' in body)) {
    try {
      const prev = (await sb(c.env, `events?id=eq.${c.req.param('id')}&select=date,end_date,type`)).data?.[0]
      const newType = body.type || prev?.type
      if (prev && newType === 'examen' && ((body.date && body.date !== prev.date) || ('end_date' in body && (body.end_date || null) !== (prev.end_date || null)))) examDateChanged = true
    } catch (e) { /* non bloquant */ }
  }
  // Détecter la transition non-payé -> payé pour les frais (avant le PATCH)
  let feeWasUnpaid = false
  if (table === 'fees' && body.status === 'paid') {
    try {
      const prev = await sb(c.env, `fees?id=eq.${c.req.param('id')}&select=status`)
      feeWasUnpaid = prev.data?.[0]?.status !== 'paid'
    } catch (e) { /* non bloquant */ }
  }
  // Audit : état avant modification (tables métier sensibles)
  let beforeRow: any = null
  if (['grades', 'fees', 'students', 'teachers', 'attendance', 'events', 'courses', 'interactive_courses', 'classes', 'subjects'].includes(table)) {
    try { beforeRow = (await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}&select=*`)).data?.[0] || null } catch (e) {}
  }
  let r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (!r.ok && table === 'teachers' && r.data?.code === 'PGRST204' && 'subject_ids' in body) { delete (body as any).subject_ids; r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) }) }
  // Repli PUT : colonnes migration 0004 absentes
  if (!r.ok && (table === 'grades' || table === 'interactive_courses') && (r.data?.code === 'PGRST204')) {
    for (const col of ['teacher_id', 'course_type', 'content', 'external_url']) delete (body as any)[col]
    r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  // Repli PUT : colonnes migration 0005 absentes (students.monthly_fee / fees.period)
  if (!r.ok && (table === 'students' || table === 'fees') && (r.data?.code === 'PGRST204')) {
    for (const col of ['monthly_fee', 'period']) delete (body as any)[col]
    r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  // Paiement confirmé -> envoyer lien quittance via Telegram au tuteur
  if (r.ok && feeWasUnpaid && r.data?.[0]) {
    try { await sendReceiptTelegram(c.env, `https://${new URL(c.req.url).host}`, r.data[0]) } catch (e) { /* non bloquant */ }
  }
  // Date d'examen modifiée -> notifier élèves / parents / enseignants
  if (r.ok && examDateChanged && r.data?.[0] && c.req.header('X-Skip-Notify') !== '1') {
    try { await notifyNewContent(c.env, `https://${new URL(c.req.url).host}`, 'events', r.data[0], user, true) } catch (e) { /* non bloquant */ }
  }
  if (r.ok) await audit(c.env, c, user, 'update', table, c.req.param('id'), beforeRow, body)
  return c.json(r.data?.[0] || { ok: r.ok }, r.ok ? 200 : 500)
})

app.delete('/api/db/:table/:id', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if ((table === 'settings' || table === 'registrations' || table === 'teacher_students') && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const pk = table === 'settings' ? 'key' : 'id'
  if (YEAR_TABLES.includes(table)) { const ry = requestedYear(c); const cy = await currentYear(c.env); if (ry && cy && ry !== cy) return c.json({ error: `L'année scolaire ${ry} est clôturée (lecture seule).` }, 423) }
  let before: any = null
  try { before = (await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}&select=*`)).data?.[0] || null } catch (e) {}
  if (user.role === 'teacher' && (table === 'grades' || table === 'attendance') && before) {
    const scope = await teacherScope(c.env, user)
    if (!inScopeStudent(scope, before.student_id) || (table === 'grades' && !inScopeSubject(scope, before.subject_id))) return c.json({ error: 'Hors de votre périmètre (matière / élèves affectés).' }, 403)
  }
  // Soft-delete : marquage deleted_at (corbeille 30 jours) au lieu d'une suppression physique
  if (SOFT_DELETE_TABLES.includes(table) && await softDeleteSupported(c.env)) {
    const r = await sb(c.env, `${table}?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: user.id }) })
    await audit(c.env, c, user, 'soft_delete', table, c.req.param('id'), before, null)
    return c.json({ ok: r.ok, soft: true })
  }
  const r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'DELETE' })
  await audit(c.env, c, user, 'delete', table, c.req.param('id'), before, null)
  return c.json({ ok: r.ok })
})

export default app
