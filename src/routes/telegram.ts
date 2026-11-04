// Routes telegram
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { getBrand } from '../lib/brand'
import { adminTelegramChats, getTelegramChats, healthNotify, refreshAdminChatsCache } from '../lib/notify'
import { getSettings, sb } from '../lib/supabase'
import { normPhone } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Telegram : webhook + configuration ----------
// Webhook appelé par Telegram quand un parent écrit au bot
app.post('/api/telegram/webhook', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ ok: true })
  const update = await c.req.json().catch(() => ({}))
  const msg = update.message
  if (!msg?.chat?.id || !msg.text) return c.json({ ok: true })
  const chatId = String(msg.chat.id)
  const text = String(msg.text).trim()
  const tgApi = `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`
  const reply = (t: string) => fetch(tgApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: t, parse_mode: 'HTML' }) })

  // /start → message d'accueil
  if (text.startsWith('/start')) {
    await reply(`🏫 <b>Bienvenue sur les notifications de ${(await getBrand(c.env)).name} !</b>\n\nPour recevoir les alertes concernant votre enfant (absences, notes, frais), envoyez simplement votre <b>numéro de téléphone</b> tel qu'enregistré à l'école.\n\nExemple : <code>52517581</code>`)
    return c.json({ ok: true })
  }

  // Sinon : on cherche le numéro dans les élèves
  const phone = normPhone(text)
  if (phone.length < 8) {
    await reply('❌ Numéro invalide. Envoyez votre numéro de téléphone (8 chiffres), exemple : <code>52517581</code>')
    return c.json({ ok: true })
  }
  const st = await sb(c.env, `students?select=id,first_name,last_name,parent_phone,parent_name&status=eq.actif`)
  const matches = (st.data || []).filter((s: any) => normPhone(s.parent_phone) === phone)
  if (!matches.length) {
    await reply("❌ Aucun élève trouvé avec ce numéro. Vérifiez que c'est bien le numéro communiqué à l'école, ou contactez l'administration : +216 52 517 581")
    return c.json({ ok: true })
  }
  // Enregistrer la liaison téléphone → chat Telegram
  const chats = await getTelegramChats(c.env)
  chats[phone] = chatId
  await sb(c.env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ key: 'telegram_chats', value: chats }) })
  const names = matches.map((s: any) => `${s.first_name} ${s.last_name}`).join(', ')
  await reply(`✅ <b>Liaison réussie !</b>\n\nVous recevrez désormais les notifications concernant : <b>${names}</b>\n\n(absences, retards, notes, rappels de frais)`)
  return c.json({ ok: true })
})

// Configurer le webhook Telegram (admin) : enregistre l'URL actuelle auprès de Telegram
app.post('/api/telegram/setup', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: "TELEGRAM_BOT_TOKEN non configuré. Ajoutez-le dans .dev.vars (local) ou les secrets (production)." }, 400)
  const u = new URL(c.req.url)
  const origin = `https://${u.host}` // Telegram exige HTTPS (derrière proxy, le protocole détecté peut être http)
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${origin}/api/telegram/webhook` })
  })
  const data: any = await res.json().catch(() => ({}))
  const me = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getMe`).then(r => r.json()).catch(() => ({} as any))
  return c.json({ ok: data.ok === true, webhook: `${origin}/api/telegram/webhook`, bot: (me as any).result?.username || null, detail: data.description || null })
})

