import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { sign, verify } from 'hono/jwt'

type Bindings = {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_KEY?: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
  TWILIO_SID?: string
  TWILIO_TOKEN?: string
  TWILIO_FROM?: string
  TELEGRAM_BOT_TOKEN?: string
}

const DEFAULT_SUPABASE_URL = 'https://nxtyizeoypolvrfhulpk.supabase.co'
const DEFAULT_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dHlpemVveXBvbHZyZmh1bHBrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzE4MDgxOCwiZXhwIjoyMDk4NzU2ODE4fQ.nu5rbgHXML18qT7kqwVczu9wy3VhNGh2LQL1KfAICsk'
const DEFAULT_JWT_SECRET = 'edumanage-jwt-secret-2026-tunisie'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ---------- Helpers ----------
function cfg(env: Bindings) {
  return {
    url: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: env.SUPABASE_SERVICE_KEY || DEFAULT_SERVICE_KEY,
    jwt: env.JWT_SECRET || DEFAULT_JWT_SECRET
  }
}

async function sb(env: Bindings, path: string, options: RequestInit = {}) {
  const { url, key } = cfg(env)
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(options.headers as Record<string, string> || {})
  }
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...options, headers })
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return { ok: res.ok, status: res.status, data }
  } catch (e: any) {
    return { ok: false, status: 503, data: { error: 'Base de données Supabase inaccessible. Le projet Supabase est probablement en pause — restaurez-le sur supabase.com/dashboard puis exécutez schema.sql.', detail: e.message } }
  }
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
const hashPassword = (p: string) => sha256Hex('edusalt::' + p)

async function getUser(c: any): Promise<any | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try { return await verify(auth.slice(7), cfg(c.env).jwt, 'HS256') } catch { return null }
}

function linkedIds(user: any): number[] {
  const ids: number[] = []
  if (user?.linked_student_id) ids.push(Number(user.linked_student_id))
  if (Array.isArray(user?.linked_student_ids)) user.linked_student_ids.forEach((i: any) => { const n = Number(i); if (n && !ids.includes(n)) ids.push(n) })
  return ids
}

// ---------- Enseignants : fiche liée + élèves affectés ----------
// Retrouve la fiche enseignant (teachers.id) du compte connecté : via linked_teacher_id, sinon par email (auto-liaison)
async function getTeacherId(env: Bindings, user: any): Promise<number | null> {
  const acc = await sb(env, `user_accounts?id=eq.${user.id}&select=*`)
  const a = acc.data?.[0]
  if (a?.linked_teacher_id) return Number(a.linked_teacher_id)
  const email = a?.email || user.email
  if (!email) return null
  const t = await sb(env, `teachers?email=eq.${encodeURIComponent(email)}&select=id`)
  const tid = t.data?.[0]?.id
  if (tid) { try { await sb(env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ linked_teacher_id: tid }) }) } catch (e) {} }
  return tid ? Number(tid) : null
}

// IDs des élèves affectés à l'enseignant connecté.
// Retourne null si la table teacher_students n'existe pas encore (migration 0003 non appliquée -> pas de filtrage),
// [] si aucun élève affecté (l'enseignant ne voit rien).
async function teacherAssignedIds(env: Bindings, user: any): Promise<number[] | null> {
  const tid = await getTeacherId(env, user)
  const probe = await sb(env, `teacher_students?select=student_id&limit=1`)
  if (!probe.ok) return null // table absente => comportement historique (pas de filtrage)
  if (!tid) return []
  const r = await sb(env, `teacher_students?teacher_id=eq.${tid}&select=student_id`)
  if (!r.ok) return null
  return (r.data || []).map((x: any) => Number(x.student_id))
}

// ---------- Notifications (email / SMS) ----------
async function getSettings(env: Bindings, key: string): Promise<any> {
  const r = await sb(env, `settings?key=eq.${key}&select=value`)
  return (r.ok && r.data?.[0]?.value) || {}
}

