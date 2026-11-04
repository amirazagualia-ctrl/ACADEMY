// Routes notifications
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { getUser, linkedIds, teacherAssignedIds } from '../lib/auth'
import { buildFeed, notifyParent, targetedFilter, targetedSupported } from '../lib/notifications'
import { sb } from '../lib/supabase'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/notifications/feed', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const limit = Math.min(200, Number(c.req.query('limit') || 100))
  const type = c.req.query('type') || ''
  return c.json(await buildFeed(c.env, user, limit, type))
})

// Compteur de non-lus (badge cloche) — léger
app.get('/api/notifications/unread-count', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const supported = await targetedSupported(c.env)
  if (!supported) return c.json({ unread: 0, supported: false })
  const since = new Date(Date.now() - 45 * 86400000).toISOString()
  const ids: number[] = []
  const q1 = await sb(c.env, `notifications?select=id,created_by&${await targetedFilter(c.env, user)}&created_at=gte.${since}&limit=300`)
  for (const n of (q1.data || [])) if (!(n.created_by && Number(n.created_by) === Number(user.id) && user.role !== 'admin')) ids.push(Number(n.id))
  let sids: number[] | null = null
  if (user.role === 'parent' || user.role === 'student') sids = linkedIds(user)
  else if (user.role === 'teacher') sids = await teacherAssignedIds(c.env, user)
  if (!(sids && !sids.length)) {
    let q = `notifications?select=id&type=neq.chat&sent_via=eq.app&audience=is.null&created_at=gte.${since}&limit=300`
    if (sids) q += `&student_id=in.(${sids.join(',')})`
    else if (user.role !== 'admin') q += `&student_id=not.is.null`
    const q2 = await sb(c.env, q)
    for (const n of (q2.data || [])) ids.push(Number(n.id))
  }
  if (!ids.length) return c.json({ unread: 0, supported: true })
  const rr = await sb(c.env, `notification_reads?user_id=eq.${user.id}&notification_id=in.(${ids.join(',')})&select=notification_id`)
  const read = new Set((rr.data || []).map((x: any) => Number(x.notification_id)))
  return c.json({ unread: ids.filter(id => !read.has(id)).length, supported: true })
})

// Marquer comme lu : { ids: [..] } ou { all: true } (toutes celles du fil)
app.post('/api/notifications/read', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await targetedSupported(c.env))) return c.json({ ok: false, supported: false })
  const b = await c.req.json().catch(() => ({}))
  let ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : []
  if (b.all) {
    const feed = await buildFeed(c.env, user, 200, '')
    ids = feed.items.filter((n: any) => !n.read).map((n: any) => Number(n.id))
  }
  if (!ids.length) return c.json({ ok: true, marked: 0 })
  const rows = ids.map(id => ({ user_id: user.id, notification_id: id }))
  const r = await sb(c.env, 'notification_reads?on_conflict=user_id,notification_id', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } })
  return c.json({ ok: r.ok, marked: ids.length })
})

// ---------- Notification manuelle ----------
app.post('/api/notify', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const results = await notifyParent(c.env, b.student_id, b.type || 'info', b.title || 'Information', b.message)
  return c.json({ ok: true, results })
})

// Partager un cours interactif : notifier les tuteurs des élèves du niveau
app.post('/api/interactive/notify', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const cid = Number(b.course_id)
  if (!cid) return c.json({ error: 'course_id requis' }, 400)
  const cr = await sb(c.env, `interactive_courses?id=eq.${cid}&select=id,title,level,course_type`)
  const ic = cr.data?.[0]
  if (!ic) return c.json({ error: 'Cours interactif introuvable' }, 404)
  // Élèves ciblés : ceux du niveau du cours (ou tous si pas de niveau), actifs
  let q = `students?status=eq.actif&select=id`
  if (ic.level) q += `&level=eq.${encodeURIComponent(ic.level)}`
  const st = await sb(c.env, q)
  let ids: number[] = (st.data || []).map((s: any) => Number(s.id))
  // Enseignant : limiter à ses élèves affectés
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null) ids = ids.filter(id => aids.includes(id))
  }
  if (!ids.length) return c.json({ error: 'Aucun élève actif trouvé pour ce niveau' }, 404)
  const typeLabels: Record<string, string> = { quiz: 'Quiz', flashcards: 'Cartes mémoire', fillblank: 'Texte à trous', external: 'Application' }
  const origin = new URL(c.req.url).origin
  const link = `${origin}/#ic-${ic.id}`
  const msg = `📚 Nouveau cours interactif « ${ic.title} » (${typeLabels[ic.course_type] || 'Quiz'}) est disponible ! Ouvrez l'application, rubrique Cours interactifs, ou suivez ce lien : ${link}`
  let sent = 0
  for (const sid of ids.slice(0, 100)) {
    try { await notifyParent(c.env, sid, 'info', 'Nouveau cours interactif', msg); sent++ } catch (e) {}
  }
  return c.json({ ok: true, sent, total: ids.length })
})

export default app
