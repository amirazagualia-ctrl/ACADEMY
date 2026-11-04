// Routes reports
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getTeacherId, getUser, linkedIds, teacherAssignedIds } from '../lib/auth'
import { sha256Hex } from '../lib/crypto'
import { targetedSupported } from '../lib/notifications'
import { refreshAdminChatsCache } from '../lib/notify'
import { activeYear, currentYear, getSettings, sb } from '../lib/supabase'
import { TC } from '../lib/tenant'
import { clientIp, publicOrigin } from '../lib/utils'
import { dailyExamReminders } from './exams'
import { dailyFeesMaintenance } from './fees'
import { dailyHomeworkReminders, hwSupported } from './homeworks'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- F61 : Tableau de bord opérationnel — actions à traiter + agenda du jour ----------
app.get('/api/dashboard/todo', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const today = new Date().toISOString().slice(0, 10)
  const dow = ((new Date().getDay() + 6) % 7) + 1 // 1 = lundi … 7 = dimanche
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const cy = await currentYear(c.env); const yf = cy ? `&school_year=eq.${cy}` : ''
  let ids: number[] | null = null; let levels: string[] = []
  if (user.role === 'parent' || user.role === 'student') { ids = linkedIds(user); if (!ids.length) { const acc = (await sb(c.env, `user_accounts?id=eq.${user.id}&select=linked_student_id,linked_student_ids`)).data?.[0]; if (acc) ids = linkedIds(acc) } }
  if (user.role === 'teacher') { const a = await teacherAssignedIds(c.env, user); if (a !== null) ids = a }
  const idF = ids ? (ids.length ? `&student_id=in.(${ids.join(',')})` : '&student_id=eq.0') : ''
  const [regs, abs, fees, chats, events, hws, evals, studs, tts] = await Promise.all([
    user.role === 'admin' ? sb(c.env, 'registrations?status=eq.pending&select=id') : Promise.resolve({ data: [] }),
    sb(c.env, `attendance?status=eq.absent&date=gte.${since30}&select=id,student_id,date,notes${idF}&order=date.desc&limit=200`),
    user.role === 'student' ? Promise.resolve({ data: [] }) : sb(c.env, `fees?status=in.(overdue,pending)&select=id,amount,status,due_date,student_id${idF}${yf}&order=due_date.asc&limit=200`),
    sb(c.env, `notifications?type=eq.chat&status=eq.unread&select=id,title,student_id${idF}&order=created_at.desc&limit=100`),
    sb(c.env, `events?or=(date.eq.${today},and(date.lte.${today},end_date.gte.${today}))&select=id,title,type,date,end_date,level&order=date.asc&limit=20`),
    sb(c.env, `homeworks?due_at=gte.${today}T00:00:00&due_at=lte.${today}T23:59:59&status=eq.published&select=id,title,level,due_at${yf}&limit=20`),
    sb(c.env, `evaluations?status=eq.published&due_at=gte.${today}T00:00:00&due_at=lte.${today}T23:59:59&select=id,title,level,due_at&deleted_at=is.null&limit=20`),
    ids ? sb(c.env, `students?id=in.(${ids.length ? ids.join(',') : 0})&select=id,first_name,last_name,level,photo_url`) : Promise.resolve({ data: [] }),
    sb(c.env, 'settings?key=like.timetable_*&select=key,value')
  ])
  if (ids) levels = [...new Set((studs.data || []).map((s: any) => s.level as string).filter(Boolean))] as string[]
  // Messages non lus : côté staff = envoyés par les parents ; côté parent = envoyés par le staff
  const unreadChats = (chats.data || []).filter((n: any) => user.role === 'parent' || user.role === 'student' ? String(n.title || '').startsWith('staff:') : String(n.title || '').startsWith('parent:'))
  // Absences non justifiées (pas de note « justif »)
  const unjustified = (abs.data || []).filter((a: any) => !/justif|excus|certif|مبرر/i.test(a.notes || ''))
  // Cours du jour : créneaux de l'emploi du temps (enseignant : ses créneaux ; parent/élève : niveaux des enfants ; admin : tous)
  let tid: number | null = null; if (user.role === 'teacher') tid = await getTeacherId(c.env, user)
  const courses: any[] = []
  for (const row of tts.data || []) { const lvl = String(row.key).replace('timetable_', ''); for (const s of (row.value?.slots || [])) { if (Number(s.day) !== dow) continue; if (tid && Number(s.teacher_id) !== tid) continue; if (ids && !levels.includes(lvl)) continue; courses.push({ level: lvl, start: s.start, end: s.end, subject: s.subject, room: s.room, teacher_id: s.teacher_id }) } }
  courses.sort((a, b) => String(a.start).localeCompare(String(b.start)))
  const filtLvl = (arr: any[]) => ids ? arr.filter((x: any) => !x.level || levels.includes(x.level)) : arr
  const feesArr = fees.data || []
  return c.json({
    actions: {
      registrations_pending: (regs.data || []).length,
      absences_unjustified: unjustified.length,
      fees_overdue: feesArr.filter((f: any) => f.status === 'overdue').length,
      fees_overdue_amount: feesArr.filter((f: any) => f.status === 'overdue').reduce((s: number, f: any) => s + Number(f.amount || 0), 0),
      fees_pending: feesArr.filter((f: any) => f.status === 'pending').length,
      next_due: feesArr.find((f: any) => f.status !== 'overdue' && f.due_date >= today) || null,
      messages_unread: unreadChats.length
    },
    today: { date: today, courses: courses.slice(0, 12), events: filtLvl(events.data || []), homeworks: filtLvl(hws.data || []), evaluations: filtLvl(evals.data || []) },
    children: studs.data || []
  })
})