// Statut Telegram : bot + nombre de parents liés
app.get('/api/telegram/status', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ configured: false, linked: 0, bot: null })
  const chats = await getTelegramChats(c.env)
  const me: any = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getMe`).then(r => r.json()).catch(() => ({}))
  return c.json({ configured: true, linked: Object.keys(chats).length, bot: me.result?.username || null })
})

// ---------- Canal d'annonces Telegram ----------
// Publier une annonce sur le canal Telegram de l'école (le bot doit être admin du canal)
// Normalise l'identifiant d'un canal : @nom, nom, -100xxxx ou lien t.me/nom
function normalizeChannel(v: string): string {
  let t = String(v || '').trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
  if (/^-?\d+$/.test(t)) return t
  t = t.replace(/^@/, '')
  return t ? '@' + t : ''
}
// Test d'alerte monitoring (admin) : envoie un message Telegram de test aux destinataires d'alerte
app.post('/api/admin/health/test-alert', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  await refreshAdminChatsCache(c.env)
  const chats = await adminTelegramChats(c.env)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ ok: false, reason: 'TELEGRAM_BOT_TOKEN manquant' })
  if (!chats.length) return c.json({ ok: false, reason: 'Aucun destinataire : liez le téléphone d\u2019un compte admin au bot Telegram, ou définissez TELEGRAM_ADMIN_CHAT_ID' })
  await healthNotify(c.env, `🔔 <b>${(await getBrand(c.env)).name} — test d\u2019alerte monitoring</b>\nCe compte recevra les alertes si la base de données devient inaccessible.`)
  return c.json({ ok: true, recipients: chats.length })
})
app.post('/api/telegram/channel/verify', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Bot Telegram non configuré (TELEGRAM_BOT_TOKEN)' }, 400)
  const b = await c.req.json()
  const target = normalizeChannel(b.channel)
  if (!target) return c.json({ error: 'Nom de canal vide' }, 400)
  const api = `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}`
  const me: any = await fetch(`${api}/getMe`).then(r => r.json()).catch(() => ({}))
  const botUser = me.result?.username || ''
  if (botUser && target.toLowerCase() === '@' + botUser.toLowerCase()) {
    return c.json({ error: `« ${target} » est le nom du BOT, pas d'un canal. Créez un canal Telegram (ex : @RahmaAcademyTN), ajoutez le bot @${botUser} comme administrateur, puis saisissez le nom de ce canal.` }, 400)
  }
  const chat: any = await fetch(`${api}/getChat?chat_id=${encodeURIComponent(target)}`).then(r => r.json()).catch(() => ({}))
  if (!chat.ok) return c.json({ error: `Canal introuvable (${chat.description || 'chat not found'}). Vérifiez le nom exact du canal public, ou son identifiant numérique (-100…) pour un canal privé.` }, 404)
  if (!['channel', 'supergroup', 'group'].includes(chat.result?.type)) {
    return c.json({ error: `« ${target} » est un ${chat.result?.type === 'private' ? 'compte utilisateur/bot' : chat.result?.type}, pas un canal.` }, 400)
  }
  const member: any = await fetch(`${api}/getChatMember?chat_id=${encodeURIComponent(target)}&user_id=${me.result?.id}`).then(r => r.json()).catch(() => ({}))
  if (!member.ok && /member list is inaccessible/i.test(member.description || '')) {
    return c.json({ error: `Le canal « ${chat.result.title || target} » existe ✅ mais le bot @${botUser} n'en est pas encore administrateur. Dans Telegram : ouvrez le canal → (nom du canal) → Administrateurs → Ajouter un administrateur → cherchez @${botUser} → cochez « Publier des messages » → Enregistrer. Puis recliquez sur Vérifier.`, step: 'add_admin', title: chat.result.title }, 400)
  }
  const st = member.result?.status
  const canPost = st === 'creator' || (st === 'administrator' && member.result?.can_post_messages !== false)
  if (!canPost) return c.json({ error: `Le bot @${botUser} n'est pas administrateur du canal ${chat.result.title || target} (statut : ${st || 'inconnu'}). Dans Telegram : canal → Administrateurs → Ajouter → @${botUser} → autoriser « Publier des messages ».` }, 400)
  return c.json({ ok: true, chat_id: String(chat.result.id), username: chat.result.username ? '@' + chat.result.username : target, title: chat.result.title, type: chat.result.type, members: chat.result.members_count })
})

app.post('/api/telegram/announce', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Bot Telegram non configuré (TELEGRAM_BOT_TOKEN)' }, 400)
  const b = await c.req.json()
  if (!b.message) return c.json({ error: 'Message requis' }, 400)
  const chan = await getSettings(c.env, 'telegram_channel')
  const target = normalizeChannel(chan.chat_id || chan.username || '')
  if (!target) return c.json({ error: "Aucun canal configuré. Enregistrez le nom du canal dans Paramètres → Notifications → Canal d'annonces Telegram." }, 400)
  const text = `📢 <b>${b.title || 'Annonce'}</b>\n\n${b.message}\n\n— ${(await getBrand(c.env)).name}`
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: target, text, parse_mode: 'HTML' })
  })
  const data: any = await res.json().catch(() => ({}))
  if (data.ok) {
    try { await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: null, type: 'info', title: `📢 ${b.title || 'Annonce'}`, message: b.message, recipient: 'Canal Telegram', sent_via: 'telegram', status: 'sent' }) }) } catch (e) {}
    await audit(c.env, c, user, 'announce', 'telegram_channel', target, null, { title: b.title, message: String(b.message).slice(0, 200) })
    return c.json({ ok: true })
  }
  // Messages d'erreur Telegram traduits en actions concrètes
  const d = String(data.description || '')
  let hint = d
  if (/can't send messages to the bot/i.test(d)) hint = "Le canal configuré est le nom du BOT lui-même. Saisissez le nom d'un vrai canal Telegram dans Paramètres → Notifications."
  else if (/chat not found/i.test(d)) hint = 'Canal introuvable : vérifiez le nom exact (canal public) ou utilisez son identifiant numérique (canal privé).'
  else if (/not enough rights|CHAT_WRITE_FORBIDDEN|need administrator rights/i.test(d)) hint = "Le bot n'est pas administrateur du canal ou n'a pas le droit « Publier des messages »."
  else if (/member list is inaccessible|bot is not a member|not a member/i.test(d)) hint = "Le bot n'est pas (encore) administrateur du canal. Dans Telegram : ouvrez le canal → Administrateurs → Ajouter un administrateur → @RahmaEcoleBot → cochez « Publier des messages »."
  else if (/bot was kicked/i.test(d)) hint = 'Le bot a été retiré du canal : ajoutez-le de nouveau comme administrateur.'
  return c.json({ ok: false, error: hint, detail: d }, 400)
})

export default app
