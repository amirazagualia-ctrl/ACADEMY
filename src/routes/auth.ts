// Routes auth
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { audit, clearLoginFailures, getUser, loginBlocked, recordLoginFailure, superAdmin, teacherScope, upgradeHashIfNeeded } from '../lib/auth'
import { b64url, hashPassword, verifyPassword } from '../lib/crypto'
import { parseStudentCode } from '../lib/notifications'
import { sb } from '../lib/supabase'
import { cfg, tenantSlug } from '../lib/tenant'
import { clientIp, publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

function googleRedirectUri(c: any) { return `${publicOrigin(c)}/api/auth/google/callback` }

// Disponibilité (le bouton n'apparaît que si configuré)
app.get('/api/auth/google/status', (c) => c.json({ enabled: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) }))

// 1) Redirection vers Google avec state signé (anti-CSRF, 10 min)
app.get('/api/auth/google', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.text('Connexion Google non configurée (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).', 503)
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const state = await sign({ nonce, ret: c.req.query('ret') || '/', exp: Math.floor(Date.now() / 1000) + 600 }, cfg(c.env).jwt)
  const p = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(c), response_type: 'code',
    scope: 'openid email profile', state, nonce, access_type: 'online', prompt: 'select_account'
  })
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`)
})

// 2) Retour de Google : échange du code, vérification de l'identité, création du JWT applicatif
app.get('/api/auth/google/callback', async (c) => {
  const fail = (msg: string) => c.redirect(`/?google_error=${encodeURIComponent(msg)}`)
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return fail('Connexion Google non configurée')
  const code = c.req.query('code'); const state = c.req.query('state')
  if (c.req.query('error')) return fail('Connexion Google annulée')
  if (!code || !state) return fail('Réponse Google invalide')
  let st: any
  try { st = await verify(state, cfg(c.env).jwt, 'HS256') } catch { return fail('Session expirée, réessayez') }
  // Échange du code
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(c), grant_type: 'authorization_code' })
  })
  const tok: any = await tr.json().catch(() => ({}))
  if (!tr.ok || !tok.id_token) return fail('Échec de l\'échange avec Google')
  // Vérification de l'id_token via tokeninfo (signature, audience, expiration vérifiées par Google)
  const ir = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tok.id_token)}`)
  const info: any = await ir.json().catch(() => ({}))
  if (!ir.ok || info.aud !== c.env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss) || info.nonce !== st.nonce) return fail('Identité Google non vérifiable')
  if (info.email_verified !== 'true' && info.email_verified !== true) return fail('Adresse Google non vérifiée')
  const email = String(info.email).toLowerCase()
  const googleId = String(info.sub)
  const ip = clientIp(c)
  // Compte existant ? (par google_id puis par email)
  let u: any = null
  const byId = await sb(c.env, `user_accounts?google_id=eq.${encodeURIComponent(googleId)}&select=*`)
  const googleCols = byId.ok
  if (googleCols && byId.data?.length) u = byId.data[0]
  if (!u) { const byEmail = await sb(c.env, `user_accounts?email=ilike.${encodeURIComponent(email)}&select=*`); u = byEmail.data?.[0] || null }
  if (u) {
    if (u.status !== 'active') return fail(u.role === 'teacher' ? 'Compte enseignant en attente de validation par l\'administration' : 'Compte désactivé. Contactez l\'administration')
    if (googleCols) {
      const patch: any = { last_login: new Date().toISOString() }
      if (!u.google_id) patch.google_id = googleId
      if (!u.avatar_url && info.picture) patch.avatar_url = info.picture
      await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    } else await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ last_login: new Date().toISOString() }) })
  } else {
    // Nouveau compte : parent uniquement, sans élève lié (liaison via code RCF ensuite), mot de passe aléatoire inutilisable
    const payload: any = { name: info.name || email.split('@')[0], email, password_hash: await hashPassword(b64url(crypto.getRandomValues(new Uint8Array(24)))), role: 'parent', status: 'active', linked_student_ids: [] }
    if (googleCols) { payload.google_id = googleId; payload.avatar_url = info.picture || null; payload.auth_provider = 'google' }
    let r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
    if (!r.ok && googleCols) { delete payload.google_id; delete payload.avatar_url; delete payload.auth_provider; r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) }) }
    if (!r.ok) return fail('Impossible de créer le compte')
    u = r.data[0]
    await audit(c.env, c, u, 'signup_google', 'user_accounts', u.id, null, { email, role: 'parent', ip })
  }
  await clearLoginFailures(c.env, email)
  await audit(c.env, c, u, 'login_google', 'user_accounts', u.id, null, { ip })
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7, tenant: tenantSlug() }, cfg(c.env).jwt)
  // Le token est transmis dans le fragment (#) : jamais envoyé au serveur ni journalisé
  const ret = typeof st.ret === 'string' && st.ret.startsWith('/') ? st.ret : '/'
  return c.redirect(`${ret}#gtoken=${token}`)
})

