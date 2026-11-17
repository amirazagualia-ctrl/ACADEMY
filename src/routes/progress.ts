// Routes progress
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { getUser } from '../lib/auth'
import { getSettings, sb } from '../lib/supabase'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- بوابة الوضعيات الرياضية — progression sauvegardée (settings key 'situations_progress') ----------
// Structure : { [userId]: { [situationId]: { score, max, stars, attempts, best_at } } } — léger, sans migration.
app.get('/api/situations/progress', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const all = await getSettings(c.env, 'situations_progress')
  if (['admin', 'teacher'].includes(user.role) && c.req.query('all') === '1') {
    // Vue enseignant : progression de tous les comptes élèves (nom + total)
    const accounts = (await sb(c.env, `user_accounts?role=in.(student,parent)&select=id,name,linked_student_id&status=eq.active`)).data || []
    const rows = accounts.map((a: any) => { const p = all[a.id] || {}; const done = Object.values(p) as any[]; return { user_id: a.id, name: a.name, student_id: a.linked_student_id, completed: done.length, points: done.reduce((x: number, y: any) => x + (y.score || 0), 0), stars: done.reduce((x: number, y: any) => x + (y.stars || 0), 0) } }).filter((r: any) => r.completed > 0).sort((a: any, b: any) => b.points - a.points)
    return c.json({ mine: all[user.id] || {}, leaderboard: rows })
  }
  // Classement anonymisé (top 10 par points) pour motiver
  const board = Object.entries(all).map(([uid, p]: any) => { const done = Object.values(p) as any[]; return { user_id: Number(uid), completed: done.length, points: done.reduce((x: number, y: any) => x + (y.score || 0), 0) } }).filter(r => r.completed > 0).sort((a, b) => b.points - a.points).slice(0, 10)
  const names: Record<number, string> = {}
  if (board.length) { const acc = (await sb(c.env, `user_accounts?id=in.(${board.map(b => b.user_id).join(',')})&select=id,name`)).data || []; acc.forEach((a: any) => { names[a.id] = a.name }) }
  return c.json({ mine: all[user.id] || {}, leaderboard: board.map(b => ({ ...b, name: (names[b.user_id] || 'Élève').split(' ')[0], me: b.user_id === user.id })) })
})
app.post('/api/situations/progress', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json().catch(() => ({}))
  const id = String(b.situation_id || '').slice(0, 40); const score = Math.max(0, Math.min(Number(b.score) || 0, 100)); const max = Math.max(1, Number(b.max) || 50)
  if (!id) return c.json({ error: 'Paramètres invalides' }, 400)
  const all = await getSettings(c.env, 'situations_progress')
  const mine = all[user.id] || {}
  const prev = mine[id] || { attempts: 0, score: 0 }
  const stars = score >= max * 0.9 ? 5 : score >= max * 0.75 ? 4 : score >= max * 0.6 ? 3 : score >= max * 0.4 ? 2 : 1
  mine[id] = { score: Math.max(prev.score || 0, score), max, stars: Math.max(prev.stars || 0, stars), attempts: (prev.attempts || 0) + 1, last_score: score, best_at: score >= (prev.score || 0) ? new Date().toISOString() : prev.best_at, last_at: new Date().toISOString() }
  all[user.id] = mine
  await sb(c.env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'situations_progress', value: all }) })
  return c.json({ ok: true, entry: mine[id], total: Object.values(mine).reduce((x: number, y: any) => x + (y.score || 0), 0), completed: Object.keys(mine).length })
})

// ---------- F65 : 🧮 رياضيات السادسة — progression (settings.math6_progress) ----------
app.get('/api/math6/progress', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const all = await getSettings(c.env, 'math6_progress')
  const summarize = (p: any) => { const v = Object.values(p || {}) as any[]; return { series: v.reduce((a, x) => a + (x.attempts || 0), 0), points: v.reduce((a, x) => a + (x.best || 0), 0), stars: v.reduce((a, x) => a + (x.stars || 0), 0), mastered: Object.entries(p || {}).filter(([, x]: any) => x.max && x.best / x.max >= .8).map(([k]) => k), last: v.map(x => x.last_at).filter(Boolean).sort().pop() || null } }
  if (['admin', 'teacher'].includes(user.role) && c.req.query('all') === '1') {
    const accounts = (await sb(c.env, `user_accounts?role=in.(student,parent)&select=id,name,linked_student_id&status=eq.active`)).data || []
    const rows = accounts.map((a: any) => ({ user_id: a.id, name: a.name, student_id: a.linked_student_id, ...summarize(all[a.id]) })).filter((r: any) => r.series > 0).sort((a: any, b: any) => b.points - a.points)
    return c.json({ mine: all[user.id] || {}, leaderboard: rows })
  }
  const board = Object.entries(all).map(([uid, p]: any) => ({ user_id: Number(uid), ...summarize(p) })).filter(b => b.series > 0).sort((a, b) => b.points - a.points).slice(0, 10)
  const names: Record<number, string> = {}
  if (board.length) { const acc = (await sb(c.env, `user_accounts?id=in.(${board.map(b => b.user_id).join(',')})&select=id,name`)).data || []; acc.forEach((a: any) => { names[a.id] = a.name }) }
  return c.json({ mine: all[user.id] || {}, leaderboard: board.map(b => ({ ...b, name: (names[b.user_id] || 'Élève').split(' ')[0], me: b.user_id === user.id })) })
})
app.post('/api/math6/progress', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json().catch(() => ({}))
  const unit = String(b.unit || '').replace(/[^a-z]/g, '').slice(0, 20); const level = Math.min(3, Math.max(1, Number(b.level) || 1))
  const max = Math.max(1, Number(b.max) || 100); const score = Math.max(0, Math.min(Number(b.score) || 0, max)); const seconds = Math.max(0, Math.min(Number(b.seconds) || 0, 36000))
  if (!unit) return c.json({ error: 'Paramètres invalides' }, 400)
  const key = `${unit}_${level}`
  const all = await getSettings(c.env, 'math6_progress')
  const mine = all[user.id] || {}
  const prev = mine[key] || { attempts: 0, best: 0 }
  const pct = score / max; const stars = pct >= .9 ? 5 : pct >= .75 ? 4 : pct >= .6 ? 3 : pct >= .4 ? 2 : 1
  const improved = score > (prev.best || 0)
  mine[key] = { best: Math.max(prev.best || 0, score), max, stars: Math.max(prev.stars || 0, stars), attempts: (prev.attempts || 0) + 1, last_score: score, seconds, best_at: improved ? new Date().toISOString() : (prev.best_at || null), last_at: new Date().toISOString() }
  all[user.id] = mine
  await sb(c.env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'math6_progress', value: all }) })
  return c.json({ ok: true, entry: mine[key], improved, total: Object.values(mine).reduce((x: number, y: any) => x + (y.best || 0), 0) })
})

