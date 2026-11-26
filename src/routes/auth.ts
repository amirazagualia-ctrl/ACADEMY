// Routes auth
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { audit, clearLoginFailures, getUser, loginBlocked, recordLoginFailure, superAdmin, teacherScope, upgradeHashIfNeeded } from '../lib/auth'
import { clearSessionCookies, createSession, listSessions, refreshSession, reissueSession, revokeAllSessions, revokeSession } from '../lib/session'
import { b64url, hashPassword, verifyPassword } from '../lib/crypto'
import { parseStudentCode } from '../lib/notifications'
import { sb } from '../lib/supabase'
import { cfg } from '../lib/tenant'
import { recordDirectoryEntry } from '../lib/portal'
import { clientIp, publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// F78 : l'URI de redirection OAuth doit être IDENTIQUE, au caractère près, à celle déclarée
// dans la console Google Cloud — et ce pour CHAQUE requête. Avant ce correctif elle était
// déduite du `Host` : elle valait donc alternativement https://rahma-academy.pages.dev,
// l'URL du bac à sable, le domaine personnalisé ou /e/<slug>…, et Google répondait
// « Vous ne pouvez pas vous connecter à cette appli, car elle ne respecte pas le règlement
// OAuth 2.0 de Google » (redirect_uri_mismatch).
//
// Ordre de résolution :
//   1. GOOGLE_REDIRECT_URI — valeur explicite, utilisée telle quelle si l'administrateur
//      préfère un tout autre domaine (ex. login.rahma.tn).
//   2. En développement local (localhost / 127.0.0.1) : dérivation depuis le Host, pour que
//      chaque bac à sable reste utilisable sans configuration.
//   3. PUBLIC_ORIGIN — origine épinglée par la configuration.
//   4. DEFAULT_PUBLIC_ORIGIN — repli codé en dur : hors développement local, l'URI ne doit
//      JAMAIS dépendre du nom par lequel le site est atteint. C'est ce repli qui rend le
//      correctif effectif même si le chemin de déploiement n'injecte aucune variable.
export const DEFAULT_PUBLIC_ORIGIN = 'https://rahma-academy.pages.dev'

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export function isLocalOrigin(origin: string): boolean {
  return LOCAL_ORIGIN_RE.test(String(origin || '').trim())
}

export function googleRedirectUri(c: any) {
  const explicit = String(c.env.GOOGLE_REDIRECT_URI || '').trim()
  if (explicit) return explicit
  const origin = publicOrigin(c)
  // Développement local : on suit le port réellement utilisé.
  if (isLocalOrigin(origin)) return `${origin}/api/auth/google/callback`
  const pinned = String(c.env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '')
  const fixed = pinned || DEFAULT_PUBLIC_ORIGIN
  return `${fixed}/api/auth/google/callback`
}

// Disponibilité (le bouton n'apparaît que si configuré)
app.get('/api/auth/google/status', (c) => c.json({
  enabled: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
  // Exposé volontairement : cette URI n'est pas un secret (elle apparaît en clair dans l'URL
  // pendant le parcours OAuth) et l'administrateur doit la recopier TELLE QUELLE dans
  // « URI de redirection autorisés » de la console Google Cloud. C'est la source de
  // l'erreur « ne respecte pas le règlement OAuth 2.0 ».
  redirect_uri: googleRedirectUri(c),
  // Indique si la stabilité est garantie : sans origine épinglée, l'URI suit le domaine d'accès.
  // `pinned` répond à UNE question : cette URI est-elle indépendante du nom par lequel le
  // site est atteint ? Avant F78 la réponse dépendait de la présence d'une variable ; depuis
  // que le repli est codé en dur, seule une origine locale (développement) la fait varier.
  pinned: !isLocalOrigin(publicOrigin(c))
}))

// F79 (demande #15) : un compte créé via Google peut être Parent, Élève OU Enseignant.
// Le rôle — comme le code élève et la matière — voyage dans le `state` SIGNÉ (JWT) : il ne
// peut donc pas être falsifié au retour de Google. `admin` est structurellement impossible :
// seules les trois valeurs ci-dessous sont acceptées, tout le reste retombe sur « parent ».
export const GOOGLE_ROLES = ['parent', 'student', 'teacher'] as const

export function googleSignupRole(raw: any): string {
  const r = String(raw || '').trim().toLowerCase()
  return (GOOGLE_ROLES as readonly string[]).includes(r) ? r : 'parent'
}

// Le code élève n'est JAMAIS validé ici (il ne le sera qu'au callback, contre la base) ;
// on borne seulement sa forme pour éviter un `state` inutilement gros.
function cleanStudentCode(raw: any): string {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 32)
}