async function sendEmail(env: Bindings, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY || !to) return { sent: false, reason: 'no_api_key_or_recipient' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Rahma Cours de Français <onboarding@resend.dev>', to: [to], subject, html })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

async function sendSMS(env: Bindings, to: string, body: string) {
  if (!env.TWILIO_SID || !env.TWILIO_TOKEN || !env.TWILIO_FROM || !to) return { sent: false, reason: 'twilio_not_configured' }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

// ---------- Telegram (alternative SMS gratuite) ----------
function normPhone(p: string) { return (p || '').replace(/[^0-9]/g, '').slice(-8) } // 8 derniers chiffres (numéro tunisien)

async function getTelegramChats(env: Bindings): Promise<Record<string, string>> {
  const r = await sb(env, `settings?key=eq.telegram_chats&select=value`)
  return r.data?.[0]?.value || {}
}

async function sendTelegram(env: Bindings, parentPhone: string, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !parentPhone) return { sent: false, reason: 'telegram_not_configured' }
  const chats = await getTelegramChats(env)
  const chatId = chats[normPhone(parentPhone)]
  if (!chatId) return { sent: false, reason: 'parent_not_linked' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

// ---------- Quittance : lien sécurisé + envoi Telegram ----------
async function receiptToken(env: Bindings, id: string | number) {
  return (await sha256Hex(`quittance::${cfg(env).jwt}::${id}`)).slice(0, 20)
}

// ---------- Code élève : identifiant + code de liaison sécurisé ----------
// Format : RCF-<id>-<4 caractères> (dérivé cryptographiquement, impossible à deviner)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans I/O/0/1 (confusion)
async function studentCode(env: Bindings, id: string | number) {
  const h = await sha256Hex(`eleve::${cfg(env).jwt}::${id}`)
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += CODE_CHARS[parseInt(h.slice(i * 2, i * 2 + 2), 16) % CODE_CHARS.length]
  return `RCF-${id}-${suffix}`
}
// Valide un code saisi ; retourne l'id élève ou null
async function parseStudentCode(env: Bindings, raw: string): Promise<number | null> {
  const m = String(raw || '').trim().toUpperCase().replace(/\s+/g, '').match(/^(?:RCF-?)?(\d+)-?([A-Z2-9]{4})$/)
  if (!m) return null
  const id = Number(m[1])
  const expected = await studentCode(env, id)
  return expected.replace(/-/g, '') === `RCF${m[1]}${m[2]}` ? id : null
}

async function sendReceiptTelegram(env: Bindings, origin: string, fee: any) {
  try {
    const st = await sb(env, `students?id=eq.${fee.student_id}&select=first_name,last_name,parent_phone,parent_name`)
    const student = st.data?.[0]
    if (!student) return
    const token = await receiptToken(env, fee.id)
    const link = `${origin}/quittance/${fee.id}?t=${token}`
    const text = `🧾 <b>Paiement confirmé — Rahma Cours de Français</b>\n\nÉlève : <b>${student.first_name} ${student.last_name}</b>\n${fee.label} : <b>${Number(fee.amount)} DT</b>\nPayé le : ${fee.paid_date || new Date().toISOString().slice(0, 10)}\n\n📄 <b>Téléchargez votre quittance :</b>\n<a href="${link}">${link}</a>`
    const r = await sendTelegram(env, student.parent_phone, text)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: fee.student_id, type: 'frais', title: 'Quittance de paiement', message: `Quittance envoyée : ${link}`, recipient: student.parent_phone || student.parent_name, sent_via: 'telegram', status: r.sent ? 'sent' : 'logged' }) })
  } catch (e) { /* non bloquant */ }
}

// Créer notification + envoyer email/SMS selon les paramètres
async function notifyParent(env: Bindings, studentId: number, type: string, title: string, message: string) {
  const st = await sb(env, `students?id=eq.${studentId}&select=id,first_name,last_name,parent_email,parent_phone,parent_name`)
  const student = st.data?.[0]
  if (!student) return
  const prefs = await getSettings(env, 'notifications')
  const typeKey = type === 'absence' || type === 'retard' ? 'absence' : type === 'frais' ? 'frais' : 'note'
  const results: string[] = []

  // Notification interne (toujours)
  await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_email || student.parent_phone, sent_via: 'app', status: 'sent' }) })

  // Email
  if (prefs[`email_${typeKey}`] !== false && student.parent_email) {
    const r = await sendEmail(env, student.parent_email, `[Rahma Cours de Français] ${title}`, `<div style="font-family:Arial"><h2 style="color:#1e40af">Rahma Cours de Français</h2><p>Cher(e) ${student.parent_name || 'parent'},</p><p>${message}</p><p style="color:#666;font-size:12px">Élève : ${student.first_name} ${student.last_name}</p></div>`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_email, sent_via: 'email', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`email:${r.sent}`)
  }
  // SMS
  if (prefs[`sms_${typeKey}`] === true && student.parent_phone) {
    const r = await sendSMS(env, student.parent_phone, `Rahma Cours de Français: ${message}`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_phone, sent_via: 'sms', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`sms:${r.sent}`)
  }
  // Telegram (gratuit)
  if (prefs[`telegram_${typeKey}`] !== false && student.parent_phone) {
    const r = await sendTelegram(env, student.parent_phone, `🏫 <b>Rahma Cours de Français</b>\n<b>${title}</b>\n${message}\n\nÉlève : ${student.first_name} ${student.last_name}`)
    if (r.sent || r.reason !== 'parent_not_linked') {
      await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_phone, sent_via: 'telegram', status: r.sent ? 'sent' : 'logged' }) })
      results.push(`telegram:${r.sent}`)
    }
  }
  return results
}

// ---------- AUTH ----------
app.post('/api/auth/signup', async (c) => {
  const b = await c.req.json()
  if (!b.email || !b.password || !b.name) return c.json({ error: 'Champs requis manquants' }, 400)
  const exists = await sb(c.env, `user_accounts?email=eq.${encodeURIComponent(b.email)}&select=id`)
  if (exists.data?.length) return c.json({ error: 'Cet email est déjà utilisé' }, 409)
  const role = ['admin', 'teacher', 'parent', 'student'].includes(b.role) ? b.role : 'parent'
  // Enseignant : la matière enseignée est obligatoire
  if (role === 'teacher' && !String(b.subject || '').trim()) {
    return c.json({ error: 'La matière enseignée est obligatoire pour un compte enseignant.' }, 400)
  }
  // Liaison élève : uniquement via le code officiel (RCF-id-XXXX) fourni par l'école
  let linkedId: number | null = null
  if (b.student_code && ['parent', 'student'].includes(role)) {
    linkedId = await parseStudentCode(c.env, b.student_code)
    if (!linkedId) return c.json({ error: 'Code élève invalide. Vérifiez le code communiqué par l\'école (format RCF-12-ABCD).' }, 400)
    const st = await sb(c.env, `students?id=eq.${linkedId}&select=id&status=eq.actif`)
    if (!st.data?.length) return c.json({ error: 'Élève introuvable ou inactif' }, 404)
  }
  // Enseignant : lier (ou créer) sa fiche dans la table teachers avec la matière
  let linkedTeacherId: number | null = null
  if (role === 'teacher') {
    const subject = String(b.subject).trim()
    const ex = await sb(c.env, `teachers?email=eq.${encodeURIComponent(b.email)}&select=id,subject`)
    if (ex.data?.length) {
      linkedTeacherId = Number(ex.data[0].id)
      if (!ex.data[0].subject) { try { await sb(c.env, `teachers?id=eq.${linkedTeacherId}`, { method: 'PATCH', body: JSON.stringify({ subject }) }) } catch (e) {} }
    } else {
      const parts = String(b.name).trim().split(/\s+/)
      const tRow = { first_name: parts[0] || b.name, last_name: parts.slice(1).join(' ') || '-', email: b.email, phone: b.phone || null, subject, status: 'actif' }
      const tr = await sb(c.env, 'teachers', { method: 'POST', body: JSON.stringify(tRow) })
      if (tr.ok) linkedTeacherId = Number(tr.data?.[0]?.id) || null
    }
  }
  const payload: any = {
    name: b.name, email: b.email, password_hash: await hashPassword(b.password),
    role, status: role === 'admin' ? 'inactive' : 'active', phone: b.phone || null,
    linked_student_id: linkedId,
    linked_student_ids: linkedId ? [linkedId] : []
  }
  if (linkedTeacherId) payload.linked_teacher_id = linkedTeacherId
  let r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
  // Repli si la colonne linked_teacher_id n'existe pas encore (migration 0003 non appliquée)
  if (!r.ok && linkedTeacherId) {
    delete payload.linked_teacher_id
    r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
  }
  if (!r.ok) return c.json({ error: 'Erreur création compte', detail: r.data }, 500)
  if (role === 'admin') return c.json({ pending: true, message: "Compte admin créé mais inactif. Un administrateur doit l'activer." })
  const u = r.data[0]
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids } })
})

