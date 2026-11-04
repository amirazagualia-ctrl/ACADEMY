// Routes homeworks
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getTeacherId, getUser, linkedIds, teacherAssignedIds } from '../lib/auth'
import { broadcastTargeted, notifyParent, userLevels } from '../lib/notifications'
import { currentYear, getSettings, sb } from '../lib/supabase'
import { TC } from '../lib/tenant'
import { publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Devoirs à rendre (الواجبات المنزلية) ----------
// (per-tenant) let _hwSupported: { ok: boolean; at: number } | null = null
export async function hwSupported(env: Bindings) {
  if (TC._hwSupported && (TC._hwSupported.ok || Date.now() - TC._hwSupported.at < 300000)) return TC._hwSupported.ok
  const p = await sb(env, 'homeworks?select=id&limit=1'); TC._hwSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
const HW_SEL = 'select=*,subjects(name),teachers(first_name,last_name,subject)'
// Portée : élèves visibles par l'utilisateur (ids) et niveaux
export async function hwScope(env: Bindings, user: any): Promise<{ studentIds: number[] | null; levels: string[] | null; teacherId: number | null }> {
  if (user.role === 'admin') return { studentIds: null, levels: null, teacherId: null }
  if (user.role === 'teacher') { const ids = await teacherAssignedIds(env, user); const tid = await getTeacherId(env, user); const lv = await userLevels(env, user); return { studentIds: ids, levels: lv, teacherId: tid } }
  const ids = linkedIds(user); const lv = await userLevels(env, user)
  return { studentIds: ids, levels: lv, teacherId: null }
}
async function hwNotifyPublish(env: Bindings, origin: string, hw: any, user: any) {
  const sname = hw.subjects?.name || (hw.subject_id ? (await sb(env, `subjects?id=eq.${hw.subject_id}&select=name`)).data?.[0]?.name : '') || ''
  const due = new Date(hw.due_at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  await broadcastTargeted(env, origin, { type: 'cours', title: `📚 Nouveau devoir${sname ? ' de ' + sname : ''} (${hw.level})`, message: `« ${hw.title} » à rendre pour le ${due}. — واجب منزلي جديد`, level: hw.level, ref_table: 'homeworks', ref_id: Number(hw.id), link: `#homeworks`, created_by: user?.id })
}

// Liste (filtrée par rôle) + progression
app.get('/api/homeworks', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await hwSupported(c.env))) return c.json({ supported: false, items: [] })
  const sc = await hwScope(c.env, user)
  let q = `homeworks?${HW_SEL}&order=due_at.desc&limit=300`
  if (user.role === 'teacher') { if (!sc.teacherId) return c.json({ supported: true, items: [] }); q += c.req.query('mine') === '0' && sc.levels?.length ? `&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})` : `&teacher_id=eq.${sc.teacherId}` }
  if (['parent', 'student'].includes(user.role)) { if (!sc.levels?.length) return c.json({ supported: true, items: [] }); q += `&status=neq.draft&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})` }
  const r = await sb(c.env, q)
  const items = r.data || []
  if (!items.length) return c.json({ supported: true, items: [] })
  // Dépôts (portée élèves) + effectif par niveau
  let sq = `homework_submissions?homework_id=in.(${items.map((h: any) => h.id).join(',')})&select=id,homework_id,student_id,status,score,is_late,submitted_at,feedback,files,content,students(first_name,last_name,level)`
  if (sc.studentIds) { if (!sc.studentIds.length) sq += '&student_id=eq.0'; else sq += `&student_id=in.(${sc.studentIds.join(',')})` }
  const subs = (await sb(c.env, sq)).data || []
  const levels = Array.from(new Set(items.map((h: any) => h.level)))
  let stq = `students?status=eq.actif&level=in.(${levels.map(l => `"${l}"`).join(',')})&select=id,level`
  if (sc.studentIds) stq += sc.studentIds.length ? `&id=in.(${sc.studentIds.join(',')})` : '&id=eq.0'
  const studs = (await sb(c.env, stq)).data || []
  const now = Date.now()
  const out = items.map((h: any) => {
    const hs = subs.filter((s: any) => s.homework_id === h.id)
    const total = studs.filter((s: any) => s.level === h.level).length
    return { ...h, total_students: total, submitted: hs.length, graded: hs.filter((s: any) => s.status !== 'submitted').length, overdue: new Date(h.due_at).getTime() < now, my_submissions: ['parent', 'student'].includes(user.role) ? hs : undefined }
  })
  return c.json({ supported: true, items: out })
})