// ---------- AUTH ----------
app.post('/api/auth/signup', async (c) => {
  const b = await c.req.json()
  if (!b.email || !b.password || !b.name) return c.json({ error: 'Champs requis manquants' }, 400)
  const exists = await sb(c.env, `user_accounts?email=eq.${encodeURIComponent(b.email)}&select=id`)
  if (exists.data?.length) return c.json({ error: 'Cet email est déjà utilisé' }, 409)
  // SÉCURITÉ : le rôle admin ne peut PAS être créé via l'inscription publique (uniquement par un admin : POST /api/admin/users)
  if (b.role === 'admin') return c.json({ error: 'La création d\'un compte Administration est réservée à l\'administrateur de la plateforme.' }, 403)
  const role = ['teacher', 'parent', 'student'].includes(b.role) ? b.role : 'parent'
  if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
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
    // Enseignant : compte en attente de validation par l'admin (accès aux données élèves)
    role, status: role === 'teacher' ? 'inactive' : 'active', phone: b.phone || null,
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
  await audit(c.env, c, { id: r.data?.[0]?.id, email: b.email, role }, 'signup', 'user_accounts', r.data?.[0]?.id, null, { email: b.email, role, status: payload.status })
  if (role === 'teacher') return c.json({ pending: true, message: "Compte enseignant créé. Il sera activé par l'administration après vérification — vous serez informé(e)." })
  const u = r.data[0]
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7, tenant: tenantSlug() }, cfg(c.env).jwt)
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids } })
})

app.post('/api/auth/login', async (c) => {
  const b = await c.req.json()
  const email = String(b.email || '').trim().toLowerCase()
  const ip = clientIp(c)
  // Rate-limiting : 5 échecs / 15 min (par email ou IP)
  const wait = await loginBlocked(c.env, email, ip)
  if (wait > 0) {
    await audit(c.env, c, { email }, 'login_blocked', 'user_accounts', null, null, { ip })
    return c.json({ error: `Trop de tentatives. Réessayez dans ${wait} minute${wait > 1 ? 's' : ''}.`, retry_after_min: wait }, 429)
  }
  const r = await sb(c.env, `user_accounts?email=ilike.${encodeURIComponent(email)}&select=*`)
  if (!r.ok && r.status === 503) return c.json({ error: r.data.error }, 503)
  const u = Array.isArray(r.data) ? r.data[0] : undefined
  const check = u ? await verifyPassword(String(b.password || ''), u.password_hash) : { ok: false, needsUpgrade: false }
  if (!u || !check.ok) {
    await recordLoginFailure(c.env, email, ip)
    await audit(c.env, c, { email }, 'login_failed', 'user_accounts', u?.id ?? null, null, { ip })
    return c.json({ error: 'Email ou mot de passe incorrect' }, 401)
  }
  if (u.status !== 'active') return c.json({ error: u.role === 'teacher' ? 'Compte enseignant en attente de validation par l\'administration.' : 'Compte désactivé. Contactez l\'administration.' }, 403)
  await upgradeHashIfNeeded(c.env, u.id, String(b.password), check)
  await clearLoginFailures(c.env, email)
  await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ last_login: new Date().toISOString() }) })
  await audit(c.env, c, u, 'login', 'user_accounts', u.id, null, { ip })
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7, tenant: tenantSlug() }, cfg(c.env).jwt)
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids } })
})

app.get('/api/auth/me', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  let r = await sb(c.env, `user_accounts?id=eq.${user.id}&select=id,name,email,role,status,linked_student_id,linked_student_ids,phone,google_id,avatar_url,auth_provider`)
  if (!r.ok) r = await sb(c.env, `user_accounts?id=eq.${user.id}&select=id,name,email,role,status,linked_student_id,linked_student_ids,phone`)
  const u = r.data?.[0]
  if (u) { u.has_google = !!u.google_id; delete u.google_id }
  if ((u || user).role === 'teacher') { try { const sc = await teacherScope(c.env, user); (u || user).teacher_id = sc.teacher_id; (u || user).scope = { subject_ids: sc.subject_ids, student_ids: sc.student_ids } } catch {} }
  // Cloisonnement : seul l'admin de l'établissement par défaut est « super-admin » (écrans plateforme).
  // Les autres établissements ont toutes les fonctions métier, sauf l'administration de la plateforme.
  const isSuper = !!(await superAdmin(c))
  ;(u || user).is_super_admin = isSuper
  ;(u || user).platform_admin = isSuper
  return c.json({ user: u || user, app_env: c.env.APP_ENV || 'production', platform_admin: isSuper })
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
  if (!b.current_password || !(await verifyPassword(String(b.current_password), u.password_hash)).ok) {
    return c.json({ error: 'Mot de passe actuel incorrect' }, 403)
  }
  if (b.new_password && String(b.new_password).length < 8) return c.json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' }, 400)
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
  const token = await sign({ id: nu.id, email: nu.email, role: nu.role, name: nu.name, linked_student_id: nu.linked_student_id, linked_student_ids: nu.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7, tenant: tenantSlug() }, cfg(c.env).jwt)
  return c.json({ token, user: { id: nu.id, name: nu.name, email: nu.email, role: nu.role, phone: nu.phone } })
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
  if (b.password) {
    if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
    allowed.password_hash = await hashPassword(b.password)
  }
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  const { password_hash: _ph, ...safeP } = r.data?.[0] || {}
  return c.json(r.data?.[0] ? safeP : { ok: r.ok })
})

export default app