app.post('/api/auth/login', async (c) => {
  const b = await c.req.json()
  const r = await sb(c.env, `user_accounts?email=eq.${encodeURIComponent(b.email || '')}&select=*`)
  if (!r.ok && r.status === 503) return c.json({ error: r.data.error }, 503)
  const u = Array.isArray(r.data) ? r.data[0] : undefined
  if (!u || u.password_hash !== await hashPassword(b.password || '')) return c.json({ error: 'Email ou mot de passe incorrect' }, 401)
  if (u.status !== 'active') return c.json({ error: 'Compte désactivé. Contactez l\'administration.' }, 403)
  await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ last_login: new Date().toISOString() }) })
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids } })
})

app.get('/api/auth/me', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}&select=id,name,email,role,status,linked_student_id,linked_student_ids,phone`)
  return c.json({ user: r.data?.[0] || user })
})

// Modifier son propre compte (email / nom / téléphone / mot de passe) — mot de passe actuel requis
app.patch('/api/auth/me', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json()
  // Vérifier le mot de passe actuel
  const cur = await sb(c.env, `user_accounts?id=eq.${user.id}&select=*`)
  const u = cur.data?.[0]
  if (!u) return c.json({ error: 'Compte introuvable' }, 404)
  if (!b.current_password || u.password_hash !== await hashPassword(b.current_password)) {
    return c.json({ error: 'Mot de passe actuel incorrect' }, 403)
  }
  const allowed: any = {}
  for (const k of ['name', 'phone']) if (b[k]) allowed[k] = b[k]
  if (b.email && b.email !== u.email) {
    const exists = await sb(c.env, `user_accounts?email=eq.${encodeURIComponent(b.email)}&select=id`)
    if (exists.data?.length) return c.json({ error: 'Cet email est déjà utilisé' }, 409)
    allowed.email = b.email
  }
  if (b.new_password) {
    if (String(b.new_password).length < 6) return c.json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' }, 400)
    allowed.password_hash = await hashPassword(b.new_password)
  }
  if (!Object.keys(allowed).length) return c.json({ error: 'Aucune modification' }, 400)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  if (!r.ok) return c.json({ error: 'Erreur mise à jour', detail: r.data }, 500)
  const nu = r.data[0]
  const token = await sign({ id: nu.id, email: nu.email, role: nu.role, name: nu.name, linked_student_id: nu.linked_student_id, linked_student_ids: nu.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ token, user: { id: nu.id, name: nu.name, email: nu.email, role: nu.role, phone: nu.phone } })
})

// Liste publique des élèves pour liaison à l'inscription (nom + niveau seulement)
// Liste publique des élèves : réservée au staff (fuite de données sinon)
app.get('/api/public/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, 'students?select=id,first_name,last_name,level,class_name&order=last_name.asc&status=eq.actif')
  return c.json(r.data || [])
})

// Code de liaison d'un élève (staff uniquement — à communiquer au tuteur)
app.get('/api/students/:id/code', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'ID invalide' }, 400)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(Number(id))) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  return c.json({ id: Number(id), code: await studentCode(c.env, id) })
})

// ---------- Affectation élèves <-> enseignants ----------
// Lire les affectations d'un enseignant (admin) ou les siennes (teacher)
app.get('/api/teachers/:id/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const tid = Number(c.req.param('id'))
  if (!tid) return c.json({ error: 'ID invalide' }, 400)
  if (user.role === 'teacher') {
    const own = await getTeacherId(c.env, user)
    if (own !== tid) return c.json({ error: 'Accès refusé' }, 403)
  }
  const r = await sb(c.env, `teacher_students?teacher_id=eq.${tid}&select=student_id,students(id,first_name,last_name,level,class_name,status)`)
  if (!r.ok) return c.json({ error: 'Table des affectations absente. Exécutez migrations/0003_teacher_assignments.sql dans Supabase.', detail: r.data }, 500)
  return c.json(r.data || [])
})

// Remplacer en bloc les élèves affectés à un enseignant (admin uniquement)
app.put('/api/teachers/:id/students', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const tid = Number(c.req.param('id'))
  if (!tid) return c.json({ error: 'ID invalide' }, 400)
  const b = await c.req.json()
  const ids: number[] = Array.from(new Set((Array.isArray(b.student_ids) ? b.student_ids : []).map((x: any) => Number(x)).filter((n: number) => n > 0)))
  const del = await sb(c.env, `teacher_students?teacher_id=eq.${tid}`, { method: 'DELETE' })
  if (!del.ok) return c.json({ error: 'Table des affectations absente. Exécutez migrations/0003_teacher_assignments.sql dans Supabase.', detail: del.data }, 500)
  if (ids.length) {
    const rows = ids.map((sid) => ({ teacher_id: tid, student_id: sid }))
    const ins = await sb(c.env, 'teacher_students', { method: 'POST', body: JSON.stringify(rows) })
    if (!ins.ok) return c.json({ error: 'Erreur affectation', detail: ins.data }, 500)
  }
  return c.json({ ok: true, teacher_id: tid, student_ids: ids })
})

// Lier un élève à son compte (parent/élève) avec le code fourni par l'école
app.post('/api/link-student', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!['parent', 'student'].includes(user.role)) return c.json({ error: 'Réservé aux parents et élèves' }, 403)
  const b = await c.req.json()
  const sid = await parseStudentCode(c.env, b.code)
  if (!sid) return c.json({ error: 'Code élève invalide. Vérifiez le code communiqué par l\'école (format RCF-12-ABCD).' }, 400)
  const st = await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level&status=eq.actif`)
  const student = st.data?.[0]
  if (!student) return c.json({ error: 'Élève introuvable ou inactif' }, 404)
  // Ajouter aux liaisons existantes
  const acc = await sb(c.env, `user_accounts?id=eq.${user.id}&select=linked_student_ids,linked_student_id`)
  const cur: number[] = Array.isArray(acc.data?.[0]?.linked_student_ids) ? acc.data[0].linked_student_ids.map(Number) : []
  if (!cur.includes(sid)) cur.push(sid)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ linked_student_ids: cur, linked_student_id: acc.data?.[0]?.linked_student_id || sid }) })
  if (!r.ok) return c.json({ error: 'Erreur de liaison' }, 500)
  // Nouveau JWT avec les liaisons à jour
  const u = r.data[0]
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ ok: true, token, student: { id: student.id, first_name: student.first_name, last_name: student.last_name, level: student.level }, linked_student_ids: u.linked_student_ids })
})

