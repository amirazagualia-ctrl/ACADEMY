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
      body: JSON.stringify({ from: 'EduManage <onboarding@resend.dev>', to: [to], subject, html })
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
    const r = await sendEmail(env, student.parent_email, `[EduManage] ${title}`, `<div style="font-family:Arial"><h2 style="color:#1e40af">EduManage - École Tunisienne</h2><p>Cher(e) ${student.parent_name || 'parent'},</p><p>${message}</p><p style="color:#666;font-size:12px">Élève : ${student.first_name} ${student.last_name}</p></div>`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_email, sent_via: 'email', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`email:${r.sent}`)
  }
  // SMS
  if (prefs[`sms_${typeKey}`] === true && student.parent_phone) {
    const r = await sendSMS(env, student.parent_phone, `EduManage: ${message}`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_phone, sent_via: 'sms', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`sms:${r.sent}`)
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
  const payload: any = {
    name: b.name, email: b.email, password_hash: await hashPassword(b.password),
    role, status: role === 'admin' ? 'inactive' : 'active', phone: b.phone || null,
    linked_student_id: b.linked_student_id || null,
    linked_student_ids: b.linked_student_ids || (b.linked_student_id ? [b.linked_student_id] : [])
  }
  const r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
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

// Liste publique des élèves pour liaison à l'inscription (nom + niveau seulement)
app.get('/api/public/students', async (c) => {
  const r = await sb(c.env, 'students?select=id,first_name,last_name,level,class_name&order=last_name.asc&status=eq.actif')
  return c.json(r.data || [])
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
  for (const k of ['status', 'role', 'name', 'linked_student_id', 'linked_student_ids', 'phone']) if (k in b) allowed[k] = b[k]
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
  if (user.role === 'parent' || user.role === 'student') {
    if ('linked_student_id' in b) allowed.linked_student_id = b.linked_student_id
    if ('linked_student_ids' in b) allowed.linked_student_ids = b.linked_student_ids
  }
  if (b.password) allowed.password_hash = await hashPassword(b.password)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  return c.json(r.data?.[0] || { ok: r.ok })
})

// ---------- CRUD générique avec filtrage par rôle ----------
const TABLES = ['students', 'teachers', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events', 'notifications', 'registrations', 'settings']
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
    if ((table === 'settings' || table === 'notifications') && user.role !== 'admin' && !(table === 'notifications' && user.role === 'teacher')) return c.json({ error: 'Accès refusé' }, 403)
  }
  const body = await c.req.json()
  const isUpsert = table === 'attendance' || table === 'settings'
  const headers: Record<string, string> = isUpsert ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {}
  const r = await sb(c.env, table + (isUpsert ? (table === 'attendance' ? '?on_conflict=student_id,date' : '?on_conflict=key') : ''), { method: 'POST', body: JSON.stringify(body), headers })
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
  const pk = table === 'settings' ? 'key' : 'id'
  const r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  return c.json(r.data?.[0] || { ok: r.ok }, r.ok ? 200 : 500)
})

app.delete('/api/db/:table/:id', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if ((table === 'settings' || table === 'registrations') && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
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
  const st = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify({
    first_name: reg.first_name, last_name: reg.last_name, birth_date: reg.birth_date, gender: reg.gender,
    cycle: reg.cycle, level: reg.level, parent_name: reg.parent_name, parent_email: reg.parent_email,
    parent_phone: reg.parent_phone, address: reg.address, status: 'actif'
  }) })
  if (!st.ok) return c.json({ error: 'Erreur création élève', detail: st.data }, 500)
  await sb(c.env, `registrations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) })
  return c.json({ ok: true, student: st.data[0] })
})

// ---------- Vérification des frais en retard + relances ----------
app.post('/api/fees/check-overdue', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const today = new Date().toISOString().slice(0, 10)
  const r = await sb(c.env, `fees?status=eq.pending&due_date=lt.${today}&select=*`)
  const overdue = r.data || []
  let notified = 0
  for (const fee of overdue) {
    await sb(c.env, `fees?id=eq.${fee.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'overdue' }) })
    await notifyParent(c.env, fee.student_id, 'frais', 'Rappel de paiement', `Le paiement "${fee.label}" de ${fee.amount} DT était dû le ${fee.due_date}. Merci de régulariser la situation.`)
    notified++
  }
  return c.json({ checked: true, overdue: notified })
})

// ---------- Notification manuelle ----------
app.post('/api/notify', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const results = await notifyParent(c.env, b.student_id, b.type || 'info', b.title || 'Information', b.message)
  return c.json({ ok: true, results })
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
  const ids = linkedIds(user)
  const scoped = (user.role === 'parent' || user.role === 'student') && ids.length
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
  <title>EduManage - Plateforme d'éducation</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎓</text></svg>">
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
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <script src="/static/app.js"></script>
  <script src="/static/public.js"></script>
  <script src="/static/views-core.js"></script>
  <script src="/static/views-academic.js"></script>
  <script src="/static/views-admin.js"></script>
</body>
</html>`

app.get('/', (c) => c.html(mainPage))
// Accès rapide via QR Code : ouvre directement le formulaire d'inscription élève
app.get('/inscription', (c) => c.html(mainPage))

export default app
