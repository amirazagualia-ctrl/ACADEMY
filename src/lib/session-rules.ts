// L2 : règles de session — logique PURE (aucun accès base, aucun réseau), donc testable directement.
// La mécanique (cookies, base, JWT) vit dans ./session.ts.

export const SESSION_COOKIE = 'rahma_sess'
export const REFRESH_COOKIE = 'rahma_refresh'
export const CSRF_COOKIE = 'rahma_csrf'
export const CSRF_HEADER = 'X-CSRF-Token'

// Durées : 7 jours d'accès (jeton), 30 jours de rafraîchissement (secret opaque).
export const SESSION_TTL_SEC = 7 * 86400
export const REFRESH_TTL_SEC = 30 * 86400
// Réécriture de `last_seen` au maximum toutes les 5 minutes (écran « Sessions actives »).
export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000

// Écritures soumises au double-submit CSRF.
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']
// Chemins qui ne peuvent pas porter d'en-tête CSRF : connexion/inscription, retour Google, rafraîchissement.
const CSRF_EXEMPT_PREFIXES = ['/api/auth/login', '/api/auth/signup', '/api/auth/google', '/api/auth/refresh', '/api/portal/request', '/api/portal/lookup']

export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.includes(String(method || '').toUpperCase())
}

// Le CSRF ne concerne QUE les requêtes authentifiées par cookie (une page tierce peut faire
// envoyer les cookies du navigateur, jamais fabriquer un en-tête personnalisé).
// Les webhooks et scripts (Bearer) n'envoient pas de cookie de session : ils ne sont donc pas concernés.
export function csrfExempt(method: string, pathname: string): boolean {
  if (!isWriteMethod(method)) return true
  const p = String(pathname || '')
  if (p.startsWith('/api/public/')) return true
  return CSRF_EXEMPT_PREFIXES.some(x => p === x || p.startsWith(x + '/'))
}

// Double-submit : l'en-tête doit être identique au cookie lisible `rahma_csrf`.
export function csrfMatches(headerValue: string | null | undefined, cookieValue: string | null | undefined): boolean {
  const a = String(headerValue || ''), b = String(cookieValue || '')
  if (a.length < 16 || b.length < 16 || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// `Set-Cookie` sérialisé. `secure` est désactivé en http:// (localhost) sinon le navigateur rejette le cookie.
export function serializeCookie(name: string, value: string, opts: { maxAge?: number; path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: 'Lax' | 'Strict' | 'None' } = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${opts.path || '/'}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`)
  if (opts.httpOnly !== false) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`)
  return parts.join('; ')
}

// Une session est valide si : ligne présente, non révoquée, non expirée.
export function sessionUsable(row: { revoked_at?: string | null; expires_at?: string | null } | null | undefined, now = Date.now()): boolean {
  if (!row) return false
  if (row.revoked_at) return false
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false
  return true
}

// Libellé d'appareil lisible (« Chrome · Android ») — jamais l'IP brute, jamais l'empreinte complète.
export function deviceLabelFromUa(ua: string | null | undefined): string {
  const s = String(ua || '')
  const browser = /Edg\//.test(s) ? 'Edge'
    : /OPR\/|Opera/.test(s) ? 'Opera'
    : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : 'Navigateur'
  const os = /Android/.test(s) ? 'Android'
    : /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Windows/.test(s) ? 'Windows'
    : /Mac OS X/.test(s) ? 'macOS'
    : /Linux/.test(s) ? 'Linux'
    : ''
  return os ? `${browser} · ${os}` : browser
}