// ---------- ADMIN : gestion des utilisateurs ----------
app.get('/api/admin/users', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const role = c.req.query('role')
  let q = 'user_accounts?select=id,name,email,role,status,linked_student_id,linked_student_ids,phone,last_login,created_at&order=created_at.desc'
  if (role) q += `&role=eq.${role}`
  const r = await sb(c.env, q)
  return c.json(r.data || [])
})

app.patch('/api/admin/users/:id', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const allowed: any = {}
  for (const k of ['status', 'role', 'name', 'email', 'linked_student_id', 'linked_student_ids', 'phone']) if (k in b) allowed[k] = b[k]
  if (b.password) allowed.password_hash = await hashPassword(b.password)
  const r = await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  return c.json(r.data?.[0] || { ok: r.ok })
})

app.delete('/api/admin/users/:id', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (String(user.id) === c.req.param('id')) return c.json({ error: 'Impossible de supprimer votre propre compte' }, 400)
  const r = await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}`, { method: 'DELETE' })
  return c.json({ ok: r.ok })
})

// Profil : mise à jour de ses propres infos (parents notamment)
app.patch('/api/profile', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json()
  const allowed: any = {}
  for (const k of ['name', 'phone']) if (k in b) allowed[k] = b[k]
  // Sécurité : les parents/élèves ne peuvent PLUS modifier leurs liaisons ici.
  // Liaison uniquement via POST /api/link-student (code officiel) ou par l'admin.
  if (b.password) allowed.password_hash = await hashPassword(b.password)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  return c.json(r.data?.[0] || { ok: r.ok })
})

// ---------- CRUD générique avec filtrage par rôle ----------
const TABLES = ['students', 'teachers', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events', 'notifications', 'registrations', 'settings', 'teacher_students']
const WRITE_ADMIN_TEACHER = ['students', 'teachers', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events']
const STUDENT_SCOPED = ['grades', 'attendance', 'fees', 'notifications']

app.get('/api/db/:table', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const url = new URL(c.req.url)
  let qs = url.search.slice(1)
  // Filtrage parent/élève : accès uniquement aux données de leurs enfants
  if ((user.role === 'parent' || user.role === 'student')) {
    const ids = linkedIds(user)
    if (STUDENT_SCOPED.includes(table)) {
      if (!ids.length) return c.json([])
      qs += (qs ? '&' : '') + `student_id=in.(${ids.join(',')})`
    }
    if (table === 'students') {
      if (!ids.length) return c.json([])
      qs += (qs ? '&' : '') + `id=in.(${ids.join(',')})`
    }
    if (table === 'registrations') return c.json({ error: 'Accès refusé' }, 403)
    if (table === 'teacher_students') return c.json({ error: 'Accès refusé' }, 403)
  }
  // Filtrage enseignant : uniquement les élèves qui lui sont affectés par l'admin
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null) {
      if (STUDENT_SCOPED.includes(table)) {
        if (!aids.length) return c.json([])
        qs += (qs ? '&' : '') + `student_id=in.(${aids.join(',')})`
      }
      if (table === 'students') {
        if (!aids.length) return c.json([])
        qs += (qs ? '&' : '') + `id=in.(${aids.join(',')})`
      }
    }
    if (table === 'registrations') return c.json({ error: 'Accès refusé' }, 403)
  }
  const r = await sb(c.env, `${table}?${qs || 'select=*'}`)
  return c.json(r.data || [], r.ok ? 200 : (r.status as any))
})

app.post('/api/db/:table', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  // Inscriptions publiques autorisées sans compte
  if (table !== 'registrations') {
    if (!user) return c.json({ error: 'Non authentifié' }, 401)
    if (WRITE_ADMIN_TEACHER.includes(table) && !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
    if ((table === 'settings' || table === 'notifications') && user.role !== 'admin' && !(table === 'notifications' && user.role === 'teacher') && !(table === 'settings' && user.role === 'teacher' && String((await c.req.raw.clone().json().catch(() => ({})) as any)?.key || '').startsWith('notebook_'))) return c.json({ error: 'Accès refusé' }, 403)
    if (table === 'teacher_students' && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  }
  const body = await c.req.json()
  // Matière obligatoire pour chaque enseignant
  if (table === 'teachers' && !String(body.subject || '').trim()) {
    return c.json({ error: "La matière enseignée est obligatoire pour chaque enseignant." }, 400)
  }
  // Identifiant élève (12 chiffres) : format + unicité (élève déjà enregistré => refus)
  if (table === 'students' || table === 'registrations') {
    const nid = String(body.national_id || '').replace(/\s+/g, '')
    if (table === 'students' && !/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
    if (nid) {
      if (!/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
      body.national_id = nid
      const dup = await sb(c.env, `students?national_id=eq.${nid}&select=id,first_name,last_name`)
      if (dup.data?.length) return c.json({ error: `Cet élève est déjà enregistré (identifiant ${nid} — ${dup.data[0].first_name} ${dup.data[0].last_name}). Double enregistrement refusé.` }, 409)
      if (table === 'registrations') {
        const dupReg = await sb(c.env, `registrations?national_id=eq.${nid}&status=eq.pending&select=id`)
        if (dupReg.data?.length) return c.json({ error: `Une demande d'inscription avec l'identifiant ${nid} est déjà en attente.` }, 409)
      }
    }
  }
  // Notes & cours interactifs créés par un enseignant : enregistrer l'auteur (sa fiche teacher)
  if ((table === 'grades' || table === 'interactive_courses') && user?.role === 'teacher' && !body.teacher_id) {
    try { const tid = await getTeacherId(c.env, user); if (tid) body.teacher_id = tid } catch (e) {}
  }
  const isUpsert = table === 'attendance' || table === 'settings'
  const headers: Record<string, string> = isUpsert ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {}
  let r = await sb(c.env, table + (isUpsert ? (table === 'attendance' ? '?on_conflict=student_id,date' : '?on_conflict=key') : ''), { method: 'POST', body: JSON.stringify(body), headers })
  // Repli : colonnes migration 0004 absentes (teacher_id / course_type / content / external_url)
  if (!r.ok && (table === 'grades' || table === 'interactive_courses') && (r.data?.code === 'PGRST204')) {
    for (const col of ['teacher_id', 'course_type', 'content', 'external_url']) delete (body as any)[col]
    r = await sb(c.env, table, { method: 'POST', body: JSON.stringify(body), headers })
  }
  // Repli : colonnes migration 0005 absentes (students.monthly_fee / fees.period)
  if (!r.ok && (table === 'students' || table === 'fees') && (r.data?.code === 'PGRST204')) {
    for (const col of ['monthly_fee', 'period']) delete (body as any)[col]
    r = await sb(c.env, table, { method: 'POST', body: JSON.stringify(body), headers })
  }
  if (!r.ok) return c.json({ error: 'Erreur', detail: r.data }, 500)

  // ---- Notifications automatiques ----
  const rows = Array.isArray(r.data) ? r.data : [r.data]
  try {
    if (table === 'attendance') {
      for (const row of rows) {
        if (row.status === 'absent') await notifyParent(c.env, row.student_id, 'absence', 'Absence signalée', `Votre enfant a été marqué(e) ABSENT(E) le ${row.date}.${row.notes ? ' Note : ' + row.notes : ''}`)
        else if (row.status === 'retard') await notifyParent(c.env, row.student_id, 'retard', 'Retard signalé', `Votre enfant est arrivé(e) en RETARD le ${row.date}.${row.notes ? ' Note : ' + row.notes : ''}`)
      }
    }
    if (table === 'grades') {
      for (const row of rows) {
        const subj = await sb(c.env, `subjects?id=eq.${row.subject_id}&select=name`)
        const sname = subj.data?.[0]?.name || 'Matière'
        await notifyParent(c.env, row.student_id, 'note', 'Nouvelle note', `Nouvelle note en ${sname} : ${row.score}/${row.max_score || 20} (Trimestre ${row.trimester}).${row.comment ? ' Commentaire : ' + row.comment : ''}`)
      }
    }
    // Frais créé directement payé -> envoyer lien quittance via Telegram
    if (table === 'fees') {
      const origin = `https://${new URL(c.req.url).host}`
      for (const row of rows) {
        if (row.status === 'paid') await sendReceiptTelegram(c.env, origin, row)
      }
    }
  } catch (e) { /* notifications non bloquantes */ }
  return c.json(rows.length === 1 ? rows[0] : rows, 201)
})

