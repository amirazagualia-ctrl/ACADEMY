// Routes curriculum
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { CURRICULUM_SEED } from '../curriculum-seed'
import { audit, getUser } from '../lib/auth'
import { sb } from '../lib/supabase'
import { TC } from '../lib/tenant'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// Génération IA d'une évaluation complète au format « fiche » (sections + items typés) à partir d'un texte / cours / support
// F58 : contexte programme pour les prompts IA (niveau, section, matière, trimestre, chapitres/notions vus jusqu'au trimestre)
export async function curContext(env: Bindings, b: any, lang: string) {
  const lsId = Number(b.cur_level_subject_id) || 0; if (!lsId) return null
  const L = lang === 'ar' ? 'ar' : lang === 'en' ? 'en' : 'fr'; const nm = (r: any) => r?.[`name_${L}`] || r?.name_fr || r?.name_ar || ''
  const ls = (await curRows(env, 'cur_level_subjects', `&id=eq.${lsId}`, (r) => r.id === lsId))[0]; if (!ls) return null
  const [lv, sec, su] = await Promise.all([
    curRows(env, 'cur_levels', `&id=eq.${ls.level_id}`, (r) => r.id === ls.level_id),
    ls.section_id ? curRows(env, 'cur_sections', `&id=eq.${ls.section_id}`, (r) => r.id === ls.section_id) : Promise.resolve([] as any[]),
    curRows(env, 'cur_subjects', `&id=eq.${ls.subject_id}`, (r) => r.id === ls.subject_id)])
  const tri = [1, 2, 3].includes(Number(b.trimester)) ? Number(b.trimester) : 1
  const seen = await curRows(env, 'cur_chapters', `&level_subject_id=eq.${lsId}&trimester=lte.${tri}&status=eq.published`, (r) => r.level_subject_id === lsId && r.trimester <= tri && r.status === 'published')
  const ids = seen.map((x: any) => x.id)
  const nos = ids.length ? await curRows(env, 'cur_notions', `&chapter_id=in.(${ids.join(',')})`, (r) => ids.includes(r.chapter_id)) : []
  const chosenCh = (Array.isArray(b.cur_chapter_ids) ? b.cur_chapter_ids : []).map(Number); const chosenNo = (Array.isArray(b.cur_notion_ids) ? b.cur_notion_ids : []).map(Number)
  const focus = seen.filter((ch: any) => chosenCh.includes(ch.id) || nos.some((n: any) => n.chapter_id === ch.id && chosenNo.includes(n.id)))
  const line = (ch: any, onlyChosen = false) => { let ns = nos.filter((n: any) => n.chapter_id === ch.id); if (onlyChosen && ns.some((n: any) => chosenNo.includes(n.id))) ns = ns.filter((n: any) => chosenNo.includes(n.id)); return `- [T${ch.trimester || '0'}] ${nm(ch)}${ns.length ? ' : ' + ns.map(nm).join(', ') : ''}` }
  const meta = { level: nm(lv[0]), level_code: lv[0]?.legacy_code || lv[0]?.code, section: sec[0] ? nm(sec[0]) : '', subject: nm(su[0]), subject_code: su[0]?.code, trimester: tri, duration: ls.duration_default || lv[0]?.duration_default || 60, scale: ls.grading_scale || 20, default_lang: ls.default_lang || su[0]?.default_lang || 'ar' }
  const text = [`Niveau : ${meta.level} (${meta.level_code})${meta.section ? ' — section ' + meta.section : ''}`, `Matière : ${meta.subject}`, `Trimestre : ${tri}`,
    b.domain ? `Domaine : ${b.domain}` : '', b.difficulty ? `Difficulté : ${b.difficulty}` : '',
    focus.length ? `Chapitres / notions CIBLÉS par l'enseignant :\n${focus.map((ch: any) => line(ch, true)).join('\n')}` : (b.topic ? `Thème libre choisi par l'enseignant : ${String(b.topic).slice(0, 200)}` : ''),
    seen.length ? `Programme déjà vu jusqu'au trimestre ${tri} (n'utilise QUE ces notions, jamais des notions des trimestres suivants) :\n${seen.map((ch: any) => line(ch)).join('\n')}` : `Aucun chapitre référencé pour ce trimestre : reste strictement dans le programme officiel tunisien de ${meta.subject} pour ce niveau, trimestre ${tri}.`,
    b.constraints ? `Contraintes : ${String(b.constraints).slice(0, 600)}` : ''].filter(Boolean).join('\n')
  return { meta, text, focus: focus.map((x: any) => x.id) }
}

