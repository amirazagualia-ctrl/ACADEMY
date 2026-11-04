// Routes chat
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getTeacherId, getUser, linkedIds, teacherAssignedIds } from '../lib/auth'
import { getBrand } from '../lib/brand'
import { broadcastTargeted } from '../lib/notifications'
import { sendTelegram } from '../lib/notify'
import { sb } from '../lib/supabase'
import { escapeHtml, publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Messagerie interne (Discussions parents <-> administration) ----------
// Stockée dans notifications avec type='chat' : un fil par élève.
// title = 'staff:Nom' ou 'parent:Nom' (expéditeur), sent_via='chat', status='unread'|'read'
const isChatStaff = (u: any) => ['admin', 'teacher'].includes(u?.role)
const fromParent = (m: any) => (m.title || '').startsWith('parent:')

// Liste des fils de discussion
app.get('/api/chat/threads', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (isChatStaff(user)) {
    // Enseignant : uniquement les fils de ses élèves affectés
    let teacherFilter: number[] | null = null
    if (user.role === 'teacher') {
      teacherFilter = await teacherAssignedIds(c.env, user)
      if (teacherFilter !== null && !teacherFilter.length) return c.json([])
    }
    const tf = teacherFilter ? `&student_id=in.(${teacherFilter.join(',')})` : ''
    const r = await sb(c.env, `notifications?type=eq.chat${tf}&select=id,student_id,title,message,status,created_at,students(first_name,last_name,level,parent_name)&order=created_at.desc&limit=500`)
    const threads: Record<string, any> = {}
    for (const m of (r.data || [])) {
      if (!m.student_id) continue
      if (!threads[m.student_id]) threads[m.student_id] = { student_id: m.student_id, student: m.students, last: { message: m.message, created_at: m.created_at, title: m.title }, unread: 0 }
      if (m.status === 'unread' && fromParent(m)) threads[m.student_id].unread++
    }
    return c.json(Object.values(threads))
  }
  // Parent / élève : un fil par enfant lié (même vide)
  const ids = linkedIds(user)
  if (!ids.length) return c.json([])
  const st = await sb(c.env, `students?id=in.(${ids.join(',')})&select=id,first_name,last_name,level`)
  const r = await sb(c.env, `notifications?type=eq.chat&student_id=in.(${ids.join(',')})&select=id,student_id,title,message,status,created_at&order=created_at.desc&limit=300`)
  const threads = (st.data || []).map((s: any) => {
    const msgs = (r.data || []).filter((m: any) => m.student_id === s.id)
    const unread = msgs.filter((m: any) => m.status === 'unread' && !fromParent(m)).length
    return { student_id: s.id, student: s, last: msgs[0] ? { message: msgs[0].message, created_at: msgs[0].created_at, title: msgs[0].title } : null, unread }
  })
  return c.json(threads)
})

// Messages d'un fil (et marquage lu des messages reçus)
app.get('/api/chat/messages/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if (!sid) return c.json({ error: 'Élève invalide' }, 400)
  if (!isChatStaff(user) && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  const r = await sb(c.env, `notifications?type=eq.chat&student_id=eq.${sid}&select=id,student_id,title,message,status,created_at&order=created_at.asc&limit=300`)
  const msgs = r.data || []
  // Marquer lus les messages envoyés par l'autre partie
  const staff = isChatStaff(user)
  const unreadIds = msgs.filter((m: any) => m.status === 'unread' && (staff ? fromParent(m) : !fromParent(m))).map((m: any) => m.id)
  if (unreadIds.length) {
    try { await sb(c.env, `notifications?id=in.(${unreadIds.join(',')})`, { method: 'PATCH', body: JSON.stringify({ status: 'read' }) }) } catch (e) {}
  }
  return c.json(msgs)
})

// Envoyer un message dans un fil
app.post('/api/chat/send', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json()
  const sid = Number(b.student_id)
  const text = String(b.text || '').trim().slice(0, 2000)
  if (!sid || !text) return c.json({ error: 'Message vide' }, 400)
  const staff = isChatStaff(user)
  if (!staff && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  // Expéditeur : ajouter la matière de l'enseignant (title = 'staff:Nom|Matière')
  let senderLabel = user.name || ''
  if (user.role === 'teacher') {
    try {
      const tid = await getTeacherId(c.env, user)
      if (tid) {
        const t = await sb(c.env, `teachers?id=eq.${tid}&select=subject`)
        const subj = t.data?.[0]?.subject
        if (subj) senderLabel = `${user.name || ''}|${subj}`
      }
    } catch (e) { /* non bloquant */ }
  }
  const row = { student_id: sid, type: 'chat', title: `${staff ? 'staff' : 'parent'}:${senderLabel}`, message: text, sent_via: 'chat', status: 'unread' }
  const r = await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur envoi', detail: r.data }, 500)
  // Réponse du staff -> prévenir le parent sur Telegram (non bloquant)
  if (staff) {
    try {
      const st = await sb(c.env, `students?id=eq.${sid}&select=first_name,last_name,parent_phone`)
      const s = st.data?.[0]
      if (s?.parent_phone) await sendTelegram(c.env, s.parent_phone, `💬 <b>Nouveau message de l'administration</b>\n\n${text}\n\n— ${(await getBrand(c.env)).name} (à propos de ${s.first_name} ${s.last_name})\nRépondez depuis votre espace parent : rubrique « Discussions ».`)
    } catch (e) { /* non bloquant */ }
  }
  return c.json(Array.isArray(r.data) ? r.data[0] : r.data, 201)
})