app.put('/api/db/:table/:id', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if ((table === 'settings' || table === 'registrations') && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const body = await c.req.json()
  // Matière obligatoire pour chaque enseignant (si le champ est envoyé)
  if (table === 'teachers' && 'subject' in body && !String(body.subject || '').trim()) {
    return c.json({ error: "La matière enseignée est obligatoire pour chaque enseignant." }, 400)
  }
  if (table === 'teacher_students' && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  // Identifiant élève : format + unicité (en excluant l'élève lui-même)
  if (table === 'students' && 'national_id' in body) {
    const nid = String(body.national_id || '').replace(/\s+/g, '')
    if (!/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
    body.national_id = nid
    const dup = await sb(c.env, `students?national_id=eq.${nid}&id=neq.${c.req.param('id')}&select=id,first_name,last_name`)
    if (dup.data?.length) return c.json({ error: `Cet identifiant est déjà utilisé par ${dup.data[0].first_name} ${dup.data[0].last_name}.` }, 409)
  }
  const pk = table === 'settings' ? 'key' : 'id'
  // Détecter la transition non-payé -> payé pour les frais (avant le PATCH)
  let feeWasUnpaid = false
  if (table === 'fees' && body.status === 'paid') {
    try {
      const prev = await sb(c.env, `fees?id=eq.${c.req.param('id')}&select=status`)
      feeWasUnpaid = prev.data?.[0]?.status !== 'paid'
    } catch (e) { /* non bloquant */ }
  }
  let r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  // Repli PUT : colonnes migration 0004 absentes
  if (!r.ok && (table === 'grades' || table === 'interactive_courses') && (r.data?.code === 'PGRST204')) {
    for (const col of ['teacher_id', 'course_type', 'content', 'external_url']) delete (body as any)[col]
    r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  // Repli PUT : colonnes migration 0005 absentes (students.monthly_fee / fees.period)
  if (!r.ok && (table === 'students' || table === 'fees') && (r.data?.code === 'PGRST204')) {
    for (const col of ['monthly_fee', 'period']) delete (body as any)[col]
    r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  // Paiement confirmé -> envoyer lien quittance via Telegram au tuteur
  if (r.ok && feeWasUnpaid && r.data?.[0]) {
    try { await sendReceiptTelegram(c.env, `https://${new URL(c.req.url).host}`, r.data[0]) } catch (e) { /* non bloquant */ }
  }
  return c.json(r.data?.[0] || { ok: r.ok }, r.ok ? 200 : 500)
})

app.delete('/api/db/:table/:id', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if ((table === 'settings' || table === 'registrations' || table === 'teacher_students') && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const pk = table === 'settings' ? 'key' : 'id'
  const r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'DELETE' })
  return c.json({ ok: r.ok })
})

// ---------- Approbation d'une inscription -> crée l'élève ----------
app.post('/api/registrations/:id/approve', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const id = c.req.param('id')
  const r = await sb(c.env, `registrations?id=eq.${id}&select=*`)
  const reg = r.data?.[0]
  if (!reg) return c.json({ error: 'Introuvable' }, 404)
  // Anti-doublon : refuser si un élève avec cet identifiant existe déjà
  if (reg.national_id) {
    const dup = await sb(c.env, `students?national_id=eq.${reg.national_id}&select=id,first_name,last_name`)
    if (dup.data?.length) return c.json({ error: `Cet élève est déjà enregistré (identifiant ${reg.national_id} — ${dup.data[0].first_name} ${dup.data[0].last_name}).` }, 409)
  }
  const st = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify({
    first_name: reg.first_name, last_name: reg.last_name, birth_date: reg.birth_date, gender: reg.gender,
    cycle: reg.cycle, level: reg.level, parent_name: reg.parent_name, parent_email: reg.parent_email,
    parent_phone: reg.parent_phone, address: reg.address, status: 'actif', national_id: reg.national_id || null
  }) })
  if (!st.ok) return c.json({ error: 'Erreur création élève', detail: st.data }, 500)
  await sb(c.env, `registrations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) })
  // Créer automatiquement le frais d'inscription de 40 DT (échéance : 30 jours)
  const due = new Date(); due.setDate(due.getDate() + 30)
  await sb(c.env, 'fees', { method: 'POST', body: JSON.stringify({
    student_id: st.data[0].id, label: "Frais d'inscription", amount: 40,
    due_date: due.toISOString().slice(0, 10), status: 'pending'
  }) })
  // Envoyer le code élève au tuteur (Telegram + email) pour lier son compte
  const code = await studentCode(c.env, st.data[0].id)
  const codeMsg = `Inscription approuvée pour ${reg.first_name} ${reg.last_name} ! Votre code élève : ${code} — utilisez-le pour lier votre compte parent sur la plateforme (bouton « Lier un élève »). Gardez ce code confidentiel.`
  try {
    await notifyParent(c.env, st.data[0].id, 'info', 'Inscription approuvée — Code élève', codeMsg)
  } catch (e) { /* non bloquant */ }
  return c.json({ ok: true, student: st.data[0], code })
})

// ---------- Mensualités automatiques ----------
// Génère la mensualité du mois courant pour chaque élève actif qui ne l'a pas encore.
// Montant : students.monthly_fee sinon montant par défaut (settings.fees.monthly_amount, défaut 60 DT).
// Échéance : le 10 du mois. Anti-doublon via la colonne fees.period (YYYY-MM),
// avec repli sur le libellé si la migration 0005 n'est pas appliquée.
const MONTH_LABELS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

async function generateMonthlyFees(env: Bindings) {
  const now = new Date()
  const period = now.toISOString().slice(0, 7) // YYYY-MM
  const label = `Mensualité ${MONTH_LABELS_FR[now.getMonth()]} ${now.getFullYear()}`
  const feeCfg = await getSettings(env, 'fees')
  const defaultAmount = Number(feeCfg.monthly_amount) > 0 ? Number(feeCfg.monthly_amount) : 60
  const dueDate = `${period}-10`

  // Élèves actifs (monthly_fee si la colonne existe)
  let hasCols = true
  let st = await sb(env, `students?status=eq.actif&select=id,monthly_fee`)
  if (!st.ok) { hasCols = false; st = await sb(env, `students?status=eq.actif&select=id`) }
  const students = st.data || []
  if (!students.length) return { created: 0, period }

  // Mensualités déjà générées ce mois-ci
  let existing = await sb(env, `fees?period=eq.${period}&select=student_id`)
  if (!existing.ok) { hasCols = false; existing = await sb(env, `fees?label=eq.${encodeURIComponent(label)}&select=student_id`) }
  const done = new Set((existing.data || []).map((f: any) => Number(f.student_id)))

  const rows = students.filter((s: any) => !done.has(Number(s.id))).map((s: any) => ({
    student_id: s.id, label,
    amount: Number(s.monthly_fee) > 0 ? Number(s.monthly_fee) : defaultAmount,
    due_date: dueDate, status: 'pending',
    ...(hasCols ? { period } : {})
  }))
  if (!rows.length) return { created: 0, period }

  let ins = await sb(env, 'fees', { method: 'POST', body: JSON.stringify(rows) })
  // Repli : colonne period absente (migration 0005 non appliquée)
  if (!ins.ok && ins.data?.code === 'PGRST204') {
    for (const r of rows) delete (r as any).period
    ins = await sb(env, 'fees', { method: 'POST', body: JSON.stringify(rows) })
  }
  return { created: ins.ok ? rows.length : 0, period, error: ins.ok ? undefined : ins.data }
}

// Marque en retard les frais échus + notifie les tuteurs. maxNotify limite les envois par passage.
async function sweepOverdueFees(env: Bindings, maxNotify = 50) {
  const today = new Date().toISOString().slice(0, 10)
  const r = await sb(env, `fees?status=eq.pending&due_date=lt.${today}&select=*`)
  const overdue = r.data || []
  let notified = 0
  for (const fee of overdue) {
    await sb(env, `fees?id=eq.${fee.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'overdue' }) })
    if (notified < maxNotify) {
      await notifyParent(env, fee.student_id, 'frais', 'Rappel de paiement', `⚠️ Le paiement « ${fee.label} » de ${fee.amount} DT était dû le ${fee.due_date}. Merci de régulariser la situation auprès de l'administration.`)
      notified++
    }
  }
  return { overdue: overdue.length, notified }
}