// ---------- Feature 58 : Référentiel du programme scolaire tunisien (curriculum) ----------
// (per-tenant) let _curSupported: { ok: boolean; at: number } | null = null
export async function curSupported(env: Bindings) {
  if (TC._curSupported && (TC._curSupported.ok || Date.now() - TC._curSupported.at < 300000)) return TC._curSupported.ok
  const p = await sb(env, 'cur_cycles?select=id&limit=1'); TC._curSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
const CUR_TABLES = ['cur_cycles', 'cur_levels', 'cur_sections', 'cur_subjects', 'cur_level_subjects', 'cur_chapters', 'cur_notions', 'cur_domains', 'cur_exercise_types']
const curLang = (c: any) => (['ar', 'fr', 'en'].includes(c.req.query('lang')) ? c.req.query('lang') : 'ar') as string
// Ajoute name (langue demandée, repli ar) + dir à chaque ligne
const curName = (rows: any[], lang: string) => (rows || []).map((r: any) => ({ ...r, name: r[`name_${lang}`] || r.name_ar || r.name_fr, dir: lang === 'ar' ? 'rtl' : 'ltr' }))
// ----- Source de données : Supabase si la migration 0016 est exécutée, sinon repli mémoire (seed embarqué, lecture seule) -----
// (per-tenant) let _curMem: Record<string, any[]> | null = null
function curMemory(): Record<string, any[]> {
  if (TC._curMem) return TC._curMem
  const S = CURRICULUM_SEED; let n = 0; const nid = () => ++n
  const cycles = (S.cycles || []).map((x: any) => ({ id: nid(), ...x }))
  const cyc = Object.fromEntries(cycles.map((x: any) => [x.code, x.id]))
  const levels = (S.levels || []).map((x: any) => ({ id: nid(), code: x.code, legacy_code: x.legacy_code, cycle_id: cyc[x.cycle], name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, grade: x.grade, duration_default: x.duration_default || 60, position: x.position || 0 }))
  const lvl = Object.fromEntries(levels.map((x: any) => [x.code, x.id]))
  const sections = (S.sections || []).map((x: any) => ({ id: nid(), kind: 'bac', levels: [], ...x }))
  const sec = Object.fromEntries(sections.map((x: any) => [x.code, x.id]))
  const subjects = (S.subjects || []).map((x: any) => ({ id: nid(), is_optional: false, default_lang: 'ar', family: null, school_subject_id: null, ...x }))
  const sub = Object.fromEntries(subjects.map((x: any) => [x.code, x.id]))
  const level_subjects = (S.level_subjects || []).filter((x: any) => lvl[x.level] && sub[x.subject]).map((x: any) => ({ id: nid(), level_id: lvl[x.level], section_id: x.section ? sec[x.section] || null : null, subject_id: sub[x.subject], coefficient: x.coefficient ?? null, starts_from_grade: x.starts_from_grade ?? null, duration_default: x.duration_default ?? null, grading_scale: x.grading_scale || 20, default_lang: x.default_lang || null, is_specialty: !!x.is_specialty, needs_verification: !!x.needs_verification, status: x.status || 'published', position: x.position || 0 }))
  const lsKey = (l: number, s: number | null, m: number) => `${l}|${s || ''}|${m}`
  const lsMap = new Map(level_subjects.map((x: any) => [lsKey(x.level_id, x.section_id, x.subject_id), x.id]))
  const chapters: any[] = []; const notions: any[] = []
  for (const ch of S.chapters || []) {
    const lsId = lsMap.get(lsKey(lvl[ch.level], ch.section ? sec[ch.section] : null, sub[ch.subject])); if (!lsId) continue
    const id = nid(); chapters.push({ id, level_subject_id: lsId, trimester: ch.trimester ?? 1, code: ch.code, name_ar: ch.name_ar, name_fr: ch.name_fr, name_en: ch.name_en, needs_verification: !!ch.needs_verification, status: ch.status || 'published', position: ch.position || 0 })
    for (const no of ch.notions || []) notions.push({ id: nid(), chapter_id: id, code: no.code, name_ar: no.name_ar, name_fr: no.name_fr, name_en: no.name_en, position: no.position || 0 })
  }
  const domains = (S.domains || []).filter((x: any) => sub[x.subject]).map((x: any) => ({ id: nid(), subject_id: sub[x.subject], code: x.code, name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, position: x.position || 0 }))
  const exercise_types = (S.exercise_types || []).map((x: any) => ({ id: nid(), base_type: 'open', subject_codes: [], template: {}, ...x }))
  TC._curMem = { cur_cycles: cycles, cur_levels: levels, cur_sections: sections, cur_subjects: subjects, cur_level_subjects: level_subjects, cur_chapters: chapters, cur_notions: notions, cur_domains: domains, cur_exercise_types: exercise_types }
  return TC._curMem
}
// Lit une table : filtre PostgREST en mode base, prédicat JS appliqué dans les deux modes
async function curRows(env: Bindings, table: string, dbFilter = '', pred: (r: any) => boolean = () => true) {
  if (await curSupported(env)) { const r = await sb(env, `${table}?select=*${dbFilter}&order=position`); return (r.data || []).filter(pred) }
  return curMemory()[table].filter(pred).sort((a: any, b: any) => a.position - b.position)
}
app.get('/api/curriculum/status', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await curSupported(c.env))) { const m = curMemory(); const counts: any = {}; for (const t of CUR_TABLES) counts[t] = m[t].length; return c.json({ supported: false, fallback: true, seeded: true, counts }) }
  const counts: any = {}
  for (const t of CUR_TABLES) { const r = await sb(c.env, `${t}?select=id`); counts[t] = (r.data || []).length }
  return c.json({ supported: true, fallback: false, counts, seeded: counts.cur_levels > 0 })
})
app.get('/api/curriculum/levels', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const lang = curLang(c)
  const [cy, lv] = await Promise.all([curRows(c.env, 'cur_cycles'), curRows(c.env, 'cur_levels')])
  const cycles = curName(cy, lang)
  return c.json(curName(lv, lang).map((l: any) => ({ ...l, cycle: cycles.find((x: any) => x.id === l.cycle_id) || null })))
})
app.get('/api/curriculum/levels/:id/sections', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const lang = curLang(c); const id = Number(c.req.param('id'))
  const lv = (await curRows(c.env, 'cur_levels', `&id=eq.${id}`, (r) => r.id === id))[0]; if (!lv) return c.json([])
  return c.json(curName(await curRows(c.env, 'cur_sections', `&levels=cs.{${lv.code}}`, (r) => (r.levels || []).includes(lv.code)), lang))
})
app.get('/api/curriculum/subjects', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const lang = curLang(c); const levelId = Number(c.req.query('levelId')); const sectionId = Number(c.req.query('sectionId')) || null
  const subjects = await curRows(c.env, 'cur_subjects')
  if (!levelId) return c.json(curName(subjects, lang))
  const lvRow = (await curRows(c.env, 'cur_levels', `&id=eq.${levelId}`, (r) => r.id === levelId))[0]
  const ls = await curRows(c.env, 'cur_level_subjects', `&level_id=eq.${levelId}` + (sectionId ? `&or=(section_id.eq.${sectionId},section_id.is.null)` : '&section_id=is.null'),
    (r) => r.level_id === levelId && (sectionId ? (r.section_id === sectionId || r.section_id === null) : r.section_id === null) && (user.role === 'admin' || r.status === 'published'))
  // Si une section est choisie et qu'une matière existe à la fois en tronc commun et en section, la ligne de section l'emporte
  const bySubject = new Map<number, any>(); for (const r of ls) { const cur = bySubject.get(r.subject_id); if (!cur || (r.section_id && !cur.section_id)) bySubject.set(r.subject_id, r) }
  const out = [...bySubject.values()].map((r: any) => { const s = subjects.find((x: any) => x.id === r.subject_id) || {}; return { level_subject_id: r.id, subject_id: s.id, code: s.code, name: s[`name_${lang}`] || s.name_ar, name_ar: s.name_ar, name_fr: s.name_fr, name_en: s.name_en, family: s.family, is_optional: s.is_optional, is_specialty: r.is_specialty, default_lang: r.default_lang || s.default_lang || 'ar', duration_default: r.duration_default || lvRow?.duration_default || 60, grading_scale: r.grading_scale || 20, coefficient: r.coefficient, school_subject_id: s.school_subject_id, needs_verification: r.needs_verification, status: r.status, section_id: r.section_id, level_code: lvRow?.code, legacy_code: lvRow?.legacy_code, position: s.position, dir: lang === 'ar' ? 'rtl' : 'ltr' } }).sort((a, b) => (a.position || 0) - (b.position || 0))
  return c.json(out)
})
app.get('/api/curriculum/chapters', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const lang = curLang(c); const lsId = Number(c.req.query('levelSubjectId')); const tri = c.req.query('trimester'); const upTo = Number(c.req.query('upTo')) || 0
  if (!lsId) return c.json([])
  let f = `&level_subject_id=eq.${lsId}`
  if (tri !== undefined && tri !== '' && tri !== 'all') f += `&trimester=in.(0,${Number(tri)})`
  if (upTo) f += `&trimester=lte.${upTo}` // notions vues jusqu'à ce trimestre
  if (user.role !== 'admin') f += '&status=eq.published'
  const chs = await curRows(c.env, 'cur_chapters', f, (r) => r.level_subject_id === lsId && (tri === undefined || tri === '' || tri === 'all' || r.trimester === 0 || r.trimester === Number(tri)) && (!upTo || r.trimester <= upTo) && (user.role === 'admin' || r.status === 'published'))
  chs.sort((a: any, b: any) => a.trimester - b.trimester || a.position - b.position)
  const ids = chs.map((x: any) => x.id); if (!ids.length) return c.json([])
  const nos = await curRows(c.env, 'cur_notions', `&chapter_id=in.(${ids.join(',')})`, (r) => ids.includes(r.chapter_id))
  return c.json(curName(chs, lang).map((ch: any) => ({ ...ch, notions: curName(nos.filter((n: any) => n.chapter_id === ch.id), lang) })))
})
app.get('/api/curriculum/domains', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.query('subjectId')); if (!sid) return c.json([])
  return c.json(curName(await curRows(c.env, 'cur_domains', `&subject_id=eq.${sid}`, (r) => r.subject_id === sid), curLang(c)))
})
app.get('/api/curriculum/exercise-types', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.query('subjectId')); const lang = curLang(c)
  const all = await curRows(c.env, 'cur_exercise_types')
  let code: string | null = null
  if (sid) code = (await curRows(c.env, 'cur_subjects', `&id=eq.${sid}`, (r) => r.id === sid))[0]?.code || null
  return c.json(curName(all.filter((t: any) => !code || !(t.subject_codes || []).length || t.subject_codes.includes(code)), lang))
})
// ----- Admin : CRUD générique, réordonnancement, seed, import/export -----
app.post('/api/curriculum/:table', async (c, next) => {
  if (['seed', 'import', 'export'].includes(c.req.param('table'))) return next()
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const t = 'cur_' + c.req.param('table'); if (!CUR_TABLES.includes(t)) return c.json({ error: 'Table inconnue' }, 400)
  const b = await c.req.json(); const r = await sb(c.env, `${t}?select=*`, { method: 'POST', body: JSON.stringify(b) })
  if (!r.ok) return c.json({ error: 'Erreur', detail: r.data }, 500)
  TC._curMem = null; await audit(c.env, c, user, 'create', t, r.data?.[0]?.id, null, b); return c.json(r.data?.[0], 201)
})
app.put('/api/curriculum/:table/:id', async (c) => {
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const t = 'cur_' + c.req.param('table'); if (!CUR_TABLES.includes(t)) return c.json({ error: 'Table inconnue' }, 400)
  const b = await c.req.json(); delete b.id; const r = await sb(c.env, `${t}?id=eq.${Number(c.req.param('id'))}&select=*`, { method: 'PATCH', body: JSON.stringify(b) })
  TC._curMem = null; await audit(c.env, c, user, 'update', t, Number(c.req.param('id')), null, b); return c.json(r.data?.[0] || { ok: r.ok })
})
app.delete('/api/curriculum/:table/:id', async (c) => {
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const t = 'cur_' + c.req.param('table'); if (!CUR_TABLES.includes(t)) return c.json({ error: 'Table inconnue' }, 400)
  const r = await sb(c.env, `${t}?id=eq.${Number(c.req.param('id'))}`, { method: 'DELETE' })
  TC._curMem = null; await audit(c.env, c, user, 'delete', t, Number(c.req.param('id')), null, null); return c.json({ ok: r.ok })
})
app.post('/api/curriculum/:table/reorder', async (c) => {
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const t = 'cur_' + c.req.param('table'); if (!CUR_TABLES.includes(t)) return c.json({ error: 'Table inconnue' }, 400)
  const ids: number[] = (await c.req.json()).ids || []
  await Promise.all(ids.map((id, i) => sb(c.env, `${t}?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ position: i + 1 }) })))
  return c.json({ ok: true })
})
// Upsert par code (idempotent). Retourne map code → id
async function curUpsert(env: Bindings, table: string, rows: any[], conflict = 'code') {
  if (!rows.length) return {}
  // Upsert manuel (compatible index uniques partiels) : lookup des codes existants → PATCH des existants, INSERT des nouveaux
  const codes = rows.map(x => x[conflict]).filter(Boolean)
  const map: Record<string, number> = {}
  for (let i = 0; i < codes.length; i += 100) {
    const rr = await sb(env, `${table}?${conflict}=in.(${codes.slice(i, i + 100).map(m => `"${String(m).replace(/"/g, '')}"`).join(',')})&select=id,${conflict}`)
    if (!rr.ok) throw new Error(`${table}: ${JSON.stringify(rr.data).slice(0, 300)}`)
    for (const x of rr.data || []) map[x[conflict]] = x.id
  }
  const toInsert = rows.filter(x => !map[x[conflict]])
  // Existants : PATCH par lots de 8 en parallèle (idempotent, met à jour libellés/positions)
  const toPatch = rows.filter(y => map[y[conflict]])
  for (let i = 0; i < toPatch.length; i += 8) {
    const rs = await Promise.all(toPatch.slice(i, i + 8).map(x => sb(env, `${table}?id=eq.${map[x[conflict]]}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(x) })))
    const bad = rs.find(r => !r.ok); if (bad) throw new Error(`${table}: ${JSON.stringify(bad.data).slice(0, 300)}`)
  }
  for (let i = 0; i < toInsert.length; i += 200) {
    const r = await sb(env, `${table}?select=id,${conflict}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(toInsert.slice(i, i + 200)) })
    if (!r.ok) throw new Error(`${table}: ${JSON.stringify(r.data).slice(0, 300)}`)
    for (const x of r.data || []) map[x[conflict]] = x.id
  }
  return map
}
// Mapping automatique cur_subjects → subjects (carnet de notes) par nom (A5), sans écraser un mapping existant
async function curAutoMapSubjects(env: Bindings) {
  const [cs, ss] = await Promise.all([sb(env, 'cur_subjects?select=id,code,name_fr,name_ar,school_subject_id'), sb(env, 'subjects?select=id,name')])
  const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\u0600-\u06FF]+/g, '')
  const school = (ss.data || []).map((x: any) => ({ id: x.id, n: norm(x.name) }))
  let mapped = 0
  for (const s of cs.data || []) {
    if (s.school_subject_id) continue
    const fr = norm(s.name_fr), ar = norm(s.name_ar); const first = fr.slice(0, 5)
    const hit = school.find((x: any) => x.n === fr || x.n === ar) || school.find((x: any) => first.length >= 4 && (x.n.startsWith(first) || fr.startsWith(x.n.slice(0, 5))))
    if (hit) { await sb(env, `cur_subjects?id=eq.${s.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ school_subject_id: hit.id }) }); mapped++ }
  }
  return mapped
}
async function curImport(env: Bindings, data: Record<string, any[]>) {
  const res: any = {}
  const cyc = await curUpsert(env, 'cur_cycles', (data.cycles || []).map((x: any) => ({ code: x.code, name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, position: x.position || 0 }))); res.cycles = Object.keys(cyc).length
  const allCyc = Object.fromEntries(((await sb(env, 'cur_cycles?select=id,code')).data || []).map((x: any) => [x.code, x.id]))
  const lvl = await curUpsert(env, 'cur_levels', (data.levels || []).map((x: any) => ({ code: x.code, legacy_code: x.legacy_code, cycle_id: allCyc[x.cycle], name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, grade: x.grade, duration_default: x.duration_default || 60, position: x.position || 0 }))); res.levels = Object.keys(lvl).length
  const allLvl = Object.fromEntries(((await sb(env, 'cur_levels?select=id,code')).data || []).map((x: any) => [x.code, x.id]))
  const sec = await curUpsert(env, 'cur_sections', (data.sections || []).map((x: any) => ({ code: x.code, name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, levels: x.levels || [], kind: x.kind || 'bac', position: x.position || 0 }))); res.sections = Object.keys(sec).length
  const allSec = Object.fromEntries(((await sb(env, 'cur_sections?select=id,code')).data || []).map((x: any) => [x.code, x.id]))
  const sub = await curUpsert(env, 'cur_subjects', (data.subjects || []).map((x: any) => ({ code: x.code, name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, is_optional: !!x.is_optional, default_lang: x.default_lang || 'ar', family: x.family || null, position: x.position || 0 }))); res.subjects = Object.keys(sub).length
  const allSub = Object.fromEntries(((await sb(env, 'cur_subjects?select=id,code')).data || []).map((x: any) => [x.code, x.id]))
  // level_subjects : pas de colonne code → upsert manuel (clé niveau/section/matière)
  const existing = (await sb(env, 'cur_level_subjects?select=id,level_id,section_id,subject_id')).data || []
  const key = (l: number, s: number | null, m: number) => `${l}|${s || ''}|${m}`
  const exMap = new Map(existing.map((x: any) => [key(x.level_id, x.section_id, x.subject_id), x.id]))
  const toInsert: any[] = []; const toPatchLs: any[] = []; let lsCount = 0
  for (const x of data.level_subjects || []) {
    const l = allLvl[x.level], m = allSub[x.subject], s = x.section ? allSec[x.section] : null; if (!l || !m) continue
    const row = { level_id: l, section_id: s, subject_id: m, coefficient: x.coefficient ?? null, starts_from_grade: x.starts_from_grade ?? null, duration_default: x.duration_default ?? null, grading_scale: x.grading_scale || 20, default_lang: x.default_lang || null, is_specialty: !!x.is_specialty, needs_verification: !!x.needs_verification, status: x.status || 'published', position: x.position || 0 }
    const id = exMap.get(key(l, s, m)); lsCount++
    if (id) toPatchLs.push([id, row]); else toInsert.push(row)
  }
  for (let i = 0; i < toPatchLs.length; i += 8) await Promise.all(toPatchLs.slice(i, i + 8).map(([id, row]) => sb(env, `cur_level_subjects?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) })))
  if (toInsert.length) { const r = await sb(env, 'cur_level_subjects', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(toInsert) }); if (!r.ok) throw new Error('level_subjects: ' + JSON.stringify(r.data).slice(0, 300)) }
  res.level_subjects = lsCount
  const dom = await curUpsert(env, 'cur_domains', (data.domains || []).filter((x: any) => allSub[x.subject]).map((x: any) => ({ code: x.code, subject_id: allSub[x.subject], name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, position: x.position || 0 }))); res.domains = Object.keys(dom).length
  const et = await curUpsert(env, 'cur_exercise_types', (data.exercise_types || []).map((x: any) => ({ code: x.code, base_type: x.base_type || 'open', name_ar: x.name_ar, name_fr: x.name_fr, name_en: x.name_en, subject_codes: x.subject_codes || [], template: x.template || {}, position: x.position || 0 }))); res.exercise_types = Object.keys(et).length
  // chapitres + notions (code idempotent)
  const lsAll = (await sb(env, 'cur_level_subjects?select=id,level_id,section_id,subject_id')).data || []
  const lsMap = new Map(lsAll.map((x: any) => [key(x.level_id, x.section_id, x.subject_id), x.id]))
  const chRows: any[] = []; const notRows: any[] = []
  for (const ch of data.chapters || []) {
    const lsId = ch.level_subject_id || lsMap.get(key(allLvl[ch.level], ch.section ? allSec[ch.section] : null, allSub[ch.subject])); if (!lsId) continue
    chRows.push({ code: ch.code, level_subject_id: lsId, trimester: ch.trimester ?? 1, name_ar: ch.name_ar, name_fr: ch.name_fr, name_en: ch.name_en, needs_verification: !!ch.needs_verification, status: ch.status || 'published', position: ch.position || 0 })
  }
  const chMap = await curUpsert(env, 'cur_chapters', chRows); res.chapters = Object.keys(chMap).length
  for (const ch of data.chapters || []) for (const n of ch.notions || []) if (chMap[ch.code]) notRows.push({ code: n.code, chapter_id: chMap[ch.code], name_ar: n.name_ar, name_fr: n.name_fr, name_en: n.name_en, position: n.position || 0 })
  const nMap = await curUpsert(env, 'cur_notions', notRows); res.notions = Object.keys(nMap).length
  res.mapped_subjects = await curAutoMapSubjects(env)
  TC._curSupported = null; TC._curMem = null
  return res
}
app.post('/api/curriculum/seed', async (c) => {
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!(await curSupported(c.env))) return c.json({ error: 'Exécutez d\'abord migrations/0016_curriculum.sql' }, 503)
  try { const res = await curImport(c.env, CURRICULUM_SEED); await audit(c.env, c, user, 'seed', 'curriculum', null, null, res); return c.json({ ok: true, ...res }) }
  catch (e: any) { return c.json({ error: e.message }, 500) }
})
// Import JSON (même format que /seed) ou CSV de chapitres/notions : level,section,subject,trimester,code,name_ar,name_fr,name_en,notion_code,notion_ar,notion_fr,notion_en
app.post('/api/curriculum/import', async (c) => {
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json(); let data: Record<string, any[]> = {}
  if (b.csv) {
    const lines = String(b.csv).split(/\r?\n/).filter((l: string) => l.trim()); const sep = lines[0].includes(';') ? ';' : ','
    const head = lines[0].split(sep).map((h: string) => h.trim()); const chapters: Record<string, any> = {}
    for (const line of lines.slice(1)) { const cells = line.split(sep); const row: any = {}; head.forEach((h: string, i: number) => row[h] = (cells[i] || '').trim())
      const ck = row.code || `${row.level}.${row.subject}.T${row.trimester}.${(row.name_fr || '').toLowerCase().replace(/\W+/g, '_').slice(0, 30)}`
      chapters[ck] = chapters[ck] || { code: ck, level: row.level, section: row.section || null, subject: row.subject, trimester: Number(row.trimester) || 1, name_ar: row.name_ar, name_fr: row.name_fr, name_en: row.name_en || row.name_fr, needs_verification: true, position: Object.keys(chapters).length + 1, notions: [] }
      if (row.notion_fr || row.notion_ar) chapters[ck].notions.push({ code: row.notion_code || `${ck}.${chapters[ck].notions.length + 1}`, name_ar: row.notion_ar || row.notion_fr, name_fr: row.notion_fr || row.notion_ar, name_en: row.notion_en || row.notion_fr || row.notion_ar, position: chapters[ck].notions.length + 1 }) }
    data = { chapters: Object.values(chapters) }
  } else data = b.data || b
  try { const res = await curImport(c.env, data); await audit(c.env, c, user, 'import', 'curriculum', null, null, res); return c.json({ ok: true, ...res }) }
  catch (e: any) { return c.json({ error: e.message }, 500) }
})
app.get('/api/curriculum/export', async (c) => {
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const out: any = {}
  for (const t of CUR_TABLES) out[t] = (await sb(c.env, `${t}?select=*&order=position`)).data || []
  return c.json(out)
})

export default app
