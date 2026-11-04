// Routes bank
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { sendTelegram } from '../lib/notify'
import { sb } from '../lib/supabase'
import { TC } from '../lib/tenant'
import { aiBump, aiCharge, aiEngines, aiWallet, llmChat } from './ai'
import { CERT_LEVELS } from './certificates'
import { curContext } from './curriculum'
import { EVA_TYPE_SCHEMAS } from './evaluations'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Feature 55 : Bibliothèque d'exercices, modèles, versions, partage, jetons IA (cahier des charges plateforme d'examens) ----------
// (per-tenant) let _bankSupported: { ok: boolean; at: number } | null = null
async function bankSupported(env: Bindings) {
  if (TC._bankSupported && (TC._bankSupported.ok || Date.now() - TC._bankSupported.at < 300000)) return TC._bankSupported.ok
  const p = await sb(env, 'exercise_bank?select=id&limit=1'); TC._bankSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
const BANK_SEL = 'select=*,subjects(name),chapters(name,name_ar)'

// ----- Chapitres -----
app.get('/api/chapters', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  let q = 'chapters?select=*,subjects(name)&order=position,name'
  if (c.req.query('level')) q += `&level=eq.${encodeURIComponent(c.req.query('level')!)}`
  if (c.req.query('subject_id')) q += `&subject_id=eq.${Number(c.req.query('subject_id'))}`
  const r = await sb(c.env, q); return c.json(r.ok ? r.data : [])
})
app.post('/api/chapters', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!b.name || !b.level) return c.json({ error: 'Nom et niveau requis' }, 400)
  const r = await sb(c.env, 'chapters?select=*', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ subject_id: b.subject_id || null, level: b.level, name: b.name, name_ar: b.name_ar || null, position: Number(b.position) || 0 }) })
  return c.json(r.data?.[0] || { error: 'Erreur', detail: r.data }, r.ok ? 201 : 500)
})
app.delete('/api/chapters/:id', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `chapters?id=eq.${Number(c.req.param('id'))}`, { method: 'DELETE' }); return c.json({ ok: r.ok })
})