// Maintenance quotidienne automatique (déclenchée par les requêtes entrantes, 1×/jour) :
// génère les mensualités du mois + bascule les frais échus en retard avec rappel.
async function dailyFeesMaintenance(env: Bindings) {
  const today = new Date().toISOString().slice(0, 10)
  const lastRun = await getSettings(env, 'fees_maintenance')
  if (lastRun.last_run === today) return null
  // Verrou optimiste : enregistrer la date AVANT le traitement pour éviter les doubles passages
  await sb(env, 'settings?on_conflict=key', {
    method: 'POST', body: JSON.stringify({ key: 'fees_maintenance', value: { last_run: today } }),
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' }
  })
  const gen = await generateMonthlyFees(env)
  const sweep = await sweepOverdueFees(env)
  return { ...gen, ...sweep }
}

// Route manuelle : générer les mensualités du mois maintenant (admin)
app.post('/api/fees/generate-monthly', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const gen = await generateMonthlyFees(c.env)
  return c.json({ ok: true, ...gen })
})

// ---------- Vérification des frais en retard + relances ----------
app.post('/api/fees/check-overdue', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const result = await sweepOverdueFees(c.env)
  return c.json({ checked: true, ...result })
})

// ---------- Historique de paiement d'un élève ----------
app.get('/api/fees/history/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if ((user.role === 'parent' || user.role === 'student') && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  const [st, fees] = await Promise.all([
    sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name,monthly_fee,status`),
    sb(c.env, `fees?student_id=eq.${sid}&select=*&order=due_date.desc.nullslast,created_at.desc`)
  ])
  // Repli : colonne monthly_fee absente
  let student = st.data?.[0]
  if (!st.ok) {
    const st2 = await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name,status`)
    student = st2.data?.[0]
  }
  if (!student) return c.json({ error: 'Élève introuvable' }, 404)
  const list = fees.data || []
  const totals = {
    paid: list.filter((f: any) => f.status === 'paid').reduce((s: number, f: any) => s + Number(f.amount), 0),
    pending: list.filter((f: any) => f.status === 'pending').reduce((s: number, f: any) => s + Number(f.amount), 0),
    overdue: list.filter((f: any) => f.status === 'overdue').reduce((s: number, f: any) => s + Number(f.amount), 0)
  }
  return c.json({ student, fees: list, totals })
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
    await reply("🏫 <b>Bienvenue sur les notifications de Rahma Cours de Français !</b>\n\nPour recevoir les alertes concernant votre enfant (absences, notes, frais), envoyez simplement votre <b>numéro de téléphone</b> tel qu'enregistré à l'école.\n\nExemple : <code>52517581</code>")
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
app.post('/api/telegram/announce', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Bot Telegram non configuré (TELEGRAM_BOT_TOKEN)' }, 400)
  const b = await c.req.json()
  if (!b.message) return c.json({ error: 'Message requis' }, 400)
  const chan = await getSettings(c.env, 'telegram_channel')
  const target = (chan.chat_id || chan.username || '').trim()
  if (!target) return c.json({ error: "Aucun canal configuré. Enregistrez le nom du canal dans Paramètres → Notifications → Canal Telegram." }, 400)
  const text = `📢 <b>${b.title || 'Annonce'}</b>\n\n${b.message}\n\n— Rahma Cours de Français`
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: target.startsWith('@') || /^-?\d+$/.test(target) ? target : '@' + target, text, parse_mode: 'HTML' })
  })
  const data: any = await res.json().catch(() => ({}))
  if (data.ok) {
    try { await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: null, type: 'info', title: `📢 ${b.title || 'Annonce'}`, message: b.message, recipient: 'Canal Telegram', sent_via: 'telegram', status: 'sent' }) }) } catch (e) {}
  }
  return c.json({ ok: data.ok === true, detail: data.description || null })
})

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
      if (s?.parent_phone) await sendTelegram(c.env, s.parent_phone, `💬 <b>Nouveau message de l'administration</b>\n\n${text}\n\n— Rahma Cours de Français (à propos de ${s.first_name} ${s.last_name})\nRépondez depuis votre espace parent : rubrique « Discussions ».`)
    } catch (e) { /* non bloquant */ }
  }
  return c.json(Array.isArray(r.data) ? r.data[0] : r.data, 201)
})