// 1) Redirection vers Google avec state signé (anti-CSRF, 10 min)
app.get('/api/auth/google', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.text('Connexion Google non configurée (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).', 503)
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const role = googleSignupRole(c.req.query('role'))
  const code = cleanStudentCode(c.req.query('code'))
  const subject = String(c.req.query('subject') || '').trim().slice(0, 80)
  const retRaw = c.req.query('ret') || '/'
  const ret = retRaw.startsWith('/') && !retRaw.startsWith('//') ? retRaw : '/'
  const state = await sign({ nonce, ret, role, code, subject, exp: Math.floor(Date.now() / 1000) + 600 }, cfg(c.env).jwt)
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
  let googleWarn = ''
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
    // F79 : nouveau compte. Le rôle vient du `state` SIGNÉ — jamais de la requête brute — et
    // « admin » est structurellement impossible (googleSignupRole n'ouvre que 3 valeurs).
    const role = googleSignupRole(st.role)
    // Enseignant : compte INACTIF. Google prouve une identité, pas la qualité d'enseignant :
    // seul un administrateur peut valider l'accès aux données des élèves. Parent/élève : actif.
    const status = role === 'teacher' ? 'inactive' : 'active'
    // Mot de passe aléatoire inutilisable : la connexion se fait par Google (ou après réinitialisation).
    const payload: any = {
      name: info.name || email.split('@')[0], email,
      password_hash: await hashPassword(b64url(crypto.getRandomValues(new Uint8Array(24)))),
      role, status, linked_student_ids: []
    }
    if (googleCols) { payload.google_id = googleId; payload.avatar_url = info.picture || null; payload.auth_provider = 'google' }
    let r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
    if (!r.ok && googleCols) { delete payload.google_id; delete payload.avatar_url; delete payload.auth_provider; r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) }) }
    if (!r.ok) return fail('Impossible de créer le compte')
    u = r.data[0]
    // Enseignant : créer (ou rattacher) sa fiche dans `teachers` avec la matière déclarée.
    if (role === 'teacher') {
      const subject = String(st.subject || '').trim()
      if (!subject) googleWarn = 'matiere'
      else {
        try {
          const ex = await sb(c.env, `teachers?email=eq.${encodeURIComponent(email)}&select=id,subject`)
          let tid: number | null = ex.data?.[0]?.id ? Number(ex.data[0].id) : null
          if (tid) {
            if (!ex.data[0].subject) await sb(c.env, `teachers?id=eq.${tid}`, { method: 'PATCH', body: JSON.stringify({ subject }) })
          } else {
            const parts = String(u.name || email).trim().split(/\s+/)
            const tr = await sb(c.env, 'teachers', { method: 'POST', body: JSON.stringify({ first_name: parts[0] || u.name, last_name: parts.slice(1).join(' ') || '-', email, phone: null, subject, status: 'actif' }) })
            tid = tr.ok && tr.data?.[0]?.id ? Number(tr.data[0].id) : null
          }
          // Colonne absente (migration non appliquée) : on ignore, la fiche reste liée par email.
          if (tid) { const pr = await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ linked_teacher_id: tid }) }); if (pr.ok) u.linked_teacher_id = tid }
        } catch (e) {}
      }
    }
    await audit(c.env, c, u, 'signup_google', 'user_accounts', u.id, null, { email, role, status, ip })
    // F74 : annuaire du portail (best effort, jamais bloquant)
    await recordDirectoryEntry(c.env, email, { role, userId: u.id })
    // Enseignant : aucune session tant que l'administration n'a pas validé le compte.
    if (role === 'teacher') return fail("Compte enseignant en attente de validation par l'administration")
  }
  // F79 : liaison de l'enfant dès le retour de Google (le code a été saisi avant le clic).
  // Ne touche JAMAIS au rôle d'un compte existant ; ajoute seulement la liaison, sans doublon.
  const wantedCode = cleanStudentCode(st.code)
  if (wantedCode && ['parent', 'student'].includes(String(u.role))) {
    const sid = await parseStudentCode(c.env, wantedCode)
    const stRow = sid ? await sb(c.env, `students?id=eq.${sid}&select=id&status=eq.actif`) : null
    if (!sid || !stRow?.data?.length) googleWarn = 'code'
    else {
      const ids: number[] = Array.isArray(u.linked_student_ids) ? u.linked_student_ids.map(Number) : []
      if (!ids.includes(sid)) {
        ids.push(sid)
        const patch: any = { linked_student_ids: ids }
        if (!u.linked_student_id) patch.linked_student_id = sid
        const pr = await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
        if (pr.ok) { u.linked_student_ids = ids; if (!u.linked_student_id) u.linked_student_id = sid } else googleWarn = 'code'
      }
    }
  }
  await clearLoginFailures(c.env, email)
  await audit(c.env, c, u, 'login_google', 'user_accounts', u.id, null, { ip })
  // L2 : la session est posée en cookies HttpOnly — plus AUCUN jeton dans l'URL (ni fragment, ni query)
  await createSession(c.env, c, u)
  const retRaw = typeof st.ret === 'string' ? st.ret : '/'
  const ret = retRaw.startsWith('/') && !retRaw.startsWith('//') ? retRaw : '/'
  if (!googleWarn) return c.redirect(ret)
  // Message non bloquant (code élève refusé, matière manquante…) : rendu par handleGoogleReturn.
  const back = new URL(ret, DEFAULT_PUBLIC_ORIGIN)
  back.searchParams.set('google_warn', googleWarn)
  return c.redirect(back.pathname + back.search + back.hash)
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
  // L2 : session en cookie HttpOnly (aucun jeton dans le corps de la réponse)
  await createSession(c.env, c, u)
  // F74 : annuaire du portail (best effort, jamais bloquant)
  await recordDirectoryEntry(c.env, u.email, { role: u.role, userId: u.id })
  return c.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids } })
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
  // F74 : alimente l'annuaire de routage du portail (e-mail → établissement). Best effort :
  // n'échoue jamais la connexion, et son absence ne bloque jamais personne (/e/<slug> reste la voie de secours).
  await recordDirectoryEntry(c.env, u.email, { role: u.role, userId: u.id })
  // L2 : session en cookie HttpOnly (aucun jeton dans le corps de la réponse)
  const sess = await createSession(c.env, c, u)
  return c.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids }, session: { id: sess.sid } })
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
  // L2 : la session courante est conservée (jeton réémis, même `sid`) ; un changement de mot de passe
  // révoque toutes les AUTRES sessions (un appareil perdu ne reste pas connecté).
  if (b.new_password) await revokeAllSessions(c.env, nu.id, { exceptSid: user.sid })
  await reissueSession(c.env, c, nu, user.sid)
  return c.json({ user: { id: nu.id, name: nu.name, email: nu.email, role: nu.role, phone: nu.phone } })
})