// Créer / modifier / fermer / supprimer (enseignant pour ses devoirs, admin tout)
app.post('/api/homeworks', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!b.title || !b.level || !b.due_at) return c.json({ error: 'Titre, niveau et date limite requis' }, 400)
  const tid = user.role === 'teacher' ? await getTeacherId(c.env, user) : (b.teacher_id || null)
  const row: any = { title: b.title, instructions: b.instructions || null, subject_id: b.subject_id || null, level: b.level, teacher_id: tid, due_at: b.due_at, attachment_url: b.attachment_url || null, attachment_name: b.attachment_name || null, max_points: Number(b.max_points) > 0 ? Number(b.max_points) : 20, allow_late: b.allow_late !== false, count_in_term: !!b.count_in_term, trimester: [1, 2, 3].includes(Number(b.trimester)) ? Number(b.trimester) : 1, status: ['draft', 'published'].includes(b.status) ? b.status : 'published', created_by: user.id, school_year: await currentYear(c.env) }
  const r = await sb(c.env, `homeworks?${HW_SEL}`, { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur création', detail: r.data }, 500)
  const hw = r.data[0]
  await audit(c.env, c, user, 'create', 'homeworks', hw.id, null, row)
  if (hw.status === 'published') { try { await hwNotifyPublish(c.env, publicOrigin(c), hw, user) } catch {} }
  return c.json(hw, 201)
})
app.put('/api/homeworks/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `homeworks?id=eq.${id}&${HW_SEL}`)).data?.[0]
  if (!before) return c.json({ error: 'Devoir introuvable' }, 404)
  if (user.role === 'teacher' && Number(before.teacher_id) !== await getTeacherId(c.env, user)) return c.json({ error: 'Vous ne pouvez modifier que vos devoirs' }, 403)
  const b = await c.req.json(); const patch: any = {}
  for (const k of ['title', 'instructions', 'subject_id', 'level', 'due_at', 'attachment_url', 'attachment_name', 'max_points', 'allow_late', 'count_in_term', 'trimester', 'status']) if (k in b) patch[k] = b[k]
  const r = await sb(c.env, `homeworks?id=eq.${id}&${HW_SEL}`, { method: 'PATCH', body: JSON.stringify(patch) })
  await audit(c.env, c, user, 'update', 'homeworks', id, before, patch)
  if (before.status === 'draft' && patch.status === 'published') { try { await hwNotifyPublish(c.env, publicOrigin(c), r.data?.[0] || before, user) } catch {} }
  return c.json(r.data?.[0] || { ok: r.ok })
})
app.delete('/api/homeworks/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Devoir introuvable' }, 404)
  if (user.role === 'teacher' && Number(before.teacher_id) !== await getTeacherId(c.env, user)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `homeworks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: user.id }) })
  await audit(c.env, c, user, 'soft_delete', 'homeworks', id, before, null)
  return c.json({ ok: r.ok, soft: true })
})

// Dépôt (élève pour lui-même, parent pour un enfant lié) — création ou remplacement avant correction
app.post('/api/homeworks/:id/submit', async (c) => {
  const user = await getUser(c)
  if (!user || !['student', 'parent'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const b = await c.req.json()
  const sid = Number(b.student_id || (user.role === 'student' ? linkedIds(user)[0] : 0))
  if (!sid || !linkedIds(user).includes(sid)) return c.json({ error: 'Élève non lié à votre compte' }, 403)
  const hw = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!hw || hw.status !== 'published') return c.json({ error: 'Devoir indisponible' }, 404)
  const st = (await sb(c.env, `students?id=eq.${sid}&select=level,first_name,last_name`)).data?.[0]
  if (!st || st.level !== hw.level) return c.json({ error: "Ce devoir ne concerne pas le niveau de l'élève" }, 400)
  const late = Date.now() > new Date(hw.due_at).getTime()
  if (late && !hw.allow_late) return c.json({ error: 'Date limite dépassée : le dépôt tardif n\'est pas autorisé pour ce devoir.' }, 423)
  const files = Array.isArray(b.files) ? b.files.slice(0, 5) : []
  if (!String(b.content || '').trim() && !files.length) return c.json({ error: 'Ajoutez une réponse ou un fichier' }, 400)
  const existing = (await sb(c.env, `homework_submissions?homework_id=eq.${id}&student_id=eq.${sid}&select=id,status`)).data?.[0]
  if (existing && existing.status !== 'submitted') return c.json({ error: 'Ce devoir a déjà été corrigé : dépôt verrouillé.' }, 423)
  const row = { homework_id: id, student_id: sid, content: b.content || null, files, submitted_at: new Date().toISOString(), submitted_by: user.id, is_late: late, status: 'submitted' }
  const r = existing ? await sb(c.env, `homework_submissions?id=eq.${existing.id}`, { method: 'PATCH', body: JSON.stringify(row) }) : await sb(c.env, 'homework_submissions', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur dépôt', detail: r.data }, 500)
  await audit(c.env, c, user, existing ? 'update' : 'create', 'homework_submissions', r.data?.[0]?.id, null, { homework_id: id, student_id: sid, late })
  // Notifier l'enseignant (in-app, groupé par devoir : une notification par dépôt mais ciblée sur l'auteur du devoir)
  try {
    if (hw.created_by) await sb(c.env, 'notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ student_id: sid, type: 'info', title: `📥 Dépôt reçu — ${hw.title}`, message: `${st.first_name} ${st.last_name} (${st.level}) a rendu le devoir${late ? ' (en retard)' : ''}.`, recipient: 'enseignant', sent_via: 'app', status: 'sent', audience: ['teacher'], level: hw.level, ref_table: 'homeworks', ref_id: id, link: '#homeworks', school_year: hw.school_year }) })
  } catch {}
  return c.json(r.data?.[0], existing ? 200 : 201)
})

// Correction (enseignant auteur / admin) : note + commentaire (+ report dans grades si count_in_term)
app.post('/api/homeworks/:id/grade', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const b = await c.req.json()
  const hw = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!hw) return c.json({ error: 'Devoir introuvable' }, 404)
  const tid = user.role === 'teacher' ? await getTeacherId(c.env, user) : null
  if (user.role === 'teacher' && Number(hw.teacher_id) !== tid) return c.json({ error: 'Vous ne pouvez corriger que vos devoirs' }, 403)
  const sid = Number(b.student_id)
  const score = b.score === null || b.score === '' ? null : Number(b.score)
  if (score !== null && (isNaN(score) || score < 0 || score > Number(hw.max_points))) return c.json({ error: `Note entre 0 et ${hw.max_points}` }, 400)
  let sub = (await sb(c.env, `homework_submissions?homework_id=eq.${id}&student_id=eq.${sid}&select=*`)).data?.[0]
  if (!sub) { // non rendu : créer une ligne « non rendu » notée (ex. 0)
    const r = await sb(c.env, 'homework_submissions', { method: 'POST', body: JSON.stringify({ homework_id: id, student_id: sid, content: null, files: [], is_late: true, status: 'submitted', submitted_by: null }) })
    sub = r.data?.[0]; if (!sub) return c.json({ error: 'Impossible de créer la ligne', detail: r.data }, 500)
  }
  const patch: any = { score, feedback: b.feedback ?? sub.feedback ?? null, corrected_file_url: b.corrected_file_url ?? sub.corrected_file_url ?? null, status: score !== null ? 'graded' : 'submitted', graded_by: user.id, graded_at: new Date().toISOString() }
  // Report dans le carnet (grades) : une note exam_type='devoir' liée par grade_id, mise à jour si déjà reportée
  if (score !== null && (b.count_in_term ?? hw.count_in_term)) {
    const scaled = Math.round(score / Number(hw.max_points || 20) * 20 * 100) / 100
    const g = { student_id: sid, subject_id: hw.subject_id, trimester: hw.trimester || 1, score: scaled, max_score: 20, exam_type: 'devoir', comment: `Devoir : ${hw.title}`, teacher_id: hw.teacher_id }
    if (sub.grade_id) await sb(c.env, `grades?id=eq.${sub.grade_id}`, { method: 'PATCH', body: JSON.stringify({ score: scaled }) })
    else if (hw.subject_id) { const gr = await sb(c.env, 'grades', { method: 'POST', body: JSON.stringify(g) }); if (gr.ok) patch.grade_id = gr.data?.[0]?.id }
  }
  const r = await sb(c.env, `homework_submissions?id=eq.${sub.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  await audit(c.env, c, user, 'grade', 'homework_submissions', sub.id, { score: sub.score, status: sub.status }, patch)
  // Notifier élève + parent
  if (score !== null) { try { await notifyParent(c.env, sid, 'note', `✅ Devoir corrigé — ${hw.title}`, `Note : ${score}/${hw.max_points}.${b.feedback ? ' Commentaire : ' + String(b.feedback).slice(0, 200) : ''}`) } catch {} }
  return c.json(r.data?.[0] || { ok: r.ok })
})

