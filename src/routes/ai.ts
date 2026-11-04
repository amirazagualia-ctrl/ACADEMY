// Routes ai
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { getBrand } from '../lib/brand'
import { sb } from '../lib/supabase'
import { clientIp, rateLimit } from '../lib/utils'
import { CERT_LEVELS } from './certificates'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Moteurs IA : principal (OPENAI_*) + alternatif (AI_ALT_*, API compatible OpenAI) avec bascule automatique ----------
type LlmEngine = { id: 'primary' | 'alt'; base: string; key: string; model: string }
export function aiEngines(env: Bindings): LlmEngine[] {
  const list: LlmEngine[] = []
  if (env.OPENAI_API_KEY) list.push({ id: 'primary', base: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-5-mini' })
  if (env.AI_ALT_API_KEY) list.push({ id: 'alt', base: (env.AI_ALT_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''), key: env.AI_ALT_API_KEY, model: env.AI_ALT_MODEL || 'llama-3.3-70b-versatile' })
  return list
}
type LlmResult = { ok: true; content: string; usage: any; engine: string; model: string } | { ok: false; error: string; status: number }
// engine: 'auto' (principal puis alternatif), 'primary' ou 'alt' (forcé)
export async function llmChat(env: Bindings, messages: any[], opts: { json?: boolean; timeoutMs?: number; engine?: string } = {}): Promise<LlmResult> {
  let engines = aiEngines(env)
  if (opts.engine === 'alt' || opts.engine === 'primary') engines = engines.filter(e => e.id === opts.engine)
  if (!engines.length) return { ok: false, error: aiEngines(env).length ? 'Ce moteur IA n\u2019est pas configuré.' : 'Génération IA non configurée : ajoutez OPENAI_API_KEY (moteur principal) et/ou AI_ALT_API_KEY + AI_ALT_BASE_URL + AI_ALT_MODEL (moteur alternatif) dans les secrets.', status: 503 }
  const errors: string[] = []
  for (const e of engines) {
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), opts.timeoutMs || 55000)
      const body: any = { model: e.model, messages }
      if (opts.json) body.response_format = { type: 'json_object' }
      const res = await fetch(`${e.base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.key}` }, body: JSON.stringify(body), signal: ctrl.signal })
      clearTimeout(to)
      const j: any = await res.json().catch(() => ({}))
      if (!res.ok) { errors.push(`${e.id}/${e.model} : ${j?.error?.message || res.status}`); continue }
      const content = j?.choices?.[0]?.message?.content || ''
      if (!content) { errors.push(`${e.id}/${e.model} : réponse vide`); continue }
      // Certains proxys renvoient un message de quota/facturation en texte brut avec un statut 200 → traité comme un échec (bascule vers le moteur suivant)
      if (opts.json && !/^\s*[\[{]/.test(content) && /credit|quota|billing|subscribe|plan|insufficient|exhausted/i.test(content)) { errors.push(`${e.id}/${e.model} : ${content.slice(0, 140)}`); continue }
      return { ok: true, content, usage: j?.usage || null, engine: e.id, model: e.model }
    } catch (err: any) { errors.push(`${e.id}/${e.model} : ${err?.name === 'AbortError' ? 'délai dépassé' : (err?.message || 'injoignable')}`) }
  }
  return { ok: false, error: `Service IA indisponible — ${errors.join(' · ')}`, status: 502 }
}

