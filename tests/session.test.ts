// L2 : tests de la mécanique de session (règles pures — aucune base, aucun réseau).
// Contrat vérifié : cookie HttpOnly/Secure/SameSite=Lax, session révoquée inutilisable,
// double-submit CSRF, exemption des routes de connexion.
import { describe, it, expect } from 'vitest'
import {
  CSRF_COOKIE, REFRESH_COOKIE, SESSION_COOKIE, SESSION_TTL_SEC, REFRESH_TTL_SEC,
  csrfExempt, csrfMatches, deviceLabelFromUa, isWriteMethod, serializeCookie, sessionUsable
} from '../src/lib/session-rules'

const past = new Date(Date.now() - 60_000).toISOString()
const future = new Date(Date.now() + 3_600_000).toISOString()

describe('L2 — cookie de session', () => {
  it('le cookie de session est HttpOnly, Secure et SameSite=Lax', () => {
    const ck = serializeCookie(SESSION_COOKIE, 'abc.def', { maxAge: SESSION_TTL_SEC, httpOnly: true, secure: true, sameSite: 'Lax' })
    expect(ck.startsWith('rahma_sess=')).toBe(true)
    expect(ck).toContain('HttpOnly')
    expect(ck).toContain('Secure')
    expect(ck).toContain('SameSite=Lax')
    expect(ck).toContain(`Max-Age=${SESSION_TTL_SEC}`)
    expect(ck).toContain('Path=/')
  })
  it('les durées sont 7 jours (accès) et 30 jours (rafraîchissement)', () => {
    expect(SESSION_TTL_SEC).toBe(7 * 86400)
    expect(REFRESH_TTL_SEC).toBe(30 * 86400)
  })
  it('le cookie CSRF est lisible par le JS (pas de HttpOnly) — ce n’est pas un secret d’authentification', () => {
    const ck = serializeCookie(CSRF_COOKIE, 'jeton', { maxAge: 60, httpOnly: false, secure: true })
    expect(ck).not.toContain('HttpOnly')
    expect(ck).toContain('Secure')
  })
  it('supprimer un cookie se fait par Max-Age=0', () => {
    expect(serializeCookie(SESSION_COOKIE, '', { maxAge: 0 })).toContain('Max-Age=0')
  })
  it('le cookie de rafraîchissement est distinct du cookie de session', () => {
    expect(REFRESH_COOKIE).not.toBe(SESSION_COOKIE)
  })
})

describe('L2 — validité d’une session (révocation immédiate)', () => {
  it('une session absente est refusée', () => {
    expect(sessionUsable(null)).toBe(false)
    expect(sessionUsable(undefined)).toBe(false)
  })
  it('une session révoquée est refusée même si elle n’a pas expiré', () => {
    expect(sessionUsable({ revoked_at: past, expires_at: future })).toBe(false)
  })
  it('une session expirée est refusée', () => {
    expect(sessionUsable({ revoked_at: null, expires_at: past })).toBe(false)
  })
  it('une session vivante est acceptée', () => {
    expect(sessionUsable({ revoked_at: null, expires_at: future })).toBe(true)
  })
})

describe('L2 — CSRF double-submit', () => {
  it('en-tête identique au cookie : accepté', () => {
    const t = 'a'.repeat(32)
    expect(csrfMatches(t, t)).toBe(true)
  })
  it('en-tête absent, vide ou différent : refusé', () => {
    const t = 'a'.repeat(32)
    expect(csrfMatches(null, t)).toBe(false)
    expect(csrfMatches('', t)).toBe(false)
    expect(csrfMatches('b'.repeat(32), t)).toBe(false)
    expect(csrfMatches(t.slice(0, 31), t)).toBe(false)
  })
  it('un jeton trop court est refusé (anti-valeur triviale)', () => {
    expect(csrfMatches('court', 'court')).toBe(false)
  })
  it('seules les écritures sont concernées', () => {
    expect(isWriteMethod('GET')).toBe(false)
    expect(isWriteMethod('HEAD')).toBe(false)
    expect(isWriteMethod('OPTIONS')).toBe(false)
    expect(isWriteMethod('POST')).toBe(true)
    expect(isWriteMethod('PATCH')).toBe(true)
    expect(isWriteMethod('DELETE')).toBe(true)
  })
  it('connexion, inscription, Google et rafraîchissement sont exemptés', () => {
    expect(csrfExempt('POST', '/api/auth/login')).toBe(true)
    expect(csrfExempt('POST', '/api/auth/signup')).toBe(true)
    expect(csrfExempt('GET', '/api/auth/google/callback')).toBe(true)
    expect(csrfExempt('POST', '/api/auth/refresh')).toBe(true)
    expect(csrfExempt('POST', '/api/public/registration')).toBe(true)
  })
  it('les écritures métier restent protégées', () => {
    expect(csrfExempt('POST', '/api/students')).toBe(false)
    expect(csrfExempt('PATCH', '/api/auth/me')).toBe(false)
    expect(csrfExempt('DELETE', '/api/teachers/12')).toBe(false)
    expect(csrfExempt('POST', '/api/auth/logout')).toBe(false)
  })
})

describe('L2 — libellé d’appareil', () => {
  it('reconnaît navigateur et système', () => {
    expect(deviceLabelFromUa('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe('Chrome · Android')
    expect(deviceLabelFromUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Safari/605.1')).toBe('Safari · iOS')
    expect(deviceLabelFromUa('Mozilla/5.0 (Windows NT 10.0) Firefox/121.0')).toBe('Firefox · Windows')
    expect(deviceLabelFromUa('')).toBe('Navigateur')
  })
})