// ---------- Statistiques dashboard ----------
app.get('/api/stats', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  // Maintenance quotidienne des frais (mensualités + retards) — 1×/jour, non bloquante
  try { await dailyFeesMaintenance(c.env) } catch (e) { /* non bloquant */ }
  try { await dailyExamReminders(c.env, publicOrigin(c)) } catch (e) { /* non bloquant */ }
  try { await dailyHomeworkReminders(c.env) } catch (e) { /* non bloquant */ }
  if (!TC._adminChatsCache || Date.now() - TC._adminChatsCache.at > 3600_000) refreshAdminChatsCache(c.env).catch(() => {})
  let ids = linkedIds(user)
  let scoped = (user.role === 'parent' || user.role === 'student') && ids.length > 0
  // Enseignant : statistiques limitées à ses élèves affectés
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null) { ids = aids.length ? aids : [0]; scoped = true }
  }
  const idFilter = scoped ? `&student_id=in.(${ids.join(',')})` : ''
  const stFilter = scoped ? `&id=in.(${ids.join(',')})` : ''
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  // F61 : période optionnelle (?from=YYYY-MM-DD&to=YYYY-MM-DD) appliquée aux présences et aux frais (échéance / paiement dans la période)
  const isDate = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const pFrom = isDate(c.req.query('from')) ? c.req.query('from')! : monthStart
  const pTo = isDate(c.req.query('to')) ? c.req.query('to')! : today
  const periodFilter = `&or=(and(due_date.gte.${pFrom},due_date.lte.${pTo}),and(paid_date.gte.${pFrom},paid_date.lte.${pTo}))`
  const [students, teachers, fees, attToday, attMonth, notifs, feesPeriod, attPeriod, newStudents] = await Promise.all([
    sb(c.env, `students?select=id,cycle,status${stFilter}`),
    sb(c.env, 'teachers?select=id'),
    sb(c.env, `fees?select=id,amount,status${idFilter}`),
    sb(c.env, `attendance?date=eq.${today}&select=status${idFilter}`),
    sb(c.env, `attendance?date=gte.${monthStart}&select=status,student_id${idFilter}`),
    sb(c.env, `notifications?select=id,type,title,message,created_at,student_id&order=created_at.desc&limit=10${idFilter}`),
    sb(c.env, `fees?select=id,amount,status,due_date,paid_date${idFilter}${periodFilter}`),
    sb(c.env, `attendance?date=gte.${pFrom}&date=lte.${pTo}&select=status${idFilter}`),
    sb(c.env, `students?select=id&created_at=gte.${pFrom}&created_at=lte.${pTo}T23:59:59${stFilter}`)
  ])
  const feesArr = fees.data || []
  const fp = feesPeriod.data || []
  const sumBy = (arr: any[], st: string) => arr.filter((f: any) => f.status === st).reduce((s: number, f: any) => s + Number(f.amount), 0)
  const period = {
    from: pFrom, to: pTo,
    fees: { paid: fp.filter((f: any) => f.status === 'paid' && f.paid_date && f.paid_date >= pFrom && f.paid_date <= pTo).reduce((s: number, f: any) => s + Number(f.amount), 0), pending: sumBy(fp, 'pending'), overdue: sumBy(fp, 'overdue') },
    attendance: (attPeriod.data || []).reduce((a: any, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {}),
    new_students: newStudents.ok ? (newStudents.data || []).length : 0
  }
  return c.json({
    period,
    students: { total: (students.data || []).length, byCycle: (students.data || []).reduce((a: any, s: any) => { a[s.cycle] = (a[s.cycle] || 0) + 1; return a }, {}) },
    teachers: (teachers.data || []).length,
    fees: {
      paid: feesArr.filter((f: any) => f.status === 'paid').reduce((s: number, f: any) => s + Number(f.amount), 0),
      pending: feesArr.filter((f: any) => f.status === 'pending').reduce((s: number, f: any) => s + Number(f.amount), 0),
      overdue: feesArr.filter((f: any) => f.status === 'overdue').reduce((s: number, f: any) => s + Number(f.amount), 0)
    },
    attendanceToday: (attToday.data || []).reduce((a: any, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {}),
    attendanceMonth: (attMonth.data || []).reduce((a: any, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {}),
    notifications: notifs.data || []
  })
})

// ---------- Bulletin (données agrégées) ----------
app.get('/api/bulletin/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if ((user.role === 'parent' || user.role === 'student') && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  const trimester = c.req.query('trimester') || '1'
  const [st, gr, school] = await Promise.all([
    sb(c.env, `students?id=eq.${sid}&select=*`),
    sb(c.env, `grades?student_id=eq.${sid}&trimester=eq.${trimester}&select=*,subjects(name,coefficient)`),
    getSettings(c.env, 'school')
  ])
  const student = st.data?.[0]
  if (!student) return c.json({ error: 'Élève introuvable' }, 404)
  const grades = gr.data || []
  const bySubject: any = {}
  for (const g of grades) {
    const name = g.subjects?.name || 'Matière'
    if (!bySubject[name]) bySubject[name] = { name, coefficient: Number(g.subjects?.coefficient || 1), scores: [], comments: [] }
    bySubject[name].scores.push(Number(g.score) * 20 / Number(g.max_score || 20))
    if (g.comment) bySubject[name].comments.push(g.comment)
  }
  const subjects = Object.values(bySubject).map((s: any) => ({ ...s, average: s.scores.reduce((a: number, b: number) => a + b, 0) / s.scores.length }))
  const totalCoef = subjects.reduce((a: number, s: any) => a + s.coefficient, 0)
  const generalAverage = totalCoef ? subjects.reduce((a: number, s: any) => a + s.average * s.coefficient, 0) / totalCoef : 0
  // Signature parentale (accusé de lecture) pour ce bulletin, si la migration 0011 est appliquée
  let signature: any = null; let signSupported = false
  if (await sigSupported(c.env)) {
    signSupported = true
    const sg = await sb(c.env, `bulletin_signatures?student_id=eq.${sid}&trimester=eq.${trimester}&select=*`)
    signature = sg.data?.[0] || null
  }
  const fingerprint = await sha256Hex(bulletinFingerprintSource(grades, generalAverage))
  return c.json({ student, school, trimester: Number(trimester), subjects, generalAverage, gradesCount: grades.length, fingerprint, signature, signSupported, canSign: signSupported && user.role === 'parent' && !signature && grades.length > 0 })
})