// ---------- Génération IA (fiches / quiz / flashcards / texte à trous) — clé côté serveur uniquement ----------
export const AI_DAILY_LIMIT = 40
app.get('/api/ai/status', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const used = await aiUsageToday(c.env)
  const engines = aiEngines(c.env)
  return c.json({ enabled: engines.length > 0, model: engines[0]?.model || null, engines: engines.map(e => ({ id: e.id, model: e.model })), used, limit: AI_DAILY_LIMIT })
})
export async function aiUsageToday(env: Bindings): Promise<number> {
  const r = await sb(env, `settings?key=eq.ai_usage&select=value`); const v = r.data?.[0]?.value || {}
  const today = new Date().toISOString().slice(0, 10)
  return v.date === today ? Number(v.count || 0) : 0
}
export async function aiBump(env: Bindings) {
  const today = new Date().toISOString().slice(0, 10)
  const used = await aiUsageToday(env)
  await sb(env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'ai_usage', value: { date: today, count: used + 1 } }) })
}
app.post('/api/ai/generate', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!aiEngines(c.env).length) return c.json({ error: 'Génération IA non configurée : ajoutez OPENAI_API_KEY (et OPENAI_BASE_URL si nécessaire) ou AI_ALT_API_KEY dans les secrets.' }, 503)
  const used = await aiUsageToday(c.env)
  if (used >= AI_DAILY_LIMIT) return c.json({ error: `Quota quotidien atteint (${AI_DAILY_LIMIT} générations/jour). Réessayez demain.` }, 429)
  const b = await c.req.json().catch(() => ({}))
  const kind = ['quiz', 'flashcards', 'fillblank', 'summary'].includes(b.kind) ? b.kind : 'quiz'
  const source = String(b.text || '').trim().slice(0, 24000)
  if (source.length < 80) return c.json({ error: 'Texte source trop court (80 caractères minimum). Collez le contenu du cours ou chargez un PDF.' }, 400)
  const n = Math.min(Math.max(Number(b.count) || 8, 3), 20)
  const level = String(b.level || '').trim(); const subject = String(b.subject || '').trim(); const lang = b.lang === 'ar' ? 'arabe' : 'français'
  const difficulty = ['facile', 'moyen', 'difficile'].includes(b.difficulty) ? b.difficulty : 'moyen'
  const ctx = `Public : élèves de ${level ? CERT_LEVELS[level] || level : 'l\u2019école primaire/collège'} (Tunisie)${subject ? `, matière : ${subject}` : ''}. Langue de sortie : ${lang}. Difficulté : ${difficulty}. Base-toi STRICTEMENT sur le texte fourni ; n\u2019invente aucun fait absent du texte.`
  const schemas: Record<string, string> = {
    quiz: `{"title": string, "description": string, "questions": [{"question": string, "options": [string, string, string, string], "correct": 0|1|2|3, "explanation": string}]} — exactement ${n} questions, 4 options chacune, une seule correcte, options plausibles, index "correct" exact.`,
    flashcards: `{"title": string, "description": string, "cards": [{"front": string, "back": string}]} — exactement ${n} cartes : recto = terme/question courte, verso = définition/réponse concise.`,
    fillblank: `{"title": string, "description": string, "text": string} — un texte de 6 à 10 phrases reprenant les idées clés, avec ${n} mots importants à deviner placés entre crochets, ex. "Le [chat] boit du [lait]". Un seul mot par crochet.`,
    summary: `{"title": string, "summary": string, "key_points": [string], "definitions": [{"term": string, "definition": string}], "exercises": [{"question": string, "answer": string}]} — fiche de révision : résumé (8-12 lignes), 5 à 8 points clés, 4 à 8 définitions, ${Math.min(n, 8)} exercices courts avec corrigé.`
  }
  const messages = [
    { role: 'system', content: `Tu es un enseignant expérimenté qui prépare des supports pédagogiques. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, respectant ce schéma : ${schemas[kind]} ${ctx}` },
    { role: 'user', content: `TEXTE DU COURS :\n\n${source}` }
  ]
  const llm = await llmChat(c.env, messages, { json: true, timeoutMs: 55000, engine: b.engine })
  if (!llm.ok) return c.json({ error: llm.error }, llm.status as any)
  const raw = llm.content, model = llm.model
  let data: any
  try { data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { return c.json({ error: /credit|plan|subscribe|quota|billing/i.test(raw) ? `Service IA : ${raw.slice(0, 220)}` : 'Réponse IA illisible, réessayez.' }, 502) }
  // Normalisation
  if (kind === 'quiz') data.questions = (data.questions || []).filter((q: any) => q?.question && Array.isArray(q.options) && q.options.length >= 2).map((q: any) => ({ question: String(q.question), options: q.options.slice(0, 4).map(String), correct: Math.min(Math.max(Number(q.correct) || 0, 0), Math.min(q.options.length, 4) - 1), explanation: q.explanation ? String(q.explanation) : '' }))
  if (kind === 'flashcards') data.cards = (data.cards || []).filter((x: any) => x?.front && x?.back).map((x: any) => ({ front: String(x.front), back: String(x.back) }))
  if (kind === 'fillblank' && !/\[[^\]]+\]/.test(String(data.text || ''))) return c.json({ error: 'Le texte généré ne contient pas de mots entre crochets, réessayez.' }, 502)
  await aiBump(c.env)
  await audit(c.env, c, user, 'ai_generate', 'interactive_courses', null, null, { kind, level, subject, chars: source.length, model })
  return c.json({ ok: true, kind, data, model, used: used + 1, limit: AI_DAILY_LIMIT })
})
const AI_TOKEN_COST: Record<string, number> = { exercise: 1, evaluation: 5, quiz: 2, flashcards: 2, fillblank: 2, summary: 2, rephrase: 1, answer: 1 }
const AI_FREE_TOKENS = 50
export async function aiWallet(env: Bindings, userId: number) {
  const r = await sb(env, `ai_wallets?user_id=eq.${userId}&select=*`)
  if (!r.ok) return null // table absente
  if (r.data?.[0]) return r.data[0]
  const c = await sb(env, 'ai_wallets', { method: 'POST', body: JSON.stringify({ user_id: userId, balance: AI_FREE_TOKENS, granted: AI_FREE_TOKENS, consumed: 0 }) })
  return c.data?.[0] || { user_id: userId, balance: AI_FREE_TOKENS, granted: AI_FREE_TOKENS, consumed: 0 }
}
// Débite le portefeuille ; renvoie une erreur texte si solde insuffisant (admin : illimité)
export async function aiCharge(env: Bindings, user: any, action: string, costUsd?: number): Promise<string | null> {
  const cost = AI_TOKEN_COST[action] ?? 1
  const w = await aiWallet(env, user.id)
  if (!w) return null // module jetons non installé → pas de limite par jetons
  if (user.role !== 'admin' && Number(w.balance) < cost) return `Solde de jetons IA insuffisant (${w.balance} restant, ${cost} requis). Demandez une recharge à l'administration.`
  await sb(env, `ai_wallets?user_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ balance: Number(w.balance) - (user.role === 'admin' ? 0 : cost), consumed: Number(w.consumed) + cost, updated_at: new Date().toISOString() }) })
  await sb(env, 'ai_token_moves', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user.id, delta: -cost, action, cost_usd: costUsd ?? null }) })
  return null
}
// ---------- Agent tuteur IA « Rafik » : conversation (élèves / parents / enseignants), ton adapté à l'âge, bascule moteur ----------
// Le client joue la réponse avec la Web Speech API (voix « ado » : débit/tonalité ajustés) ; aucune clé côté client.
const TUTOR_MAX_TURNS = 12
app.post('/api/ai/tutor', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!aiEngines(c.env).length) return c.json({ error: 'Tuteur IA non configuré : ajoutez OPENAI_API_KEY ou AI_ALT_API_KEY dans les secrets.' }, 503)
  const ip = clientIp(c); if (!rateLimit(`tutor:${user.id}:${ip}`, 30, 600_000).ok) return c.json({ error: 'Trop de messages, patientez quelques minutes.' }, 429)
  const b = await c.req.json().catch(() => ({}))
  const history = (Array.isArray(b.messages) ? b.messages : []).filter((m: any) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-TUTOR_MAX_TURNS).map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
  if (!history.length || history[history.length - 1].role !== 'user') return c.json({ error: 'Message vide' }, 400)
  const lang = b.lang === 'ar' ? 'ar' : 'fr'
  const level = String(b.level || '').slice(0, 10)
  const subject = String(b.subject || '').slice(0, 60)
  const persona = ['teen', 'kid', 'adult'].includes(b.persona) ? b.persona : (user.role === 'student' ? 'teen' : 'adult')
  const B = await getBrand(c.env)
  const tone = persona === 'kid' ? 'Tu parles à un enfant de 6-10 ans : phrases très courtes, mots simples, beaucoup d\u2019encouragements, un exemple concret par explication.'
    : persona === 'teen' ? 'Tu parles à un(e) ado de 11-17 ans : ton complice et énergique, tutoiement, expressions naturelles des jeunes (sans vulgarité ni argot excessif), humour léger, phrases courtes, tu poses une question à la fin pour vérifier la compréhension. Tu ne donnes JAMAIS la réponse finale d\u2019un exercice directement : tu guides étape par étape (méthode socratique).'
    : 'Tu parles à un adulte (parent ou enseignant) : ton professionnel, clair et bienveillant, vouvoiement.'
  const sys = `Tu es « Rafik », le tuteur scolaire IA de ${B.name} (${B.country === 'TN' || !B.country ? 'Tunisie' : B.country}). Programme scolaire tunisien. ${tone}
Langue de réponse : ${lang === 'ar' ? 'arabe standard simple (العربية الفصحى المبسطة), avec les termes mathématiques/scientifiques en arabe comme dans les manuels tunisiens' : 'français'}. ${level ? `Niveau de l\u2019élève : ${CERT_LEVELS[level] || level}. ` : ''}${subject ? `Matière : ${subject}. ` : ''}
Règles : réponses courtes (max ~120 mots) adaptées à la lecture à voix haute ; pas de markdown lourd (pas de tableaux, pas de titres #), listes simples autorisées ; formules écrites en toutes lettres lisibles (ex. « 3 fois 4 égale 12 ») ; si la question sort du cadre scolaire ou est inappropriée, recentre gentiment vers les études ; ne révèle jamais d\u2019informations personnelles sur d\u2019autres élèves ; ne te fais jamais passer pour un humain.
Réponds UNIQUEMENT en JSON : {"reply": string, "emoji": string, "suggestions": [string, string, string]} — suggestions = 3 questions de suivi très courtes que l\u2019élève pourrait poser.`
  const llm = await llmChat(c.env, [{ role: 'system', content: sys }, ...history], { json: true, timeoutMs: 40000, engine: b.engine })
  if (!llm.ok) return c.json({ error: llm.error }, llm.status as any)
  let data: any
  try { data = JSON.parse(llm.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { data = { reply: llm.content.slice(0, 1200), emoji: '💡', suggestions: [] } }
  const reply = String(data.reply || '').trim(); if (!reply) return c.json({ error: 'Réponse IA vide, réessayez.' }, 502)
  try { await aiBump(c.env) } catch {}
  try { await audit(c.env, c, user, 'ai_tutor', 'ai_tutor', null, null, { persona, lang, level, subject, engine: llm.engine, model: llm.model, chars: reply.length }) } catch {}
  return c.json({ ok: true, reply, emoji: String(data.emoji || '💡').slice(0, 4), suggestions: (Array.isArray(data.suggestions) ? data.suggestions : []).slice(0, 3).map((x: any) => String(x).slice(0, 90)), engine: llm.engine, model: llm.model })
})
app.get('/api/ai/wallet', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const w = await aiWallet(c.env, user.id)
  if (!w) return c.json({ supported: false, balance: null, costs: AI_TOKEN_COST, enabled: aiEngines(c.env).length > 0 })
  const moves = (await sb(c.env, `ai_token_moves?user_id=eq.${user.id}&select=delta,action,created_at&order=created_at.desc&limit=20`)).data || []
  return c.json({ supported: true, ...w, unlimited: user.role === 'admin', costs: AI_TOKEN_COST, moves, enabled: aiEngines(c.env).length > 0 })
})
// Admin : liste des portefeuilles + recharge
app.get('/api/admin/ai-wallets', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const [w, u] = await Promise.all([sb(c.env, 'ai_wallets?select=*&order=consumed.desc'), sb(c.env, 'user_accounts?select=id,name,email,role&role=in.(teacher,admin)')])
  if (!w.ok) return c.json({ supported: false, items: [] })
  const byId = Object.fromEntries((u.data || []).map((x: any) => [x.id, x]))
  const items = (u.data || []).map((x: any) => ({ ...x, wallet: (w.data || []).find((y: any) => y.user_id === x.id) || null }))
  const spent = (await sb(c.env, 'ai_token_moves?select=cost_usd,delta&delta=lt.0')).data || []
  return c.json({ supported: true, items, total_consumed: spent.reduce((a: number, m: any) => a - Number(m.delta), 0), total_cost_usd: spent.reduce((a: number, m: any) => a + Number(m.cost_usd || 0), 0), byId })
})
app.post('/api/admin/ai-wallets/credit', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json(); const uid = Number(b.user_id); const n = Number(b.tokens)
  if (!uid || !n) return c.json({ error: 'user_id et tokens requis' }, 400)
  const w = await aiWallet(c.env, uid)
  if (!w) return c.json({ error: 'Module jetons non installé (migration 0015)' }, 503)
  await sb(c.env, `ai_wallets?user_id=eq.${uid}`, { method: 'PATCH', body: JSON.stringify({ balance: Number(w.balance) + n, granted: Number(w.granted) + Math.max(n, 0), updated_at: new Date().toISOString() }) })
  await sb(c.env, 'ai_token_moves', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, delta: n, action: 'credit' }) })
  await audit(c.env, c, user, 'ai_credit', 'ai_wallets', uid, { balance: w.balance }, { delta: n })
  try { await sb(c.env, 'notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ type: 'info', title: '🪙 Jetons IA crédités', message: `${n} jetons ont été ajoutés à votre compte.`, target_user_id: uid, created_by: user.id }) }) } catch {}
  return c.json({ ok: true, balance: Number(w.balance) + n })
})

export default app
