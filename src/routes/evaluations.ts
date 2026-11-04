// Routes evaluations
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getTeacherId, getUser, linkedIds } from '../lib/auth'
import { broadcastTargeted, notifyParent, userLevels } from '../lib/notifications'
import { currentYear, sb } from '../lib/supabase'
import { TC } from '../lib/tenant'
import { publicOrigin } from '../lib/utils'
import { AI_DAILY_LIMIT, aiBump, aiCharge, aiEngines, aiUsageToday, llmChat } from './ai'
import { CERT_LEVELS } from './certificates'
import { curContext, curSupported } from './curriculum'
import { hwScope } from './homeworks'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Feature 54 : Constructeur d'évaluations (prérequis / contrôles / synthèses) ----------
// Une évaluation = sections (Lecture-compréhension, Langue, Production écrite…) contenant des items typés.
// Types d'items : mcq (QCM), truefalse, match (relier), strike (barrer le faux), fill (compléter), quote (relever une phrase),
// conjug (verbes au présent…), open (production écrite / réponse libre). Auto-correction pour mcq/truefalse/match/strike/fill/conjug.
// (per-tenant) let _evaSupported: { ok: boolean; at: number } | null = null
async function evaSupported(env: Bindings) {
  if (TC._evaSupported && (TC._evaSupported.ok || Date.now() - TC._evaSupported.at < 300000)) return TC._evaSupported.ok
  const p = await sb(env, 'evaluations?select=id&limit=1'); TC._evaSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
const EVA_SEL = 'select=*,subjects(name),teachers(first_name,last_name,subject)'
const EVA_AUTO_TYPES = ['mcq', 'truefalse', 'match', 'strike', 'fill', 'conjug']
const evaNorm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
// Points par item + total ; corrige automatiquement ce qui peut l'être
function evaAutoCorrect(sections: any[], answers: Record<string, any>) {
  const item_scores: Record<string, number> = {}; let auto = 0, max = 0, manual = 0
  sections.forEach((s: any, si: number) => (s.items || []).forEach((it: any, ii: number) => {
    const key = `s${si}i${ii}`; const pts = Number(it.points) || 0; max += pts
    const a = answers?.[key]
    if (!EVA_AUTO_TYPES.includes(it.type)) { manual += pts; return }
    let ok = 0, n = 1
    if (it.type === 'mcq' || it.type === 'truefalse') ok = Number(a) === Number(it.correct) ? 1 : 0
    else if (it.type === 'match') { const pairs = it.pairs || []; n = pairs.length || 1; ok = pairs.filter((p: any, i: number) => Number(a?.[i]) === Number(p.right)).length }
    else if (it.type === 'strike') { const opts = it.options || []; n = opts.length || 1; ok = opts.filter((o: any, i: number) => !!a?.[i] === !!o.false).length }
    else if (it.type === 'fill' || it.type === 'conjug') { const blanks = it.blanks || []; n = blanks.length || 1; ok = blanks.filter((b: any, i: number) => { const acc = [b.answer, ...(b.alt || [])].map(evaNorm); return acc.includes(evaNorm(a?.[i])) }).length }
    const sc = Math.round(pts * ok / n * 100) / 100
    item_scores[key] = sc; auto += sc
  }))
  return { item_scores, auto_score: Math.round(auto * 100) / 100, max, manual_points: manual }
}
async function evaScopeCheck(env: Bindings, user: any, ev: any) {
  if (user.role === 'admin') return true
  if (user.role === 'teacher') return Number(ev.teacher_id) === await getTeacherId(env, user)
  return false
}
// Sources disponibles pour construire une évaluation : cours (PDF/images) + cours interactifs du niveau
app.get('/api/evaluations/sources', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const level = c.req.query('level') || ''
  const f = level ? `&level=eq.${encodeURIComponent(level)}` : ''
  const [cr, ic] = await Promise.all([
    sb(c.env, `courses?select=id,title,level,file_url,file_name,file_type,description,subject_id,created_at&deleted_at=is.null${f}&order=created_at.desc&limit=100`),
    sb(c.env, `interactive_courses?select=id,title,level,course_type,content,description,subject_id,created_at&deleted_at=is.null${f}&order=created_at.desc&limit=100`)
  ])
  return c.json({ courses: cr.data || [], interactive: ic.data || [] })
})
app.get('/api/evaluations', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await evaSupported(c.env))) return c.json({ supported: false, items: [] })
  const sc = await hwScope(c.env, user)
  let q = `evaluations?${EVA_SEL}&deleted_at=is.null&order=created_at.desc&limit=300`
  if (user.role === 'teacher') { if (!sc.teacherId) return c.json({ supported: true, items: [] }); q += c.req.query('mine') === '0' && sc.levels?.length ? `&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})` : `&or=(teacher_id.eq.${sc.teacherId},created_by.eq.${user.id},shared_with.cs.{${user.id}})` }
  if (['parent', 'student'].includes(user.role)) { if (!sc.levels?.length) return c.json({ supported: true, items: [] }); q += `&status=eq.published&online=is.true&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})` }
  const items = (await sb(c.env, q)).data || []
  if (!items.length) return c.json({ supported: true, items: [] })
  let aq = `evaluation_attempts?evaluation_id=in.(${items.map((e: any) => e.id).join(',')})&select=id,evaluation_id,student_id,status,score,auto_score,max_score,submitted_at,graded_at,students(first_name,last_name,level)`
  if (sc.studentIds) aq += sc.studentIds.length ? `&student_id=in.(${sc.studentIds.join(',')})` : '&student_id=eq.0'
  const atts = (await sb(c.env, aq)).data || []
  const levels = Array.from(new Set(items.map((e: any) => e.level)))
  let stq = `students?status=eq.actif&level=in.(${levels.map(l => `"${l}"`).join(',')})&select=id,level`
  if (sc.studentIds) stq += sc.studentIds.length ? `&id=in.(${sc.studentIds.join(',')})` : '&id=eq.0'
  const studs = (await sb(c.env, stq)).data || []
  const out = items.map((e: any) => {
    const ea = atts.filter((a: any) => a.evaluation_id === e.id)
    const family = ['parent', 'student'].includes(user.role)
    return { ...e, sections: family ? undefined : e.sections, items_count: (e.sections || []).reduce((n: number, s: any) => n + (s.items || []).length, 0), total_students: studs.filter((s: any) => s.level === e.level).length, attempted: ea.length, graded: ea.filter((a: any) => a.status === 'graded').length, avg: ea.filter((a: any) => a.score != null).length ? Math.round(ea.filter((a: any) => a.score != null).reduce((x: number, a: any) => x + Number(a.score) / Number(a.max_score || e.total_points || 20) * 20, 0) / ea.filter((a: any) => a.score != null).length * 10) / 10 : null, my_attempts: family ? ea : undefined }
  })
  return c.json({ supported: true, items: out })
})
// Détail (avec sections) : staff = tout ; famille = sans corrigés (pour la passation)
app.get('/api/evaluations/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const id = Number(c.req.param('id'))
  const ev = (await sb(c.env, `evaluations?id=eq.${id}&deleted_at=is.null&${EVA_SEL}`)).data?.[0]
  if (!ev) return c.json({ error: 'Évaluation introuvable' }, 404)
  if (['admin', 'teacher'].includes(user.role)) {
    const atts = (await sb(c.env, `evaluation_attempts?evaluation_id=eq.${id}&select=*,students(first_name,last_name,level)&order=submitted_at.desc`)).data || []
    return c.json({ ...ev, attempts: atts })
  }
  const lv = await userLevels(c.env, user)
  if (ev.status !== 'published' || !ev.online || !(lv || []).includes(ev.level)) return c.json({ error: 'Accès refusé' }, 403)
  const ids = linkedIds(user)
  const atts = ids.length ? (await sb(c.env, `evaluation_attempts?evaluation_id=eq.${id}&student_id=in.(${ids.join(',')})&select=*`)).data || [] : []
  // Retirer les corrigés
  const sections = (ev.sections || []).map((s: any) => ({ ...s, items: (s.items || []).map((it: any) => { const { correct, blanks, pairs, options, ...rest } = it; return { ...rest, options: options ? options.map((o: any) => typeof o === 'string' ? o : { text: o.text }) : undefined, pairs: pairs ? pairs.map((p: any) => ({ left: p.left })) : undefined, rights: it.rights, blanks: blanks ? blanks.map(() => ({})) : undefined } }) }))
  return c.json({ ...ev, sections, attempts: atts })
})
app.post('/api/evaluations', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!b.title || !b.level) return c.json({ error: 'Titre et niveau requis' }, 400)
  const sections = Array.isArray(b.sections) ? b.sections : []
  const langOk = ['fr', 'ar', 'en'].includes(b.lang) ? b.lang : 'fr'
  const total = sections.reduce((n: number, s: any) => n + (s.items || []).reduce((m: number, it: any) => m + (Number(it.points) || 0), 0), 0)
  const tid = user.role === 'teacher' ? await getTeacherId(c.env, user) : (b.teacher_id || null)
  const row: any = { title: b.title, kind: b.kind || 'prerequis', subject_id: b.subject_id || null, level: b.level, teacher_id: tid, trimester: [1, 2, 3].includes(Number(b.trimester)) ? Number(b.trimester) : 1, duration_min: b.duration_min ? Number(b.duration_min) : null, lang: langOk, sections, total_points: total || Number(b.total_points) || 20, source: b.source || {}, status: ['draft', 'published', 'closed'].includes(b.status) ? b.status : 'draft', online: b.online !== false, count_in_term: !!b.count_in_term, due_at: b.due_at || null, created_by: user.id, school_year: await currentYear(c.env) }
  if (b.header) row.header = b.header; if (b.folder) row.folder = b.folder; if (b.is_template) row.is_template = true; if (b.shuffle) row.shuffle = true
  if ((b.cur_level_subject_id || b.cur_chapter_ids || b.cur_notion_ids) && await curSupported(c.env)) { row.cur_level_subject_id = Number(b.cur_level_subject_id) || null; row.cur_chapter_ids = (b.cur_chapter_ids || []).map(Number); row.cur_notion_ids = (b.cur_notion_ids || []).map(Number) }
  const r = await sb(c.env, `evaluations?${EVA_SEL}`, { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur création', detail: r.data }, 500)
  const ev = r.data[0]
  await audit(c.env, c, user, 'create', 'evaluations', ev.id, null, { title: ev.title, level: ev.level, items: total })
  if (ev.status === 'published' && ev.online) { try { await broadcastTargeted(c.env, publicOrigin(c), { type: 'cours', title: `📝 Nouvelle évaluation (${ev.level})`, message: `« ${ev.title} » est disponible en ligne.${ev.due_at ? ' À faire avant le ' + new Date(ev.due_at).toLocaleDateString('fr-FR') : ''} — تقييم جديد`, level: ev.level, ref_table: 'evaluations', ref_id: Number(ev.id), link: `#evaluations`, created_by: user.id }) } catch {} }
  return c.json(ev, 201)
})
app.put('/api/evaluations/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `evaluations?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Évaluation introuvable' }, 404)
  if (!(await evaScopeCheck(c.env, user, before)) && Number(before.created_by) !== user.id && !(before.shared_edit && (before.shared_with || []).includes(user.id))) return c.json({ error: 'Vous ne pouvez modifier que vos évaluations' }, 403)
  const b = await c.req.json(); const patch: any = { updated_at: new Date().toISOString() }
  for (const k of ['title', 'kind', 'subject_id', 'level', 'trimester', 'duration_min', 'lang', 'sections', 'source', 'status', 'online', 'count_in_term', 'due_at', 'header', 'folder', 'is_template', 'shuffle']) if (k in b) patch[k] = b[k]
  if (('cur_level_subject_id' in b || 'cur_chapter_ids' in b || 'cur_notion_ids' in b) && await curSupported(c.env)) for (const k of ['cur_level_subject_id', 'cur_chapter_ids', 'cur_notion_ids']) if (k in b) patch[k] = b[k]
  if (patch.sections) patch.total_points = patch.sections.reduce((n: number, s: any) => n + (s.items || []).reduce((m: number, it: any) => m + (Number(it.points) || 0), 0), 0) || before.total_points
  const r = await sb(c.env, `evaluations?id=eq.${id}&${EVA_SEL}`, { method: 'PATCH', body: JSON.stringify(patch) })
  await audit(c.env, c, user, 'update', 'evaluations', id, { status: before.status }, { status: patch.status, keys: Object.keys(patch) })
  const ev = r.data?.[0] || before
  if (before.status !== 'published' && patch.status === 'published' && ev.online) { try { await broadcastTargeted(c.env, publicOrigin(c), { type: 'cours', title: `📝 Nouvelle évaluation (${ev.level})`, message: `« ${ev.title} » est disponible en ligne. — تقييم جديد`, level: ev.level, ref_table: 'evaluations', ref_id: id, link: `#evaluations`, created_by: user.id }) } catch {} }
  return c.json(ev)
})
app.delete('/api/evaluations/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `evaluations?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Évaluation introuvable' }, 404)
  if (!(await evaScopeCheck(c.env, user, before)) && Number(before.created_by) !== user.id) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `evaluations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: user.id }) })
  await audit(c.env, c, user, 'soft_delete', 'evaluations', id, { title: before.title }, null)
  return c.json({ ok: r.ok, soft: true })
})
// Dupliquer (pour adapter à un autre niveau / une autre classe)
app.post('/api/evaluations/:id/duplicate', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const src = (await sb(c.env, `evaluations?id=eq.${Number(c.req.param('id'))}&select=*`)).data?.[0]
  if (!src) return c.json({ error: 'Introuvable' }, 404)
  const { id, created_at, updated_at, deleted_at, deleted_by, ...rest } = src
  const row = { ...rest, title: src.title + ' (copie)', status: 'draft', created_by: user.id, teacher_id: user.role === 'teacher' ? await getTeacherId(c.env, user) : src.teacher_id, school_year: await currentYear(c.env) }
  const r = await sb(c.env, `evaluations?${EVA_SEL}`, { method: 'POST', body: JSON.stringify(row) })
  return c.json(r.data?.[0] || { error: 'Erreur' }, r.ok ? 201 : 500)
})
// Passation en ligne (élève / parent pour un enfant lié) : auto-correction immédiate des items fermés
app.post('/api/evaluations/:id/submit', async (c) => {
  const user = await getUser(c)
  if (!user || !['student', 'parent'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const ev = (await sb(c.env, `evaluations?id=eq.${id}&deleted_at=is.null&select=*`)).data?.[0]
  if (!ev || ev.status !== 'published' || !ev.online) return c.json({ error: 'Évaluation non disponible' }, 404)
  const b = await c.req.json()
  const sid = Number(b.student_id) || linkedIds(user)[0]
  if (!linkedIds(user).includes(sid)) return c.json({ error: 'Élève non lié à votre compte' }, 403)
  if (ev.due_at && new Date(ev.due_at).getTime() < Date.now()) return c.json({ error: 'La date limite est dépassée' }, 400)
  const existing = (await sb(c.env, `evaluation_attempts?evaluation_id=eq.${id}&student_id=eq.${sid}&select=id,status`)).data?.[0]
  if (existing) return c.json({ error: 'Cette évaluation a déjà été rendue' }, 400)
  const answers = b.answers && typeof b.answers === 'object' ? b.answers : {}
  const cor = evaAutoCorrect(ev.sections || [], answers)
  const row = { evaluation_id: id, student_id: sid, answers, item_scores: cor.item_scores, auto_score: cor.auto_score, score: cor.manual_points === 0 ? cor.auto_score : null, max_score: cor.max || ev.total_points, status: cor.manual_points === 0 ? 'graded' : 'submitted', submitted_by: user.id, graded_at: cor.manual_points === 0 ? new Date().toISOString() : null }
  const r = await sb(c.env, 'evaluation_attempts', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur enregistrement', detail: r.data }, 500)
  await audit(c.env, c, user, 'submit', 'evaluation_attempts', r.data?.[0]?.id, null, { evaluation_id: id, student_id: sid, auto_score: cor.auto_score })
  return c.json({ ok: true, attempt: r.data?.[0], auto_score: cor.auto_score, max: cor.max, pending_manual: cor.manual_points > 0 })
})
// Correction manuelle (items ouverts) + report éventuel dans le carnet de notes
app.post('/api/evaluations/:id/grade', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const ev = (await sb(c.env, `evaluations?id=eq.${id}&select=*`)).data?.[0]
  if (!ev) return c.json({ error: 'Introuvable' }, 404)
  if (!(await evaScopeCheck(c.env, user, ev)) && Number(ev.created_by) !== user.id) return c.json({ error: 'Vous ne pouvez corriger que vos évaluations' }, 403)
  const b = await c.req.json(); const sid = Number(b.student_id)
  let att = (await sb(c.env, `evaluation_attempts?evaluation_id=eq.${id}&student_id=eq.${sid}&select=*`)).data?.[0]
  if (!att) { // passation papier : saisie directe des points
    const r = await sb(c.env, 'evaluation_attempts', { method: 'POST', body: JSON.stringify({ evaluation_id: id, student_id: sid, answers: {}, item_scores: {}, max_score: ev.total_points, status: 'submitted', submitted_by: null }) })
    att = r.data?.[0]; if (!att) return c.json({ error: 'Impossible de créer la copie', detail: r.data }, 500)
  }
  const item_scores = { ...(att.item_scores || {}), ...(b.item_scores || {}) }
  const max = Number(att.max_score || ev.total_points || 20)
  let score = b.score != null && b.score !== '' ? Number(b.score) : Object.values(item_scores).reduce((x: number, y: any) => x + (Number(y) || 0), 0)
  score = Math.round(score * 100) / 100
  if (isNaN(score) || score < 0 || score > max) return c.json({ error: `Note entre 0 et ${max}` }, 400)
  const patch: any = { item_scores, score, feedback: b.feedback ?? att.feedback ?? null, status: 'graded', graded_by: user.id, graded_at: new Date().toISOString() }
  if (ev.count_in_term && ev.subject_id) {
    const scaled = Math.round(score / max * 20 * 100) / 100
    const g = { student_id: sid, subject_id: ev.subject_id, trimester: ev.trimester || 1, score: scaled, max_score: 20, exam_type: ev.kind === 'examen' ? 'examen' : 'controle', comment: `Évaluation : ${ev.title}`, teacher_id: ev.teacher_id }
    if (att.grade_id) await sb(c.env, `grades?id=eq.${att.grade_id}`, { method: 'PATCH', body: JSON.stringify({ score: scaled }) })
    else { const gr = await sb(c.env, 'grades', { method: 'POST', body: JSON.stringify(g) }); if (gr.ok) patch.grade_id = gr.data?.[0]?.id }
  }
  const r = await sb(c.env, `evaluation_attempts?id=eq.${att.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  await audit(c.env, c, user, 'grade', 'evaluation_attempts', att.id, { score: att.score }, { score })
  try { await notifyParent(c.env, sid, 'note', `✅ Évaluation corrigée — ${ev.title}`, `Note : ${score}/${max}.${b.feedback ? ' Remarque : ' + String(b.feedback).slice(0, 200) : ''}`) } catch {}
  return c.json(r.data?.[0] || { ok: r.ok })
})
app.post('/api/evaluations/ai', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!aiEngines(c.env).length) return c.json({ error: 'Génération IA non configurée : ajoutez OPENAI_API_KEY ou AI_ALT_API_KEY dans les secrets.' }, 503)
  const used = await aiUsageToday(c.env)
  if (used >= AI_DAILY_LIMIT) return c.json({ error: `Quota quotidien atteint (${AI_DAILY_LIMIT}/jour).` }, 429)
  const b = await c.req.json().catch(() => ({}))
  const source = String(b.text || '').trim().slice(0, 24000)
  const chargeErr = await aiCharge(c.env, user, 'evaluation'); if (chargeErr) return c.json({ error: chargeErr }, 402)
  const cur = await curContext(c.env, b, String(b.lang || 'fr'))
  if (source.length < 60 && !cur && !b.topic) return c.json({ error: 'Texte source trop court (60 caractères minimum). Choisissez un cours, collez un texte, chargez un PDF ou sélectionnez des chapitres du programme.' }, 400)
  const level = String(b.level || cur?.meta.level_code || ''); const subject = String(b.subject || cur?.meta.subject || ''); const lang = b.lang === 'ar' ? 'arabe' : b.lang === 'en' ? 'anglais' : 'français'
  const plan = b.counts && typeof b.counts === 'object' ? Object.entries(b.counts).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${v} × ${k}`).join(', ') : ''
  const budget = `Durée : ${Number(b.duration_min) || cur?.meta.duration || 60} min. Barème : total = ${Number(b.total_points) || cur?.meta.scale || 20} points exactement.`
  const kind = String(b.kind || 'prerequis'); const secs: string[] = Array.isArray(b.sections) && b.sections.length ? b.sections : ['Lecture - compréhension', 'Langue', 'Production écrite']
  const schema = `{"title": string, "sections": [{"title": string, "subtitle": string, "text": string|null, "items": [ITEM]}]} où ITEM est l'un de :
{"type":"mcq","consigne":string,"question":string,"options":[string,string,string],"correct":0|1|2,"points":number}
{"type":"truefalse","consigne":string,"question":string,"correct":0|1,"points":number}  (0 = Oui/Vrai, 1 = Non/Faux)
{"type":"match","consigne":string,"pairs":[{"left":string,"right":number}],"rights":[string,...],"points":number}  (right = index dans rights ; rights peut contenir des intrus)
{"type":"strike","consigne":"Je barre ce qui est faux.","subject":string,"options":[{"text":string,"false":boolean}],"points":number}
{"type":"fill","consigne":string,"text":string,"blanks":[{"answer":string,"alt":[string]}],"words":[string]|null,"points":number}  (le texte contient ___ pour chaque trou, dans l'ordre ; words = mots du cadre à replacer, ou null)
{"type":"conjug","consigne":"Je complète avec les verbes entre parenthèses au présent.","text":string,"blanks":[{"verb":string,"answer":string,"alt":[string]}],"points":number}  (un ___ par verbe)
{"type":"quote","consigne":string,"question":string,"answer":string,"points":number}  (relever une phrase du texte ; answer = phrase attendue)
{"type":"open","consigne":string,"prompt":string,"criteria":[string],"lines":number,"points":number}  (production écrite / réponse rédigée)`
  const messages = [
    { role: 'system', content: `Tu es un enseignant tunisien expérimenté qui rédige des évaluations scolaires (${kind === 'prerequis' ? 'évaluation des prérequis de début d\u2019année' : kind}). Public : ${level ? CERT_LEVELS[level] || level : 'école primaire'}${subject ? ', matière : ' + subject : ''}. Langue de l\u2019évaluation : ${lang}. Réponds UNIQUEMENT avec un objet JSON valide (sans markdown) respectant ce schéma : ${schema}
Consignes : crée exactement ces sections dans cet ordre : ${secs.join(' | ')}. ${plan ? `Répartition imposée des exercices (tous types confondus) : ${plan}. ` : ''}${secs.length > 1 ? `La première section de lecture doit inclure un court texte (champ \"text\", 8 à 14 lignes, adapté à l\u2019âge${source ? ', basé sur le contenu fourni' : ''}) suivi de 4 à 6 items variés (match, strike, truefalse, quote, mcq). La section Langue : 3 à 4 items (conjug, fill avec mots du cadre, mcq). La section Production écrite : 1 item \"open\" avec 4 à 5 critères. ` : 'Si la matière n\u2019est pas une langue, ne crée pas de texte de lecture : des exercices directs (champ \"text\" = null). '}Les consignes commencent par « Je … » en primaire (ex. « Je relie par une flèche. »), à l\u2019infinitif ensuite. ${budget} Répartis les points de façon cohérente. ${source ? 'Base-toi strictement sur le contenu fourni, n\u2019invente pas de faits.' : 'Base-toi strictement sur le programme officiel tunisien décrit ci-dessous.'}${cur ? `\n\nCONTEXTE PROGRAMME :\n${cur.text}` : ''}` },
    { role: 'user', content: source ? `CONTENU DU COURS / SUPPORT :\n\n${source}` : `Pas de support fourni : génère l\u2019évaluation à partir du contexte programme${b.topic ? ' et du thème « ' + String(b.topic).slice(0, 200) + ' »' : ''}.` }
  ]
  const llm = await llmChat(c.env, messages, { json: true, timeoutMs: 58000, engine: b.engine })
  if (!llm.ok) return c.json({ error: llm.error }, llm.status as any)
  const raw = llm.content, model = llm.model
  let data: any
  try { data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { return c.json({ error: /credit|plan|subscribe|quota|billing/i.test(raw) ? `Service IA : ${raw.slice(0, 220)}` : 'Réponse IA illisible, réessayez.' }, 502) }
  const sections = (data.sections || []).map((s: any) => ({ title: String(s.title || ''), subtitle: s.subtitle ? String(s.subtitle) : '', text: s.text ? String(s.text) : null, items: (s.items || []).filter((it: any) => it && it.type).map((it: any) => ({ ...it, points: Number(it.points) || 1 })) }))
  if (!sections.length) return c.json({ error: 'Aucune section générée, réessayez.' }, 502)
  await aiBump(c.env)
  await audit(c.env, c, user, 'ai_generate', 'evaluations', null, null, { level, subject, chars: source.length, model })
  return c.json({ ok: true, title: data.title || 'Évaluation', sections, model, used: used + 1, limit: AI_DAILY_LIMIT })
})
export const EVA_TYPE_SCHEMAS: Record<string, string> = {
  mcq: `{"type":"mcq","consigne":string,"question":string,"options":[string,string,string,string],"correct":0|1|2|3,"points":number}`,
  truefalse: `{"type":"truefalse","consigne":string,"question":string,"correct":0|1,"points":number} (0 = Oui/Vrai, 1 = Non/Faux)`,
  match: `{"type":"match","consigne":string,"pairs":[{"left":string,"right":number}],"rights":[string],"points":number} (right = index dans rights ; rights peut contenir un intrus)`,
  strike: `{"type":"strike","consigne":"Je barre ce qui est faux.","subject":string,"options":[{"text":string,"false":boolean}],"points":number}`,
  fill: `{"type":"fill","consigne":string,"text":string,"blanks":[{"answer":string,"alt":[string]}],"words":[string]|null,"points":number} (un ___ par trou, dans l'ordre)`,
  conjug: `{"type":"conjug","consigne":string,"text":string,"blanks":[{"verb":string,"answer":string,"alt":[string]}],"points":number} (format : (verbe) ___ )`,
  quote: `{"type":"quote","consigne":string,"question":string,"answer":string,"points":number}`,
  open: `{"type":"open","consigne":string,"prompt":string,"criteria":[string],"lines":number,"points":number}`
}

// ----- Versions / sauvegarde automatique / modèles / partage -----
app.post('/api/evaluations/:id/autosave', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const ev = (await sb(c.env, `evaluations?id=eq.${id}&select=id,teacher_id,created_by,shared_with,shared_edit,sections,title`)).data?.[0]
  if (!ev) return c.json({ error: 'Introuvable' }, 404)
  const canEdit = user.role === 'admin' || Number(ev.created_by) === user.id || (ev.shared_edit && (ev.shared_with || []).includes(user.id)) || (await evaScopeCheck(c.env, user, ev))
  if (!canEdit) return c.json({ error: 'Lecture seule' }, 403)
  const b = await c.req.json()
  const patch: any = { updated_at: new Date().toISOString() }
  for (const k of ['title', 'sections', 'header', 'folder', 'shuffle']) if (k in b) patch[k] = b[k]
  if (patch.sections) patch.total_points = patch.sections.reduce((n: number, s: any) => n + (s.items || []).reduce((m: number, it: any) => m + (Number(it.points) || 0), 0), 0) || 20
  await sb(c.env, `evaluations?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  // Version : seulement si le contenu a changé
  if (patch.sections && JSON.stringify(patch.sections) !== JSON.stringify(ev.sections)) {
    await sb(c.env, 'evaluation_versions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ evaluation_id: id, sections: patch.sections, title: patch.title || ev.title, saved_by: user.id, note: b.note || 'auto' }) })
    // Conserver 30 versions max
    const vs = (await sb(c.env, `evaluation_versions?evaluation_id=eq.${id}&select=id&order=saved_at.desc&offset=30`)).data || []
    if (vs.length) await sb(c.env, `evaluation_versions?id=in.(${vs.map((v: any) => v.id).join(',')})`, { method: 'DELETE' })
  }
  return c.json({ ok: true, saved_at: patch.updated_at })
})
app.get('/api/evaluations/:id/versions', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `evaluation_versions?evaluation_id=eq.${Number(c.req.param('id'))}&select=id,title,saved_by,saved_at,note&order=saved_at.desc&limit=30`)
  return c.json(r.ok ? r.data : [])
})
app.get('/api/evaluations/:id/versions/:vid', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `evaluation_versions?id=eq.${Number(c.req.param('vid'))}&select=*`)
  return r.data?.[0] ? c.json(r.data[0]) : c.json({ error: 'Introuvable' }, 404)
})
app.post('/api/evaluations/:id/share', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const ev = (await sb(c.env, `evaluations?id=eq.${id}&select=id,title,level,created_by,teacher_id`)).data?.[0]
  if (!ev) return c.json({ error: 'Introuvable' }, 404)
  if (user.role !== 'admin' && Number(ev.created_by) !== user.id && !(await evaScopeCheck(c.env, user, ev))) return c.json({ error: 'Seul l\'auteur peut partager' }, 403)
  const b = await c.req.json(); const ids = (Array.isArray(b.user_ids) ? b.user_ids : []).map(Number).filter(Boolean)
  const r = await sb(c.env, `evaluations?id=eq.${id}&select=id,shared_with,shared_edit`, { method: 'PATCH', body: JSON.stringify({ shared_with: ids, shared_edit: !!b.edit }) })
  for (const uid of ids) { try { await sb(c.env, 'notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ type: 'info', title: '🤝 Évaluation partagée avec vous', message: `${user.name || 'Un collègue'} a partagé « ${ev.title} » (${ev.level})${b.edit ? ' en édition' : ' en lecture'}.`, target_user_id: uid, link: '#evaluations', created_by: user.id }) }) } catch {} }
  return c.json(r.data?.[0] || { ok: r.ok })
})
// Collègues (enseignants/admins) pour le partage
app.get('/api/colleagues', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `user_accounts?select=id,name,email,role&role=in.(teacher,admin)&status=eq.active&id=neq.${user.id}&order=name`)
  return c.json(r.ok ? r.data : [])
})
// Modèles : liste (miens + partagés + publics via is_template)
app.get('/api/evaluations/templates/list', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `evaluations?select=id,title,kind,level,lang,subject_id,total_points,folder,header,created_by,sections,subjects(name)&is_template=is.true&deleted_at=is.null&or=(school_year.is.null,school_year.neq.__none__)&order=title`)
  return c.json(r.ok ? r.data : [])
})

export default app
