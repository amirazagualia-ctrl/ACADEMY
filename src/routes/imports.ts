// Routes imports
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getTeacherId, getUser, teacherAssignedIds } from '../lib/auth'
import { sb } from '../lib/supabase'
import { TC } from '../lib/tenant'
import { cycleOf } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Import Excel en masse (admin) : élèves / notes ----------
const IMPORT_LEVELS = ['1AP','2AP','3AP','4AP','5AP','6AP','7AB','8AB','9AB','1AS','2AS','3AS','4AS']
function normLevel(v: any): string | null {
  const t = String(v || '').toUpperCase().replace(/\s+/g, '').replace('ÈME', '').replace('ÈRE', '').replace('EME', '').replace('ERE', '')
  if (IMPORT_LEVELS.includes(t) || (TC._brandCache?.value as any)?.scheme?.levels?.some((l: any) => l.code === t)) return t
  const m = t.match(/^(\d)(AP|AB|AS|P|B|S)$/); if (m) { const x = m[1] + (m[2].length === 1 ? 'A' + m[2] : m[2]); if (IMPORT_LEVELS.includes(x)) return x }
  return null
}
function normDate(v: any): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(+d) ? null : d.toISOString().slice(0, 10) } // série Excel
  const t = String(v).trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
// Élèves : { rows:[{national_id, first_name, last_name, birth_date, gender, level, class_name, parent_name, parent_phone, parent_email, address, monthly_fee}], dry_run }
app.post('/api/admin/import/students', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const rows: any[] = Array.isArray(b.rows) ? b.rows.slice(0, 2000) : []
  const dry = !!b.dry_run; const mode = b.mode === 'update' ? 'update' : 'skip' // doublon d'identifiant : ignorer ou mettre à jour
  const existing = (await sb(c.env, `students?select=id,national_id,first_name,last_name,level&national_id=not.is.null&limit=5000`)).data || []
  const byNid: Record<string, any> = {}; existing.forEach((e: any) => { byNid[e.national_id] = e })
  const seen = new Set<string>()
  const report: any[] = []; const toInsert: any[] = []; const toUpdate: any[] = []
  rows.forEach((r, i) => {
    const line = r._line || i + 2; const errs: string[] = []
    const nid = String(r.national_id || '').replace(/\D/g, '')
    const first = String(r.first_name || '').trim(), last = String(r.last_name || '').trim()
    const level = normLevel(r.level)
    if (!/^\d{12}$/.test(nid)) errs.push('identifiant : 12 chiffres requis')
    if (!first) errs.push('prénom manquant'); if (!last) errs.push('nom manquant')
    if (!level) errs.push(`niveau invalide « ${r.level || ''} » (attendu 1AP…6AP, 7AB…9AB, 1AS…4AS)`)
    const birth = normDate(r.birth_date); if (r.birth_date && !birth) errs.push('date de naissance illisible (JJ/MM/AAAA)')
    const gender = String(r.gender || 'M').trim().toUpperCase().startsWith('F') ? 'F' : 'M'
    const phone = String(r.parent_phone || '').replace(/[^\d+]/g, '')
    const email = String(r.parent_email || '').trim().toLowerCase(); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push('email parent invalide')
    if (nid && seen.has(nid)) errs.push('identifiant en double dans le fichier'); seen.add(nid)
    const fee = r.monthly_fee !== undefined && r.monthly_fee !== '' && r.monthly_fee != null ? Number(String(r.monthly_fee).replace(',', '.')) : null
    if (fee !== null && isNaN(fee)) errs.push('mensualité non numérique')
    const dup = byNid[nid]
    let action = 'insert'
    if (dup) action = mode === 'update' ? 'update' : 'skip'
    if (errs.length) action = 'error'
    report.push({ line, national_id: nid, name: `${first} ${last}`.trim(), level, action, errors: errs, existing: dup ? `${dup.first_name} ${dup.last_name} (${dup.level})` : null })
    if (action === 'error' || action === 'skip') return
    const row: any = { national_id: nid, first_name: first, last_name: last, birth_date: birth, gender, cycle: cycleOf(level!), level, class_name: String(r.class_name || '').trim() || null, parent_name: String(r.parent_name || '').trim() || null, parent_phone: phone || null, parent_email: email || null, address: String(r.address || '').trim() || null, status: 'actif' }
    if (fee !== null) row.monthly_fee = fee
    if (action === 'update') toUpdate.push({ id: dup.id, row }); else toInsert.push(row)
  })
  const summary = { total: rows.length, insert: toInsert.length, update: toUpdate.length, skip: report.filter(r => r.action === 'skip').length, error: report.filter(r => r.action === 'error').length }
  if (dry) return c.json({ dry_run: true, summary, report })
  let inserted = 0, updated = 0; const failures: any[] = []
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100)
    const r = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify(chunk) })
    if (r.ok) inserted += chunk.length
    else { // repli ligne par ligne pour isoler l'erreur
      for (const row of chunk) { const r1 = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify(row) }); if (r1.ok) inserted++; else failures.push({ national_id: row.national_id, name: `${row.first_name} ${row.last_name}`, error: r1.data?.message || r1.data?.error || 'erreur' }) }
    }
  }
  for (const u of toUpdate) { const r = await sb(c.env, `students?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify(u.row) }); if (r.ok) updated++; else failures.push({ national_id: u.row.national_id, name: `${u.row.first_name} ${u.row.last_name}`, error: r.data?.message || 'erreur' }) }
  await audit(c.env, c, user, 'import_students', 'students', null, null, { inserted, updated, skipped: summary.skip, errors: summary.error + failures.length })
  return c.json({ ok: true, summary: { ...summary, inserted, updated, failed: failures.length }, report, failures })
})
// Notes : { rows:[{national_id | student_name, subject, trimester, exam_type, score, max_score, comment, date}], dry_run }
app.post('/api/admin/import/grades', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const rows: any[] = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : []
  const dry = !!b.dry_run
  const [stR, subR] = await Promise.all([sb(c.env, `students?select=id,national_id,first_name,last_name,level&status=eq.actif&limit=5000`), sb(c.env, `subjects?select=id,name,cycle`)])
  const students = stR.data || []; const subjects = subR.data || []
  let allowed: number[] | null = null
  if (user.role === 'teacher') allowed = await teacherAssignedIds(c.env, user)
  const tid = user.role === 'teacher' ? await getTeacherId(c.env, user) : null
  const norm = (x: string) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
  const byNid: Record<string, any> = {}; const byName: Record<string, any[]> = {}
  for (const s of students) { if (s.national_id) byNid[s.national_id] = s; const k = norm(`${s.first_name} ${s.last_name}`); (byName[k] = byName[k] || []).push(s); const k2 = norm(`${s.last_name} ${s.first_name}`); if (k2 !== k) (byName[k2] = byName[k2] || []).push(s) }
  const subByName: Record<string, any[]> = {}; for (const sj of subjects) (subByName[norm(sj.name)] = subByName[norm(sj.name)] || []).push(sj)
  const EXAM = ['controle', 'synthese', 'oral', 'devoir1', 'devoir2', 'examen', 'devoir']
  const report: any[] = []; const toInsert: any[] = []
  rows.forEach((r, i) => {
    const line = r._line || i + 2; const errs: string[] = []
    const nid = String(r.national_id || '').replace(/\D/g, '')
    let st = nid ? byNid[nid] : null
    if (!st && r.student_name) { const cands = byName[norm(r.student_name)] || []; if (cands.length === 1) st = cands[0]; else if (cands.length > 1) errs.push('plusieurs élèves portent ce nom : indiquez l\u2019identifiant'); }
    if (!st) errs.push(nid ? `élève introuvable (identifiant ${nid})` : 'élève introuvable')
    if (st && allowed !== null && !allowed.includes(st.id)) errs.push('élève non affecté à cet enseignant')
    let subj: any = null
    if (r.subject_id) subj = subjects.find((x: any) => x.id === Number(r.subject_id))
    if (!subj && r.subject) { const cands = subByName[norm(r.subject)] || []; subj = cands.length === 1 ? cands[0] : (st ? cands.find((x: any) => x.cycle === cycleOf(st.level)) : null) || cands[0] || null }
    if (!subj) errs.push(`matière inconnue « ${r.subject || ''} »`)
    const tri = Number(r.trimester); if (![1, 2, 3].includes(tri)) errs.push('trimestre : 1, 2 ou 3')
    const et = norm(r.exam_type || 'controle').replace(/[^a-z0-9]/g, ''); const exam_type = EXAM.includes(et) ? et : et.startsWith('dev') && et.endsWith('1') ? 'devoir1' : et.startsWith('dev') && et.endsWith('2') ? 'devoir2' : et.startsWith('exam') ? 'examen' : et.startsWith('synth') ? 'synthese' : et.startsWith('oral') ? 'oral' : 'controle'
    const max = r.max_score ? Number(String(r.max_score).replace(',', '.')) : 20
    const score = Number(String(r.score ?? '').replace(',', '.'))
    if (isNaN(score) || r.score === '' || r.score == null) errs.push('note manquante ou non numérique'); else if (score < 0 || score > max) errs.push(`note hors barème (0–${max})`)
    const date = normDate(r.date)
    report.push({ line, student: st ? `${st.first_name} ${st.last_name}` : (r.student_name || nid), subject: subj?.name || r.subject, trimester: tri, exam_type, score, max_score: max, action: errs.length ? 'error' : 'insert', errors: errs })
    if (errs.length) return
    const row: any = { student_id: st.id, subject_id: subj.id, trimester: tri, exam_type, score, max_score: max, comment: String(r.comment || '').trim() || null }
    if (tid) row.teacher_id = tid
    if (date) row.created_at = date
    toInsert.push(row)
  })
  const summary = { total: rows.length, insert: toInsert.length, error: report.filter(r => r.action === 'error').length }
  if (dry) return c.json({ dry_run: true, summary, report })
  let inserted = 0; const failures: any[] = []
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200)
    const r = await sb(c.env, 'grades', { method: 'POST', body: JSON.stringify(chunk) })
    if (r.ok) inserted += chunk.length
    else for (const row of chunk) { const r1 = await sb(c.env, 'grades', { method: 'POST', body: JSON.stringify(row) }); if (r1.ok) inserted++; else failures.push({ ...row, error: r1.data?.message || 'erreur' }) }
  }
  await audit(c.env, c, user, 'import_grades', 'grades', null, null, { inserted, errors: summary.error + failures.length })
  return c.json({ ok: true, summary: { ...summary, inserted, failed: failures.length }, report, failures })
})

export default app