// Relancer les élèves qui n'ont pas rendu (enseignant / admin)
app.post('/api/homeworks/:id/remind', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const hw = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!hw) return c.json({ error: 'Devoir introuvable' }, 404)
  const sc = await hwScope(c.env, user)
  let q = `students?status=eq.actif&level=eq.${encodeURIComponent(hw.level)}&select=id`
  if (sc.studentIds) q += sc.studentIds.length ? `&id=in.(${sc.studentIds.join(',')})` : '&id=eq.0'
  const studs = ((await sb(c.env, q)).data || []).map((s: any) => Number(s.id))
  const done = new Set(((await sb(c.env, `homework_submissions?homework_id=eq.${id}&select=student_id`)).data || []).map((s: any) => Number(s.student_id)))
  const missing = studs.filter((x: any) => !done.has(x))
  const due = new Date(hw.due_at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  let sent = 0
  for (const sid of missing.slice(0, 100)) { try { await notifyParent(c.env, sid, 'info', `⏰ Devoir à rendre — ${hw.title}`, `Le devoir « ${hw.title} » (${hw.level}) est attendu pour le ${due}. Il n'a pas encore été rendu. — تذكير بواجب منزلي`); sent++ } catch {} }
  await audit(c.env, c, user, 'remind', 'homeworks', id, null, { missing: missing.length, sent })
  return c.json({ ok: true, missing: missing.length, sent })
})