// ----- Bibliothèque d'exercices -----
app.get('/api/bank', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await bankSupported(c.env))) return c.json({ supported: false, items: [], total: 0 })
  const q = c.req.query()
  const parts: string[] = [`exercise_bank?${BANK_SEL}&deleted_at=is.null`]
  // visibilité : mes exercices + publics/école approuvés (admin : tout)
  if (user.role !== 'admin') parts.push(`or=(author_id.eq.${user.id},and(visibility.in.(public,school),status.eq.approved))`)
  else if (q.status) parts.push(`status=eq.${q.status}`)
  if (q.level) parts.push(`level=eq.${encodeURIComponent(q.level)}`)
  if (q.subject_id) parts.push(`subject_id=eq.${Number(q.subject_id)}`)
  if (q.chapter_id) parts.push(`chapter_id=eq.${Number(q.chapter_id)}`)
  if (q.type) parts.push(`type=eq.${q.type}`)
  if (q.difficulty) parts.push(`difficulty=eq.${Number(q.difficulty)}`)
  if (q.lang) parts.push(`lang=eq.${q.lang}`)
  if (q.mine === '1') parts.push(`author_id=eq.${user.id}`)
  if (q.q) { const s = encodeURIComponent(`%${q.q.replace(/[%_,()]/g, ' ')}%`); parts.push(`or=(title.ilike.${s},chapter.ilike.${s},data->>consigne.ilike.${s},data->>question.ilike.${s},data->>text.ilike.${s})`) }
  const sort = q.sort === 'uses' ? 'uses.desc' : q.sort === 'old' ? 'created_at.asc' : 'created_at.desc'
  const limit = Math.min(Number(q.limit) || 40, 100); const offset = Number(q.offset) || 0
  const r = await sb(c.env, parts.join('&') + `&order=${sort}&limit=${limit}&offset=${offset}`, { headers: { Prefer: 'count=exact' } })
  const favs = (await sb(c.env, `exercise_favorites?user_id=eq.${user.id}&select=exercise_id`)).data || []
  const favSet = new Set(favs.map((f: any) => f.exercise_id))
  let items = (r.data || []).map((x: any) => ({ ...x, favorite: favSet.has(x.id), mine: x.author_id === user.id }))
  if (q.favorites === '1') items = items.filter((x: any) => x.favorite)
  return c.json({ supported: true, items, total: items.length })
})
app.post('/api/bank', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const items = Array.isArray(b.items) ? b.items : [b]
  const rows = items.filter((x: any) => x?.data?.type || x?.type).map((x: any) => {
    const data = x.data || x; const type = data.type
    return { type, title: x.title || String(data.consigne || data.question || data.text || '').slice(0, 120), subject_id: x.subject_id || null, level: x.level || null, chapter_id: x.chapter_id || null, chapter: x.chapter || null, difficulty: [1, 2, 3].includes(Number(x.difficulty)) ? Number(x.difficulty) : 2, lang: ['fr', 'ar', 'en'].includes(x.lang) ? x.lang : 'fr', data, tags: Array.isArray(x.tags) ? x.tags : [], source_text: x.source_text || null, author_id: user.id, origin_id: x.origin_id || null, visibility: ['private', 'school', 'public'].includes(x.visibility) ? x.visibility : 'private', status: user.role === 'admin' || x.visibility === 'private' || !x.visibility ? 'approved' : 'pending', ai_generated: !!x.ai_generated }
  })
  if (!rows.length) return c.json({ error: 'Aucun exercice valide' }, 400)
  const r = await sb(c.env, `exercise_bank?${BANK_SEL}`, { method: 'POST', body: JSON.stringify(rows) })
  if (!r.ok) return c.json({ error: 'Erreur', detail: r.data }, 500)
  await audit(c.env, c, user, 'create', 'exercise_bank', r.data?.[0]?.id, null, { count: rows.length })
  return c.json({ ok: true, items: r.data }, 201)
})
app.put('/api/bank/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `exercise_bank?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Introuvable' }, 404)
  const b = await c.req.json()
  // Règle : modifier l'exercice d'un autre auteur → copie personnelle, l'original reste intact
  if (before.author_id !== user.id && user.role !== 'admin') {
    const { id: _i, created_at, updated_at, uses, reports, ...rest } = before
    const row = { ...rest, ...pickBank(b), author_id: user.id, origin_id: before.id, visibility: 'private', status: 'approved', uses: 0, reports: 0 }
    const r = await sb(c.env, `exercise_bank?${BANK_SEL}`, { method: 'POST', body: JSON.stringify(row) })
    return c.json({ ...(r.data?.[0] || {}), copied: true }, 201)
  }
  const patch = { ...pickBank(b), updated_at: new Date().toISOString() }
  if (user.role === 'admin' && b.status) (patch as any).status = b.status
  const r = await sb(c.env, `exercise_bank?id=eq.${id}&${BANK_SEL}`, { method: 'PATCH', body: JSON.stringify(patch) })
  return c.json(r.data?.[0] || { ok: r.ok })
})
function pickBank(b: any) { const p: any = {}; for (const k of ['type', 'title', 'subject_id', 'level', 'chapter_id', 'chapter', 'difficulty', 'lang', 'data', 'tags', 'source_text', 'visibility']) if (k in b) p[k] = b[k]; if (p.data?.type) p.type = p.data.type; return p }
app.delete('/api/bank/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `exercise_bank?id=eq.${id}&select=id,author_id`)).data?.[0]
  if (!before) return c.json({ error: 'Introuvable' }, 404)
  if (before.author_id !== user.id && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `exercise_bank?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: user.id }) })
  return c.json({ ok: r.ok, soft: true })
})
app.post('/api/bank/:id/favorite', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const ex = (await sb(c.env, `exercise_favorites?user_id=eq.${user.id}&exercise_id=eq.${id}&select=exercise_id`)).data?.[0]
  if (ex) { await sb(c.env, `exercise_favorites?user_id=eq.${user.id}&exercise_id=eq.${id}`, { method: 'DELETE' }); return c.json({ favorite: false }) }
  await sb(c.env, 'exercise_favorites', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user.id, exercise_id: id }) })
  return c.json({ favorite: true })
})
app.post('/api/bank/:id/use', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const id = Number(c.req.param('id')); const ex = (await sb(c.env, `exercise_bank?id=eq.${id}&select=uses`)).data?.[0]
  if (ex) await sb(c.env, `exercise_bank?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ uses: Number(ex.uses || 0) + 1 }) })
  return c.json({ ok: true })
})
app.post('/api/bank/:id/report', async (c) => {
  const user = await getUser(c); if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const id = Number(c.req.param('id')); const b = await c.req.json().catch(() => ({}))
  const ex = (await sb(c.env, `exercise_bank?id=eq.${id}&select=reports,title`)).data?.[0]
  if (!ex) return c.json({ error: 'Introuvable' }, 404)
  await sb(c.env, `exercise_bank?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ reports: Number(ex.reports || 0) + 1, status: Number(ex.reports || 0) + 1 >= 3 ? 'pending' : undefined }) })
  await audit(c.env, c, user, 'report', 'exercise_bank', id, null, { reason: String(b.reason || '').slice(0, 300) })
  try { await sendTelegram(c.env, c.env.TELEGRAM_ADMIN_CHAT_ID || '', `⚠️ Exercice signalé #${id} « ${ex.title || ''} » par ${user.name || user.email} : ${String(b.reason || '').slice(0, 200)}`) } catch {}
  return c.json({ ok: true })
})
// Modération (admin) : file d'attente
app.get('/api/bank/moderation', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `exercise_bank?${BANK_SEL}&deleted_at=is.null&or=(status.eq.pending,reports.gte.1)&order=reports.desc,created_at.desc&limit=200`)
  return c.json(r.ok ? r.data : [])
})
// Statistiques bibliothèque (tableau de bord)
app.get('/api/bank/stats', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await bankSupported(c.env))) return c.json({ supported: false })
  const all = (await sb(c.env, 'exercise_bank?select=id,type,level,subject_id,author_id,visibility,status,ai_generated&deleted_at=is.null')).data || []
  const by = (k: string) => all.reduce((m: any, x: any) => { const v = x[k] ?? '—'; m[v] = (m[v] || 0) + 1; return m }, {})
  return c.json({ supported: true, total: all.length, mine: all.filter((x: any) => x.author_id === user.id).length, public: all.filter((x: any) => x.visibility !== 'private' && x.status === 'approved').length, pending: all.filter((x: any) => x.status === 'pending').length, ai: all.filter((x: any) => x.ai_generated).length, by_type: by('type'), by_level: by('level') })
})
// IA : génération d'UN exercice typé (1 jeton) ; reformulation ; corrigé
app.post('/api/bank/ai', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!aiEngines(c.env).length) return c.json({ error: 'Génération IA non configurée (OPENAI_API_KEY ou AI_ALT_API_KEY).' }, 503)
  const b = await c.req.json().catch(() => ({}))
  const mode = ['exercise', 'rephrase', 'answer'].includes(b.mode) ? b.mode : 'exercise'
  const chargeErr = await aiCharge(c.env, user, mode)
  if (chargeErr) return c.json({ error: chargeErr }, 402)
  const type = Object.keys(EVA_TYPE_SCHEMAS).includes(b.type) ? b.type : 'mcq'
  const level = String(b.level || ''); const subject = String(b.subject || ''); const chapter = String(b.chapter || ''); const lang = b.lang === 'ar' ? 'arabe' : b.lang === 'en' ? 'anglais' : 'français'
  const diff = ['facile', 'moyen', 'difficile'][Math.min(Math.max(Number(b.difficulty) || 2, 1), 3) - 1]
  const n = Math.min(Math.max(Number(b.count) || 1, 1), 5)
  let sys = '', usr = ''
  const cur = await curContext(c.env, { ...b, difficulty: diff }, String(b.lang || 'fr'))
  if (mode === 'exercise') {
    sys = `Tu es un enseignant tunisien expérimenté. Rédige ${n} exercice(s) de type « ${type} » pour des élèves de ${cur?.meta.level || CERT_LEVELS[level] || level || 'primaire'}${subject || cur ? ', matière : ' + (subject || cur?.meta.subject) : ''}${chapter ? ', chapitre : ' + chapter : ''}. Langue : ${lang}. Difficulté : ${diff}. Réponds UNIQUEMENT en JSON valide : {"items":[ITEM,...]} où ITEM = ${EVA_TYPE_SCHEMAS[type]}. Consigne à la 1ʳᵉ personne (« Je … ») en primaire, à l'infinitif ensuite. Barème cohérent (points entiers ou demi-points). Si un texte support est fourni, base-toi strictement dessus.${b.template ? ` Gabarit du type demandé : ${JSON.stringify(b.template).slice(0, 600)}.` : ''}${cur ? `\n\nCONTEXTE PROGRAMME :\n${cur.text}` : ''}`
    usr = b.text ? `TEXTE SUPPORT :\n${String(b.text).slice(0, 12000)}\n\nCONSIGNE DE L'ENSEIGNANT : ${String(b.prompt || '').slice(0, 1000)}` : `CONSIGNE DE L'ENSEIGNANT : ${String(b.prompt || 'exercice standard du programme').slice(0, 1000)}`
  } else if (mode === 'rephrase') {
    sys = `Tu es un enseignant. Reformule l'exercice JSON fourni (même type « ${type} », même structure, mêmes clés) pour ${CERT_LEVELS[level] || level || 'des élèves'} en ${lang}, difficulté ${diff}, en changeant les valeurs/contexte mais pas la compétence évaluée. Réponds UNIQUEMENT en JSON : {"items":[ITEM]} avec ITEM = ${EVA_TYPE_SCHEMAS[type]}.`
    usr = JSON.stringify(b.item || {})
  } else {
    sys = `Tu es un enseignant. Complète le corrigé de l'exercice JSON fourni (type « ${type} ») : remplis les champs de réponse (correct, blanks[].answer, pairs[].right, options[].false, answer, criteria) sans modifier l'énoncé. Réponds UNIQUEMENT en JSON : {"items":[ITEM]} avec ITEM = ${EVA_TYPE_SCHEMAS[type]}.`
    usr = JSON.stringify(b.item || {})
  }
  const llm = await llmChat(c.env, [{ role: 'system', content: sys }, { role: 'user', content: usr }], { json: true, timeoutMs: 50000, engine: b.engine })
  if (!llm.ok) return c.json({ error: llm.error }, llm.status as any)
  const raw = llm.content, model = llm.model, usage: any = llm.usage
  let data: any
  try { data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { return c.json({ error: /credit|plan|quota|billing/i.test(raw) ? `Service IA : ${raw.slice(0, 200)}` : 'Réponse IA illisible.' }, 502) }
  const items = (data.items || (data.type ? [data] : [])).filter((it: any) => it && (it.type || type)).map((it: any) => ({ ...it, type: it.type || type, points: Number(it.points) || 1, ai_generated: true }))
  if (!items.length) return c.json({ error: 'Aucun exercice généré.' }, 502)
  // coût estimé (suivi) : ~ $0.0004/1k tokens d'entrée + $0.0016/1k sortie (gpt-5-mini indicatif)
  const costUsd = usage ? (Number(usage.prompt_tokens || 0) * 0.0004 + Number(usage.completion_tokens || 0) * 0.0016) / 1000 : null
  if (costUsd != null) { try { await sb(c.env, `ai_token_moves?user_id=eq.${user.id}&action=eq.${mode}&cost_usd=is.null&order=created_at.desc&limit=1`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ cost_usd: costUsd }) }) } catch {} }
  await aiBump(c.env)
  await audit(c.env, c, user, 'ai_generate', 'exercise_bank', null, null, { mode, type, level, subject, model })
  const w = await aiWallet(c.env, user.id)
  return c.json({ ok: true, items, model, balance: w?.balance ?? null })
})

export default app