// ---------- Upload fichiers (photos élèves & cours) vers Supabase Storage ----------
app.post('/api/upload/:bucket', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const bucket = c.req.param('bucket')
  if (!['photos', 'courses'].includes(bucket)) return c.json({ error: 'Bucket invalide' }, 400)
  const b = await c.req.json() // { filename, contentType, data(base64) }
  const bin = Uint8Array.from(atob(b.data), ch => ch.charCodeAt(0))
  const safe = (b.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${Date.now()}_${safe}`
  const { url, key } = cfg(c.env)
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': b.contentType || 'application/octet-stream' },
    body: bin
  })
  if (!res.ok) return c.json({ error: 'Erreur upload', detail: await res.text() }, 500)
  return c.json({ url: `${url}/storage/v1/object/public/${bucket}/${path}`, path })
})

// ---------- Statistiques dashboard ----------
app.get('/api/stats', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  // Maintenance quotidienne des frais (mensualités + retards) — 1×/jour, non bloquante
  try { await dailyFeesMaintenance(c.env) } catch (e) { /* non bloquant */ }
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
  const [students, teachers, fees, attToday, attMonth, notifs] = await Promise.all([
    sb(c.env, `students?select=id,cycle,status${stFilter}`),
    sb(c.env, 'teachers?select=id'),
    sb(c.env, `fees?select=id,amount,status${idFilter}`),
    sb(c.env, `attendance?date=eq.${today}&select=status${idFilter}`),
    sb(c.env, `attendance?date=gte.${monthStart}&select=status,student_id${idFilter}`),
    sb(c.env, `notifications?select=id,type,title,message,created_at,student_id&order=created_at.desc&limit=10${idFilter}`)
  ])
  const feesArr = fees.data || []
  return c.json({
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
  return c.json({ student, school, trimester: Number(trimester), subjects, generalAverage })
})

// ---------- Page principale ----------
const mainPage = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rahma Cours de Français - Plateforme de gestion scolaire</title>
  <meta name="description" content="Gestion scolaire complète : élèves, présence, notes, bulletins, frais, cours et notifications.">
  <meta name="theme-color" content="#1e3a8a">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Rahma Cours">
  <link rel="icon" type="image/png" href="/static/icons/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
</head>
<body class="bg-gray-100">
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="/static/app.js"></script>
  <script src="/static/public.js"></script>
  <script src="/static/views-core.js"></script>
  <script src="/static/views-academic.js"></script>
  <script src="/static/views-notebook.js"></script>
  <script src="/static/views-admin.js"></script>
  <script src="/static/views-chat.js"></script>
</body>
</html>`

app.get('/', (c) => c.html(mainPage))
// Accès rapide via QR Code : ouvre directement le formulaire d'inscription élève
app.get('/inscription', (c) => c.html(mainPage))

// ---------- Quittance publique (lien sécurisé par token, sans connexion) ----------
app.get('/api/public/receipt/:id', async (c) => {
  const id = c.req.param('id')
  const t = c.req.query('t') || ''
  if (!/^\d+$/.test(id) || t !== await receiptToken(c.env, id)) return c.json({ error: 'Lien invalide' }, 403)
  const r = await sb(c.env, `fees?id=eq.${id}&select=*,students(first_name,last_name,level,class_name,parent_name)`)
  const fee = r.data?.[0]
  if (!fee) return c.json({ error: 'Quittance introuvable' }, 404)
  if (fee.status !== 'paid') return c.json({ error: 'Ce frais n\'est pas encore payé' }, 400)
  const school = await getSettings(c.env, 'school')
  return c.json({ fee, school })
})

app.get('/quittance/:id', (c) => c.html(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quittance de paiement — Rahma Cours de Français</title>
  <link rel="icon" type="image/png" href="/static/icons/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
  <main class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
    <img src="/static/logo-rahma.png" alt="Rahma Cours de Français" class="w-24 h-24 mx-auto mb-4">
    <h1 class="text-xl font-bold text-blue-800 mb-1">Rahma Cours de Français</h1>
    <p class="text-gray-500 text-sm mb-6">Quittance de paiement</p>
    <div id="info" class="text-left text-sm bg-blue-50 rounded-lg p-4 mb-6 hidden"></div>
    <div id="status" class="text-gray-600 mb-4">Chargement…</div>
    <button id="dl-btn" onclick="genPDF()" class="hidden w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-6 rounded-xl transition">
      📄 Télécharger la quittance (PDF)
    </button>
  </main>
  <script src="/static/receipt-public.js"></script>
</body>
</html>`))

export default app