// Rappel automatique J-1 (intégré à la maintenance quotidienne) : élèves du niveau n'ayant pas rendu
export async function dailyHomeworkReminders(env: Bindings) {
  if (!(await hwSupported(env))) return
  const today = new Date().toISOString().slice(0, 10)
  const last = await getSettings(env, 'homework_reminders_maintenance')
  if (last.last_run === today) return
  await sb(env, 'settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: 'homework_reminders_maintenance', value: { last_run: today } }) })
  const from = new Date(); from.setUTCDate(from.getUTCDate() + 1); from.setUTCHours(0, 0, 0, 0)
  const to = new Date(from); to.setUTCDate(to.getUTCDate() + 1)
  const hws = (await sb(env, `homeworks?status=eq.published&due_at=gte.${from.toISOString()}&due_at=lt.${to.toISOString()}&select=*`)).data || []
  for (const hw of hws) {
    const studs = ((await sb(env, `students?status=eq.actif&level=eq.${encodeURIComponent(hw.level)}&select=id`)).data || []).map((s: any) => Number(s.id))
    const done = new Set(((await sb(env, `homework_submissions?homework_id=eq.${hw.id}&select=student_id`)).data || []).map((s: any) => Number(s.student_id)))
    const due = new Date(hw.due_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    for (const sid of studs.filter((x: any) => !done.has(x)).slice(0, 100)) { try { await notifyParent(env, sid, 'info', `⏰ Devoir à rendre demain — ${hw.title}`, `Rappel : « ${hw.title} » (${hw.level}) est à rendre demain à ${due}. — الواجب المنزلي غداً`) } catch {} }
  }
}

// Compteur pour le badge menu : élève/parent = devoirs publiés non rendus ; enseignant = dépôts à corriger
app.get('/api/homeworks/badge', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await hwSupported(c.env))) return c.json({ count: 0 })
  const sc = await hwScope(c.env, user)
  if (user.role === 'teacher') {
    if (!sc.teacherId) return c.json({ count: 0 })
    const hws = ((await sb(c.env, `homeworks?teacher_id=eq.${sc.teacherId}&status=eq.published&select=id`)).data || []).map((h: any) => h.id)
    if (!hws.length) return c.json({ count: 0 })
    const subs = (await sb(c.env, `homework_submissions?homework_id=in.(${hws.join(',')})&status=eq.submitted&select=id`)).data || []
    return c.json({ count: subs.length })
  }
  if (['parent', 'student'].includes(user.role)) {
    if (!sc.levels?.length || !sc.studentIds?.length) return c.json({ count: 0 })
    const hws = (await sb(c.env, `homeworks?status=eq.published&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})&select=id,level`)).data || []
    if (!hws.length) return c.json({ count: 0 })
    const studs = (await sb(c.env, `students?id=in.(${sc.studentIds.join(',')})&select=id,level`)).data || []
    const subs = (await sb(c.env, `homework_submissions?homework_id=in.(${hws.map((h: any) => h.id).join(',')})&student_id=in.(${sc.studentIds.join(',')})&select=homework_id,student_id`)).data || []
    const doneKey = new Set(subs.map((s: any) => `${s.homework_id}:${s.student_id}`))
    let count = 0
    for (const h of hws) for (const s of studs) if (s.level === h.level && !doneKey.has(`${h.id}:${s.id}`)) count++
    return c.json({ count })
  }
  return c.json({ count: 0 })
})

export default app
