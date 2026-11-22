// L2 : sessions serveur — cookie HttpOnly signé + table `sessions` pour la révocation immédiate.
// Remplace le JWT stocké dans localStorage (`edu_token`), qui reste accepté uniquement s'il porte
// un `sid` de session vivante (compatibilité ascendante pendant la transition).
import { sign, verify } from 'hono/jwt'
import { sb } from './supabase'
import { cfg, DEFAULT_TENANT, tenantSlug } from './tenant'
import { b64url, sha256Hex } from './crypto'

// Comparaison à temps constant (les deux valeurs sont des hex SHA-256 de même longueur).
function hexEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
import { clientIp, parseCookie, publicOrigin } from './utils'
import {
  CSRF_COOKIE, LAST_SEEN_THROTTLE_MS, REFRESH_COOKIE, REFRESH_TTL_SEC, SESSION_COOKIE, SESSION_TTL_SEC,
  deviceLabelFromUa, serializeCookie, sessionUsable
} from './session-rules'
import type { Bindings } from '../types/bindings'

export type SessionRow = {
  id: string; user_id: number; tenant: string; device_label?: string | null; csrf?: string | null
  ip?: string | null; created_at?: string; last_seen?: string; expires_at?: string; revoked_at?: string | null
}

const isHttps = (c: any) => publicOrigin(c).startsWith('https')
const iso = (t: number) => new Date(t).toISOString()