// ---------- Messagerie de groupe par niveau / classe (enseignant → tous les parents) ----------
// Un message est déposé dans le fil de chaque élève ciblé (préfixe 📢 + marqueur [G:id]) + Telegram aux parents + notification ciblée.
app.post('/api/chat/broadcast', async (c) => {
  const user = await getUser(c)
  if (!user || !isChatStaff(user)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const text = String(b.text || '').trim().slice(0, 2000)
  const level = String(b.level || '').trim(); const cls = String(b.class_name || '').trim()
  const explicit: number[] = Array.isArray(b.student_ids) ? b.student_ids.map(Number).filter(Boolean) : []
  if (!text) return c.json({ error: 'Message vide' }, 400)
  if (!level && !explicit.length) return c.json({ error: 'Choisissez un niveau, une classe ou des élèves' }, 400)
  let q = `students?status=eq.actif&select=id,first_name,last_name,level,class_name,parent_phone,parent_name`
  if (explicit.length) q += `&id=in.(${explicit.join(',')})`
  else { q += `&level=eq.${encodeURIComponent(level)}`; if (cls) q += `&class_name=eq.${encodeURIComponent(cls)}` }
  let targets = (await sb(c.env, q)).data || []
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) targets = targets.filter((s: any) => aids.includes(s.id)) }
  if (!targets.length) return c.json({ error: 'Aucun élève ciblé (vérifiez vos affectations)' }, 400)
  if (b.dry_run) return c.json({ dry_run: true, count: targets.length, with_phone: targets.filter((s: any) => s.parent_phone).length })
  let senderLabel = user.name || ''
  if (user.role === 'teacher') { try { const tid = await getTeacherId(c.env, user); if (tid) { const t = await sb(c.env, `teachers?id=eq.${tid}&select=subject`); if (t.data?.[0]?.subject) senderLabel = `${user.name || ''}|${t.data[0].subject}` } } catch {} }
  const gid = Date.now().toString(36)
  const scopeLabel = explicit.length ? `${targets.length} élève(s)` : `${cls || level}`
  const rows = targets.map((s: any) => ({ student_id: s.id, type: 'chat', title: `staff:${senderLabel}`, message: `📢 [${scopeLabel}] ${text}`, sent_via: 'chat', status: 'unread' }))
  const r = await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify(rows) })
  if (!r.ok) return c.json({ error: 'Erreur envoi', detail: r.data }, 500)
  // Telegram aux parents (non bloquant, max 60 pour rester dans les limites CPU)
  let tg = 0
  for (const s of targets.slice(0, 60)) { if (!s.parent_phone) continue; try { const res = await sendTelegram(c.env, s.parent_phone, `📢 <b>Message ${user.role === 'teacher' ? 'de l\u2019enseignant' : 'de l\u2019administration'} — ${escapeHtml(scopeLabel)}</b>\n\n${escapeHtml(text)}\n\n— ${escapeHtml(user.name || (await getBrand(c.env)).name)} (à propos de ${escapeHtml(s.first_name + ' ' + s.last_name)})\nRépondez depuis votre espace parent → Discussions.`); if (res.sent) tg++ } catch {} }
  // Notification ciblée (feed) pour les parents du niveau
  if (!explicit.length) { try { await broadcastTargeted(c.env, publicOrigin(c), { type: 'evenement', title: `📢 Message groupé — ${scopeLabel}`, message: text.slice(0, 300), level, ref_table: 'chat', ref_id: 0, link: '#chat', created_by: user.id }) } catch {} }
  await audit(c.env, c, user, 'chat_broadcast', 'notifications', null, null, { level, class_name: cls, count: targets.length, telegram: tg, group: gid })
  return c.json({ ok: true, count: targets.length, telegram: tg, group: gid })
})
// Classes disponibles par niveau (pour le sélecteur)
app.get('/api/chat/broadcast/targets', async (c) => {
  const user = await getUser(c)
  if (!user || !isChatStaff(user)) return c.json({ error: 'Accès refusé' }, 403)
  let st = (await sb(c.env, `students?status=eq.actif&select=id,level,class_name,parent_phone`)).data || []
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) st = st.filter((s: any) => aids.includes(s.id)) }
  const levels: Record<string, { count: number; with_phone: number; classes: Record<string, number> }> = {}
  for (const s of st) { const L = levels[s.level] = levels[s.level] || { count: 0, with_phone: 0, classes: {} }; L.count++; if (s.parent_phone) L.with_phone++; if (s.class_name) L.classes[s.class_name] = (L.classes[s.class_name] || 0) + 1 }
  return c.json({ levels })
})

export default app