// ---------- F66 : 📚 ورشة التمارين — progression (settings.exercices_progress) ----------
// Structure : { [userId]: { [setId]: { subject, best, max, stars, attempts, last_at } } } — léger, sans migration.
// Une série est identifiée par son id du contenu arabe (m1…m6, s1…s7) ; les étoiles vont de 0 à 3.
function exaSummarize(p: any) {
  const v = Object.values(p || {}) as any[]
  return {
    sets: v.length,
    points: v.reduce((a: number, x: any) => a + (x.best || 0), 0),
    stars: v.reduce((a: number, x: any) => a + (x.stars || 0), 0),
    last: v.map((x: any) => x.last_at).filter(Boolean).sort().pop() || null
  }
}
app.get('/api/exercices/progress', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const all = await getSettings(c.env, 'exercices_progress')
  if (['admin', 'teacher'].includes(user.role) && c.req.query('all') === '1') {
    const accounts = (await sb(c.env, `user_accounts?role=in.(student,parent)&select=id,name,linked_student_id&status=eq.active`)).data || []
    const rows = accounts.map((a: any) => ({ user_id: a.id, name: a.name, student_id: a.linked_student_id, ...exaSummarize(all[a.id]) })).filter((r: any) => r.sets > 0).sort((a: any, b: any) => b.points - a.points)
    return c.json({ mine: all[user.id] || {}, leaderboard: rows })
  }
  const board = Object.entries(all).map(([uid, p]: any) => ({ user_id: Number(uid), ...exaSummarize(p) })).filter(b => b.sets > 0).sort((a, b) => b.points - a.points).slice(0, 10)
  const names: Record<number, string> = {}
  if (board.length) { const acc = (await sb(c.env, `user_accounts?id=in.(${board.map(b => b.user_id).join(',')})&select=id,name`)).data || []; acc.forEach((a: any) => { names[a.id] = a.name }) }
  return c.json({ mine: all[user.id] || {}, leaderboard: board.map(b => ({ ...b, name: (names[b.user_id] || 'Élève').split(' ')[0], me: b.user_id === user.id })) })
})
app.post('/api/exercices/progress', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json().catch(() => ({}))
  const all = await getSettings(c.env, 'exercices_progress')
  // Remise à zéro de la progression de la série (ou de toutes les séries si reset sans set_id)
  if (b.reset) {
    const id = String(b.set_id || '').replace(/[^a-z0-9]/gi, '').slice(0, 20)
    if (id) { const mine = all[user.id] || {}; delete mine[id]; all[user.id] = mine }
    else delete all[user.id]
    await sb(c.env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'exercices_progress', value: all }) })
    return c.json({ ok: true, reset: true })
  }
  const id = String(b.set_id || '').replace(/[^a-z0-9]/gi, '').slice(0, 20)
  const subject = String(b.subject || '').replace(/[^a-z]/gi, '').slice(0, 20)
  const max = Math.max(1, Number(b.max) || 1); const score = Math.max(0, Math.min(Number(b.score) || 0, max))
  if (!id) return c.json({ error: 'Paramètres invalides' }, 400)
  const mine = all[user.id] || {}
  const prev = mine[id] || { attempts: 0, best: 0 }
  const pct = score / max; const stars = Math.max(0, Math.min(Number(b.stars) || 0, 3))
  const improved = pct > (prev.pct || 0)
  mine[id] = { subject, best: Math.max(prev.best || 0, score), max, pct: Math.max(prev.pct || 0, pct), stars: Math.max(prev.stars || 0, stars), attempts: (prev.attempts || 0) + 1, last_score: score, best_at: improved ? new Date().toISOString() : (prev.best_at || null), last_at: new Date().toISOString() }
  all[user.id] = mine
  await sb(c.env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'exercices_progress', value: all }) })
  return c.json({ ok: true, entry: mine[id], improved, ...exaSummarize(mine) })
})

export default app