// ---------- Progression par matière (graphes trimestre par trimestre) ----------
app.get('/api/progress/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if ((user.role === 'parent' || user.role === 'student') && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé' }, 403) }
  const st = (await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name`)).data?.[0]
  if (!st) return c.json({ error: 'Élève introuvable' }, 404)
  const yr = activeYear() || TC._currentYearCache?.label || null
  // Notes de l'élève (année active) + notes du niveau (comparaison) + historique toutes années (moyenne générale par année/trimestre)
  const [mine, level, hist, att] = await Promise.all([
    sb(c.env, `grades?student_id=eq.${sid}&select=subject_id,trimester,score,max_score,exam_type,created_at,subjects(name,coefficient)`),
    Promise.resolve(null),
    sb(c.env, `grades?student_id=eq.${sid}&select=trimester,score,max_score,school_year,subjects(coefficient)&school_year=not.is.null`),
    sb(c.env, `attendance?student_id=eq.${sid}&select=status,date`)
  ])
  // Comparaison : notes des élèves du même niveau (année active)
  const peersIds = ((await sb(c.env, `students?level=eq.${encodeURIComponent(st.level)}&status=eq.actif&select=id`)).data || []).map((x: any) => x.id)
  const peers = peersIds.length ? (await sb(c.env, `grades?student_id=in.(${peersIds.join(',')})&select=student_id,subject_id,trimester,score,max_score,subjects(coefficient)`)).data || [] : []
  const n20 = (g: any) => Number(g.score) * 20 / Number(g.max_score || 20)
  // Par matière × trimestre
  const subjects: Record<string, any> = {}
  for (const g of mine.data || []) {
    const name = g.subjects?.name || 'Matière'; const t = Number(g.trimester)
    subjects[name] = subjects[name] || { name, coefficient: Number(g.subjects?.coefficient || 1), byTrim: { 1: [], 2: [], 3: [] }, notes: [] }
    if (subjects[name].byTrim[t]) subjects[name].byTrim[t].push(n20(g))
    subjects[name].notes.push({ trimester: t, score: Number(g.score), max_score: Number(g.max_score || 20), exam_type: g.exam_type, date: g.created_at })
  }
  const avg = (a: number[]) => a.length ? Number((a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)) : null
  // Moyenne du niveau par matière × trimestre
  const peerBy: Record<string, Record<number, Record<number, number[]>>> = {} // subject_id → trimester → student → scores
  for (const g of peers) { const sj = g.subject_id, t = Number(g.trimester); peerBy[sj] = peerBy[sj] || {}; peerBy[sj][t] = peerBy[sj][t] || {}; (peerBy[sj][t][g.student_id] = peerBy[sj][t][g.student_id] || []).push(n20(g)) }
  const subjIdByName: Record<string, number> = {}; for (const g of mine.data || []) subjIdByName[g.subjects?.name || 'Matière'] = g.subject_id
  const out = Object.values(subjects).map((s: any) => {
    const sjId = subjIdByName[s.name]
    const trims = [1, 2, 3].map(t => {
      const me = avg(s.byTrim[t])
      const peerAvgs = Object.values(peerBy[sjId]?.[t] || {}).map((arr: any) => avg(arr)).filter((x: any) => x !== null) as number[]
      const cls = avg(peerAvgs); const rank = me !== null ? peerAvgs.filter(x => x > me).length + 1 : null
      return { trimester: t, average: me, class_average: cls, rank, class_size: peerAvgs.length }
    })
    const vals = trims.map(x => x.average).filter(x => x !== null) as number[]
    const trend = vals.length >= 2 ? Number((vals[vals.length - 1] - vals[vals.length - 2]).toFixed(2)) : null
    return { name: s.name, coefficient: s.coefficient, trimesters: trims, trend, notes: s.notes.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')) }
  }).sort((a, b) => a.name.localeCompare(b.name))
  // Moyenne générale par trimestre (élève et niveau)
  const general = [1, 2, 3].map(t => {
    let tc = 0, tot = 0
    for (const s of out) { const m = s.trimesters[t - 1].average; if (m !== null) { tc += s.coefficient; tot += m * s.coefficient } }
    // niveau : moyenne générale par élève puis moyenne
    const perStudent: Record<number, { tc: number; tot: number }> = {}
    for (const g of peers) { if (Number(g.trimester) !== t) continue; const coef = Number(g.subjects?.coefficient || 1); perStudent[g.student_id] = perStudent[g.student_id] || { tc: 0, tot: 0 } }
    for (const [sj, byT] of Object.entries(peerBy)) { const byS = byT[t] || {}; for (const [stu, arr] of Object.entries(byS)) { const coef = Number((peers.find((g: any) => g.subject_id === Number(sj))?.subjects?.coefficient) || 1); const m = avg(arr as number[])!; perStudent[Number(stu)] = perStudent[Number(stu)] || { tc: 0, tot: 0 }; perStudent[Number(stu)].tc += coef; perStudent[Number(stu)].tot += m * coef } }
    const classAvgs = Object.values(perStudent).filter(x => x.tc > 0).map(x => x.tot / x.tc)
    const me = tc ? Number((tot / tc).toFixed(2)) : null
    return { trimester: t, average: me, class_average: avg(classAvgs), rank: me !== null ? classAvgs.filter(x => x > me).length + 1 : null, class_size: classAvgs.length }
  })
  // Historique pluriannuel (moyenne générale par année/trimestre)
  const histBy: Record<string, Record<number, { tc: number; tot: number; bySub: Record<string, number[]> }>> = {}
  for (const g of hist.data || []) { const y = g.school_year, t = Number(g.trimester); histBy[y] = histBy[y] || {}; histBy[y][t] = histBy[y][t] || { tc: 0, tot: 0, bySub: {} } }
  // simplification : moyenne simple des notes /20 par année-trimestre (les coefficients par matière nécessitent subject_id ; acceptable pour une tendance)
  const histSimple: Record<string, Record<number, number[]>> = {}
  for (const g of hist.data || []) { const y = g.school_year, t = Number(g.trimester); histSimple[y] = histSimple[y] || {}; (histSimple[y][t] = histSimple[y][t] || []).push(n20(g)) }
  const history = Object.keys(histSimple).sort().map(y => ({ school_year: y, trimesters: [1, 2, 3].map(t => avg(histSimple[y][t] || [])) }))
  // Assiduité par trimestre (année active) : T1 sept-déc, T2 janv-mars, T3 avr-juin
  const trimOf = (d: string) => { const m = Number(d.slice(5, 7)); return m >= 9 ? 1 : m <= 3 ? 2 : 3 }
  const attendance = [1, 2, 3].map(t => { const rows = (att.data || []).filter((a: any) => trimOf(a.date) === t); const abs = rows.filter((a: any) => a.status === 'absent').length; return { trimester: t, days: rows.length, absences: abs, lates: rows.filter((a: any) => a.status === 'retard').length, rate: rows.length ? Math.round((rows.length - abs) * 100 / rows.length) : null } })
  return c.json({ student: st, school_year: yr, subjects: out, general, history, attendance })
})

// ---------- Détection précoce : élèves en difficulté (admin / enseignant) ----------
// Critères : moyenne du trimestre < 10, matières < 10, absences (30 j) >= seuil, retards, devoirs non rendus (échus), frais en retard.
app.get('/api/alerts/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const trimester = Number(c.req.query('trimester') || currentTrimester())
  const absThreshold = Number(c.req.query('abs') || 3)
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  let idFilter = ''
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) idFilter = `&student_id=in.(${aids.length ? aids.join(',') : 0})` }
  const stFilter = idFilter ? idFilter.replace('&student_id=', '&id=') : ''
  const hw = await hwSupported(c.env)
  const nowIso = new Date().toISOString()
  const [st, gr, att, fees, hws, subs] = await Promise.all([
    sb(c.env, `students?status=eq.actif&select=id,first_name,last_name,level,class_name,parent_name,parent_phone${stFilter}`),
    sb(c.env, `grades?trimester=eq.${trimester}&select=student_id,subject_id,score,max_score,subjects(name,coefficient)${idFilter}`),
    sb(c.env, `attendance?date=gte.${since}&status=in.(absent,retard)&select=student_id,status,date${idFilter}`),
    sb(c.env, `fees?status=in.(overdue,pending)&select=student_id,amount,due_date,status${idFilter}`),
    hw ? sb(c.env, `homeworks?status=eq.published&due_at=lt.${nowIso}&select=id,title,level,due_at`) : Promise.resolve({ data: [] } as any),
    hw ? sb(c.env, `homework_submissions?select=homework_id,student_id`) : Promise.resolve({ data: [] } as any)
  ])
  const today = new Date().toISOString().slice(0, 10)
  const byStudent: Record<number, any> = {}
  for (const s of st.data || []) byStudent[s.id] = { student: s, avg: null, weakSubjects: [] as any[], absences: 0, lates: 0, missingHomeworks: [] as any[], overdueFees: 0, overdueAmount: 0, reasons: [] as string[], score: 0 }
  // Moyennes
  const grByS: Record<number, Record<string, { coef: number; s: number[] }>> = {}
  for (const g of gr.data || []) {
    const b = byStudent[g.student_id]; if (!b) continue
    const name = g.subjects?.name || 'Matière'
    grByS[g.student_id] = grByS[g.student_id] || {}
    grByS[g.student_id][name] = grByS[g.student_id][name] || { coef: Number(g.subjects?.coefficient || 1), s: [] }
    grByS[g.student_id][name].s.push(Number(g.score) * 20 / Number(g.max_score || 20))
  }
  for (const [sid, subsMap] of Object.entries(grByS)) {
    const b = byStudent[Number(sid)]; let tc = 0, tot = 0
    for (const [name, v] of Object.entries(subsMap)) { const m = v.s.reduce((a, x) => a + x, 0) / v.s.length; tc += v.coef; tot += m * v.coef; if (m < 10) b.weakSubjects.push({ name, average: Number(m.toFixed(2)) }) }
    b.avg = tc ? Number((tot / tc).toFixed(2)) : null
  }
  for (const a of att.data || []) { const b = byStudent[a.student_id]; if (!b) continue; if (a.status === 'absent') b.absences++; else b.lates++ }
  for (const f of fees.data || []) { const b = byStudent[f.student_id]; if (!b) continue; if (f.status === 'overdue' || (f.due_date && f.due_date < today)) { b.overdueFees++; b.overdueAmount += Number(f.amount || 0) } }
  if (hw) {
    const submitted = new Set((subs.data || []).map((x: any) => `${x.homework_id}:${x.student_id}`))
    for (const h of hws.data || []) for (const b of Object.values(byStudent)) if (b.student.level === h.level && !submitted.has(`${h.id}:${b.student.id}`)) b.missingHomeworks.push({ id: h.id, title: h.title, due_at: h.due_at })
  }
  const items = Object.values(byStudent).map((b: any) => {
    if (b.avg !== null && b.avg < 10) { b.reasons.push('moyenne'); b.score += 3 + (10 - b.avg) / 2 }
    else if (b.weakSubjects.length) { b.reasons.push('matieres'); b.score += b.weakSubjects.length }
    if (b.absences >= absThreshold) { b.reasons.push('absences'); b.score += 2 + (b.absences - absThreshold) * 0.5 }
    if (b.lates >= 3) { b.reasons.push('retards'); b.score += 1 }
    if (b.missingHomeworks.length >= 2) { b.reasons.push('devoirs'); b.score += 1 + b.missingHomeworks.length * 0.5 }
    if (b.overdueFees > 0 && user.role === 'admin') { b.reasons.push('frais'); b.score += 1 }
    return b
  }).filter((b: any) => b.reasons.length).sort((a: any, b: any) => b.score - a.score)
  return c.json({ trimester, since, absThreshold, hwSupported: hw, total: (st.data || []).length, items })
})
function currentTrimester(): number { const m = new Date().getMonth() + 1; return m >= 9 || m <= 12 ? 1 : m <= 3 ? 2 : 3 }

// ---------- Signature du bulletin par le parent (accusé de lecture horodaté) ----------
// (per-tenant) let _sigSupported: { ok: boolean; at: number } | null = null
async function sigSupported(env: Bindings) {
  if (TC._sigSupported && (TC._sigSupported.ok || Date.now() - TC._sigSupported.at < 300000)) return TC._sigSupported.ok
  const p = await sb(env, 'bulletin_signatures?select=id&limit=1&school_year=not.is.null'); TC._sigSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
// Empreinte du contenu signé : ids/notes triés + moyenne (permet de prouver que le bulletin n'a pas changé depuis la signature)
function bulletinFingerprintSource(grades: any[], avg: number) {
  return grades.map(g => `${g.id}:${g.subject_id}:${g.score}/${g.max_score || 20}`).sort().join('|') + `|avg=${avg.toFixed(2)}`
}
app.post('/api/bulletin/:studentId/sign', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (user.role !== 'parent') return c.json({ error: 'Seul un parent/tuteur peut signer le bulletin' }, 403)
  const sid = Number(c.req.param('studentId'))
  if (!linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await sigSupported(c.env))) return c.json({ error: 'Module signature non installé (migration 0011)' }, 501)
  const body = await c.req.json().catch(() => ({}))
  const trimester = Number(body.trimester)
  if (![1, 2, 3].includes(trimester)) return c.json({ error: 'Trimestre invalide' }, 400)
  if (!body.confirm) return c.json({ error: 'Confirmation requise' }, 400)
  const yr = activeYear() || TC._currentYearCache?.label
  if (!yr) return c.json({ error: 'Année scolaire inconnue' }, 400)
  const gr = await sb(c.env, `grades?student_id=eq.${sid}&trimester=eq.${trimester}&select=id,subject_id,score,max_score,subjects(coefficient)`)
  const grades = gr.data || []
  if (!grades.length) return c.json({ error: 'Aucune note à signer pour ce trimestre' }, 400)
  const bySub: any = {}
  for (const g of grades) { const k = g.subject_id; if (!bySub[k]) bySub[k] = { coef: Number(g.subjects?.coefficient || 1), s: [] as number[] }; bySub[k].s.push(Number(g.score) * 20 / Number(g.max_score || 20)) }
  const subs: any[] = Object.values(bySub); const tc = subs.reduce((a, x) => a + x.coef, 0)
  const avg = tc ? subs.reduce((a, x) => a + (x.s.reduce((p: number, q: number) => p + q, 0) / x.s.length) * x.coef, 0) / tc : 0
  const fingerprint = await sha256Hex(bulletinFingerprintSource(grades, avg))
  const row = { student_id: sid, trimester, school_year: yr, signed_by: user.id, signer_name: user.name || null, signer_email: user.email || null, ip: clientIp(c), user_agent: (c.req.header('User-Agent') || '').slice(0, 250), general_average: Number(avg.toFixed(2)), grades_count: grades.length, fingerprint, comment: (body.comment || '').toString().slice(0, 500) || null }
  const r = await sb(c.env, 'bulletin_signatures', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: r.status === 409 ? 'Bulletin déjà signé' : (r.data?.message || 'Erreur') }, r.status === 409 ? 409 : 500)
  const sig = Array.isArray(r.data) ? r.data[0] : r.data
  await audit(c.env, c, user, 'sign_bulletin', 'bulletin_signatures', sig?.id, null, { student_id: sid, trimester, fingerprint })
  // Notification interne aux admins (feed) — non bloquante
  try {
    const st = await sb(c.env, `students?id=eq.${sid}&select=first_name,last_name,level`); const s0 = st.data?.[0]
    if (await targetedSupported(c.env)) await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: null, type: 'bulletin', title: `✍️ Bulletin T${trimester} signé`, message: `${user.name || 'Le parent'} a signé le bulletin du trimestre ${trimester} de ${s0?.first_name || ''} ${s0?.last_name || ''} (${s0?.level || ''}). Moyenne : ${avg.toFixed(2)}/20.`, recipient: 'Administration', sent_via: 'app', status: 'sent', audience: ['admin'], level: s0?.level || null, ref_table: 'bulletin_signatures', ref_id: Number(sig?.id || 0), link: '#grades', created_by: user.id }) })
  } catch {}
  return c.json({ ok: true, signature: sig })
})
// Admin : annuler une signature (erreur du parent, notes corrigées → nouvelle signature requise)
app.delete('/api/bulletin-signatures/:id', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `bulletin_signatures?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Signature introuvable' }, 404)
  const r = await sb(c.env, `bulletin_signatures?id=eq.${id}`, { method: 'DELETE' })
  if (!r.ok) return c.json({ error: 'Erreur' }, 500)
  await audit(c.env, c, user, 'revoke_bulletin_signature', 'bulletin_signatures', id, before, null)
  return c.json({ ok: true })
})
// Suivi admin/enseignant : état des signatures d'un trimestre (qui a signé / pas encore)
app.get('/api/bulletin-signatures', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await sigSupported(c.env))) return c.json({ supported: false, items: [] })
  const trimester = Number(c.req.query('trimester') || 1)
  const level = c.req.query('level')
  let q = `students?select=id,first_name,last_name,level,parent_name,parent_phone&status=eq.actif&order=level.asc,last_name.asc`
  if (level) q += `&level=eq.${encodeURIComponent(level)}`
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) q += `&id=in.(${aids.length ? aids.join(',') : 0})` }
  const [st, sg, gr] = await Promise.all([
    sb(c.env, q),
    sb(c.env, `bulletin_signatures?trimester=eq.${trimester}&select=id,student_id,signed_at,signer_name,general_average,comment`),
    sb(c.env, `grades?trimester=eq.${trimester}&select=student_id`)
  ])
  const sigBy: any = {}; (sg.data || []).forEach((x: any) => { sigBy[x.student_id] = x })
  const hasGrades = new Set((gr.data || []).map((g: any) => g.student_id))
  const items = (st.data || []).map((s: any) => ({ ...s, has_grades: hasGrades.has(s.id), signature: sigBy[s.id] || null }))
  return c.json({ supported: true, trimester, items })
})

export default app
