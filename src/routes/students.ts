// Routes students
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { getTeacherId, getUser, teacherAssignedIds } from '../lib/auth'
import { reissueSession } from '../lib/session'
import { notifyParent, parseStudentCode, studentCode } from '../lib/notifications'
import { sb } from '../lib/supabase'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// Statistiques publiques agrégées pour la page d'accueil (compteurs animés) — aucune donnée personnelle
app.get('/api/public/stats', async (c) => {
  // Compter via select léger — les tables restent petites (école)
  const [st, te, co, ic] = await Promise.all([
    sb(c.env, 'students?select=level&status=eq.actif'),
    sb(c.env, 'teachers?select=id'),
    sb(c.env, 'courses?select=id'),
    sb(c.env, 'interactive_courses?select=id')
  ])
  const levels = new Set((st.data || []).map((s: any) => s.level).filter(Boolean))
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({
    students: (st.data || []).length,
    teachers: (te.data || []).length,
    courses: (co.data || []).length + (ic.data || []).length,
    levels: levels.size
  })
})

// Liste publique des élèves pour liaison à l'inscription (nom + niveau seulement)
// Liste publique des élèves : réservée au staff (fuite de données sinon)
app.get('/api/public/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, 'students?select=id,first_name,last_name,level,class_name&order=last_name.asc&status=eq.actif')
  return c.json(r.data || [])
})

// Code de liaison d'un élève (staff uniquement — à communiquer au tuteur)
app.get('/api/students/:id/code', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'ID invalide' }, 400)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(Number(id))) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  return c.json({ id: Number(id), code: await studentCode(c.env, id) })
})

// ---------- Affectation élèves <-> enseignants ----------
// Lire les affectations d'un enseignant (admin) ou les siennes (teacher)
app.get('/api/teachers/:id/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const tid = Number(c.req.param('id'))
  if (!tid) return c.json({ error: 'ID invalide' }, 400)
  if (user.role === 'teacher') {
    const own = await getTeacherId(c.env, user)
    if (own !== tid) return c.json({ error: 'Accès refusé' }, 403)
  }
  const r = await sb(c.env, `teacher_students?teacher_id=eq.${tid}&select=student_id,students(id,first_name,last_name,level,class_name,status)`)
  if (!r.ok) return c.json({ error: 'Table des affectations absente. Exécutez migrations/0003_teacher_assignments.sql dans Supabase.', detail: r.data }, 500)
  return c.json(r.data || [])
})

// Remplacer en bloc les élèves affectés à un enseignant (admin uniquement)
app.put('/api/teachers/:id/students', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const tid = Number(c.req.param('id'))
  if (!tid) return c.json({ error: 'ID invalide' }, 400)
  const b = await c.req.json()
  const ids: number[] = Array.from(new Set((Array.isArray(b.student_ids) ? b.student_ids : []).map((x: any) => Number(x)).filter((n: number) => n > 0)))
  const del = await sb(c.env, `teacher_students?teacher_id=eq.${tid}`, { method: 'DELETE' })
  if (!del.ok) return c.json({ error: 'Table des affectations absente. Exécutez migrations/0003_teacher_assignments.sql dans Supabase.', detail: del.data }, 500)
  if (ids.length) {
    const rows = ids.map((sid) => ({ teacher_id: tid, student_id: sid }))
    const ins = await sb(c.env, 'teacher_students', { method: 'POST', body: JSON.stringify(rows) })
    if (!ins.ok) return c.json({ error: 'Erreur affectation', detail: ins.data }, 500)
  }
  return c.json({ ok: true, teacher_id: tid, student_ids: ids })
})

// Lier un élève à son compte (parent/élève) avec le code fourni par l'école
app.post('/api/link-student', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!['parent', 'student'].includes(user.role)) return c.json({ error: 'Réservé aux parents et élèves' }, 403)
  const b = await c.req.json()
  const sid = await parseStudentCode(c.env, b.code)
  if (!sid) return c.json({ error: 'Code élève invalide. Vérifiez le code communiqué par l\'école (format RCF-12-ABCD).' }, 400)
  const st = await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level&status=eq.actif`)
  const student = st.data?.[0]
  if (!student) return c.json({ error: 'Élève introuvable ou inactif' }, 404)
  // Ajouter aux liaisons existantes
  const acc = await sb(c.env, `user_accounts?id=eq.${user.id}&select=linked_student_ids,linked_student_id`)
  const cur: number[] = Array.isArray(acc.data?.[0]?.linked_student_ids) ? acc.data[0].linked_student_ids.map(Number) : []
  if (!cur.includes(sid)) cur.push(sid)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ linked_student_ids: cur, linked_student_id: acc.data?.[0]?.linked_student_id || sid }) })
  if (!r.ok) return c.json({ error: 'Erreur de liaison' }, 500)
  // Nouveau JWT avec les liaisons à jour
  const u = r.data[0]
  // L2 : les liaisons élèves changent → le jeton de la session courante est réémis (même session, aucun jeton renvoyé)
  await reissueSession(c.env, c, u, user.sid)
  return c.json({ ok: true, student: { id: student.id, first_name: student.first_name, last_name: student.last_name, level: student.level }, linked_student_ids: u.linked_student_ids })
})

// ---------- Approbation d'une inscription -> crée l'élève ----------
app.post('/api/registrations/:id/approve', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const id = c.req.param('id')
  const r = await sb(c.env, `registrations?id=eq.${id}&select=*`)
  const reg = r.data?.[0]
  if (!reg) return c.json({ error: 'Introuvable' }, 404)
  // Anti-doublon : refuser si un élève avec cet identifiant existe déjà
  if (reg.national_id) {
    const dup = await sb(c.env, `students?national_id=eq.${reg.national_id}&select=id,first_name,last_name`)
    if (dup.data?.length) return c.json({ error: `Cet élève est déjà enregistré (identifiant ${reg.national_id} — ${dup.data[0].first_name} ${dup.data[0].last_name}).` }, 409)
  }
  const st = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify({
    first_name: reg.first_name, last_name: reg.last_name, birth_date: reg.birth_date, gender: reg.gender,
    cycle: reg.cycle, level: reg.level, parent_name: reg.parent_name, parent_email: reg.parent_email,
    parent_phone: reg.parent_phone, address: reg.address, status: 'actif', national_id: reg.national_id || null
  }) })
  if (!st.ok) return c.json({ error: 'Erreur création élève', detail: st.data }, 500)
  await sb(c.env, `registrations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) })
  // Créer automatiquement le frais d'inscription de 40 DT (échéance : 30 jours)
  const due = new Date(); due.setDate(due.getDate() + 30)
  await sb(c.env, 'fees', { method: 'POST', body: JSON.stringify({
    student_id: st.data[0].id, label: "Frais d'inscription", amount: 40,
    due_date: due.toISOString().slice(0, 10), status: 'pending'
  }) })
  // Envoyer le code élève au tuteur (Telegram + email) pour lier son compte
  const code = await studentCode(c.env, st.data[0].id)
  const codeMsg = `Inscription approuvée pour ${reg.first_name} ${reg.last_name} ! Votre code élève : ${code} — utilisez-le pour lier votre compte parent sur la plateforme (bouton « Lier un élève »). Gardez ce code confidentiel.`
  try {
    await notifyParent(c.env, st.data[0].id, 'info', 'Inscription approuvée — Code élève', codeMsg)
  } catch (e) { /* non bloquant */ }
  return c.json({ ok: true, student: st.data[0], code })
})

export default app