// ---------- L2 : cycle de vie de la session ----------
// Déconnexion : révoque la session courante (immédiatement, même si le cookie est recopié) puis l'efface.
app.post('/api/auth/logout', async (c) => {
  const user = await getUser(c)
  if (user?.sid) await revokeSession(c.env, user.sid)
  clearSessionCookies(c)
  return c.json({ ok: true })
})

// Déconnexion de TOUS les appareils
app.post('/api/auth/logout-all', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  await revokeAllSessions(c.env, user.id)
  clearSessionCookies(c)
  return c.json({ ok: true })
})

// Renouvellement silencieux du jeton d'accès (cookie de rafraîchissement, 30 j)
app.post('/api/auth/refresh', async (c) => {
  const r = await refreshSession(c)
  if (!r) { clearSessionCookies(c); return c.json({ error: 'Session expirée' }, 401) }
  return c.json({ ok: true, user: { id: r.user.id, name: r.user.name, email: r.user.email, role: r.user.role } })
})

// Écran « Sessions actives » : liste des appareils connectés
app.get('/api/auth/sessions', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  return c.json(await listSessions(c.env, user.id, user.sid))
})

// Révoquer un appareil précis (le sien ou celui d'un membre, réservé à l'admin)
app.delete('/api/auth/sessions/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const id = c.req.param('id')
  const r = await sb(c.env, `sessions?id=eq.${encodeURIComponent(id)}&select=id,user_id`)
  const row = r.data?.[0]
  if (!row) return c.json({ error: 'Session introuvable' }, 404)
  if (Number(row.user_id) !== Number(user.id) && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  await revokeSession(c.env, id)
  await audit(c.env, c, user, 'session_revoked', 'sessions', id, null, { device: null })
  if (id === user.sid) clearSessionCookies(c)
  return c.json({ ok: true })
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