// ---------- Création ----------
// Crée la ligne de session PUIS pose les cookies. Retourne le jeton d'accès (pour les scripts internes).
export async function createSession(env: Bindings, c: any, u: any, opts: { ttl?: number } = {}) {
  const sid = b64url(crypto.getRandomValues(new Uint8Array(18)))
  const csrf = b64url(crypto.getRandomValues(new Uint8Array(24)))
  const refreshSecret = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const ttl = opts.ttl || SESSION_TTL_SEC
  const now = Date.now()
  const row: any = {
    id: sid, user_id: u.id, tenant: tenantSlug(),
    device_label: deviceLabelFromUa(c.req.header('User-Agent')), csrf,
    refresh_hash: await sha256Hex(refreshSecret), ip: clientIp(c),
    created_at: iso(now), last_seen: iso(now), expires_at: iso(now + REFRESH_TTL_SEC * 1000)
  }
  // Colonne `csrf` / `refresh_hash` absente (migration partielle) : on réessaie sans, la session reste valide.
  let r = await sb(env, 'sessions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) })
  if (!r.ok) {
    delete row.csrf; delete row.refresh_hash
    r = await sb(env, 'sessions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) })
  }
  const token = await sign({
    id: u.id, email: u.email, role: u.role, name: u.name,
    linked_student_id: u.linked_student_id ?? null, linked_student_ids: u.linked_student_ids ?? [],
    tenant: tenantSlug(), sid, exp: Math.floor(now / 1000) + ttl
  }, cfg(env).jwt)

  const secure = isHttps(c)
  c.header('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAge: ttl, httpOnly: true, secure }), { append: true })
  // Jeton CSRF lisible par le JS (double-submit) : ce n'est PAS un secret d'authentification.
  c.header('Set-Cookie', serializeCookie(CSRF_COOKIE, csrf, { maxAge: ttl, httpOnly: false, secure }), { append: true })
  // Jeton de rafraîchissement : valeur opaque, non signée (le hash est seul stocké côté serveur).
  c.header('Set-Cookie', serializeCookie(REFRESH_COOKIE, `${sid}.${refreshSecret}`, { maxAge: REFRESH_TTL_SEC, httpOnly: true, secure }), { append: true })

  return { token, sid, csrf, degraded: !r.ok }
}

// ---------- Résolution ----------
// Vérifie : cookie présent → signature → établissement → session vivante en base (sinon 401).
export async function resolveSession(c: any): Promise<any | null> {
  const raw = parseCookie(c, SESSION_COOKIE)
  if (!raw) return null
  let p: any
  try { p = await verify(raw, cfg(c.env).jwt, 'HS256') } catch { return null }
  if ((p?.tenant || DEFAULT_TENANT) !== tenantSlug()) return null
  if (!p?.sid) return null
  const r = await sb(c.env, `sessions?id=eq.${encodeURIComponent(p.sid)}&select=id,user_id,tenant,csrf,revoked_at,expires_at,last_seen`)
  // Table absente (migration 0021 non appliquée) : mode dégradé, on garde la signature seule.
  if (!r.ok) return { ...p, degraded: true }
  const row: SessionRow | undefined = r.data?.[0]
  if (!sessionUsable(row)) return null
  // Rafraîchit `last_seen` au maximum toutes les 5 minutes (écran « Sessions actives »).
  try {
    const seen = row?.last_seen ? new Date(row.last_seen).getTime() : 0
    if (Date.now() - seen > LAST_SEEN_THROTTLE_MS) await sb(c.env, `sessions?id=eq.${encodeURIComponent(p.sid)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_seen: new Date().toISOString() }) })
  } catch {}
  return { ...p, sid: row!.id, csrf: row?.csrf || null }
}

// ---------- Rafraîchissement ----------
// Le cookie de rafraîchissement permet de renouveler le jeton d'accès sans redemander le mot de passe.
export async function refreshSession(c: any): Promise<any | null> {
  const raw = parseCookie(c, REFRESH_COOKIE)
  if (!raw) return null
  const dot = raw.indexOf('.')
  if (dot <= 0) return null
  const sid = raw.slice(0, dot), secret = raw.slice(dot + 1)
  const r = await sb(c.env, `sessions?id=eq.${encodeURIComponent(sid)}&select=*`)
  const row: any = r.data?.[0]
  if (!sessionUsable(row)) return null
  if ((row.tenant || DEFAULT_TENANT) !== tenantSlug()) return null
  if (row.refresh_hash && !hexEqual(String(row.refresh_hash), await sha256Hex(secret))) return null
  const acc = await sb(c.env, `user_accounts?id=eq.${row.user_id}&select=id,name,email,role,status,linked_student_id,linked_student_ids`)
  const u: any = acc.data?.[0]
  if (!u || u.status !== 'active') return null
  const token = await sign({
    id: u.id, email: u.email, role: u.role, name: u.name,
    linked_student_id: u.linked_student_id ?? null, linked_student_ids: u.linked_student_ids ?? [],
    tenant: tenantSlug(), sid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  }, cfg(c.env).jwt)
  const secure = isHttps(c)
  c.header('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SEC, httpOnly: true, secure }), { append: true })
  if (row.csrf) c.header('Set-Cookie', serializeCookie(CSRF_COOKIE, row.csrf, { maxAge: SESSION_TTL_SEC, httpOnly: false, secure }), { append: true })
  return { token, sid, user: u }
}

// ---------- Réémission ----------
// Réémet le jeton d'accès pour une session EXISTANTE (même `sid`) : utilisé après modification du compte
// (nom, e-mail, liaisons élèves) pour que le cookie reflète les nouvelles valeurs sans nouvelle session.
export async function reissueSession(env: Bindings, c: any, u: any, sid: string | null | undefined) {
  if (!sid) return createSession(env, c, u)
  const token = await sign({
    id: u.id, email: u.email, role: u.role, name: u.name,
    linked_student_id: u.linked_student_id ?? null, linked_student_ids: u.linked_student_ids ?? [],
    tenant: tenantSlug(), sid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  }, cfg(env).jwt)
  const secure = isHttps(c)
  c.header('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SEC, httpOnly: true, secure }), { append: true })
  return { token, sid }
}

// ---------- Révocation ----------
export async function revokeSession(env: Bindings, sid: string) {
  try { await sb(env, `sessions?id=eq.${encodeURIComponent(sid)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) }) } catch {}
}
// Révoque toutes les sessions d'un compte (déconnexion globale, changement de mot de passe).
export async function revokeAllSessions(env: Bindings, userId: number, opts: { exceptSid?: string } = {}) {
  let path = `sessions?user_id=eq.${Number(userId)}&revoked_at=is.null`
  if (opts.exceptSid) path += `&id=neq.${encodeURIComponent(opts.exceptSid)}`
  try { await sb(env, path, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) }) } catch {}
}
export function clearSessionCookies(c: any) {
  const secure = isHttps(c)
  for (const name of [SESSION_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    c.header('Set-Cookie', serializeCookie(name, '', { maxAge: 0, httpOnly: name !== CSRF_COOKIE, secure }), { append: true })
  }
}

// ---------- Liste (écran « Sessions actives ») ----------
export async function listSessions(env: Bindings, userId: number, currentSid?: string | null) {
  const r = await sb(env, `sessions?user_id=eq.${Number(userId)}&revoked_at=is.null&order=last_seen.desc&limit=50`)
  if (!r.ok) return { supported: false, items: [] as any[] }
  const now = Date.now()
  const items = (r.data || [])
    .filter((s: any) => sessionUsable(s, now))
    .map((s: any) => ({
      id: s.id, device_label: s.device_label || 'Appareil inconnu', ip: s.ip || null,
      created_at: s.created_at, last_seen: s.last_seen, expires_at: s.expires_at,
      current: !!currentSid && s.id === currentSid
    }))
  return { supported: true, items }
}
