// L3 : tests de la garde d'autorisation (deny-by-default) et des en-têtes de sécurité.
// Logique pure — aucune base, aucun réseau.
import { describe, it, expect } from 'vitest'
import { apiGateDecision, isPublicApi } from '../src/lib/route-guard'
import { CSP_DIRECTIVES, buildCsp, securityHeaders } from '../src/lib/security-headers'

describe('L3 — routes publiques légitimes', () => {
  it('la connexion, l’inscription et le renouvellement restent ouverts', () => {
    expect(isPublicApi('POST', '/api/auth/login')).toBe(true)
    expect(isPublicApi('POST', '/api/auth/signup')).toBe(true)
    expect(isPublicApi('POST', '/api/auth/refresh')).toBe(true)
    expect(isPublicApi('POST', '/api/auth/logout')).toBe(true)
    expect(isPublicApi('GET', '/api/auth/google/callback')).toBe(true)
    expect(isPublicApi('GET', '/api/auth/google/status')).toBe(true)
  })
  it('la marque, la santé et les vérifications publiques restent ouverts', () => {
    expect(isPublicApi('GET', '/api/brand')).toBe(true)
    expect(isPublicApi('GET', '/api/health')).toBe(true)
    expect(isPublicApi('GET', '/api/public/stats')).toBe(true)
    expect(isPublicApi('GET', '/api/public/verify/RCF-12-ABCD')).toBe(true)
    expect(isPublicApi('GET', '/api/public/receipt/42')).toBe(true)
  })
  it('les webhooks signés et l’annuaire d’établissements restent ouverts', () => {
    expect(isPublicApi('POST', '/api/telegram/webhook')).toBe(true)
    expect(isPublicApi('POST', '/api/payments/webhook')).toBe(true)
    expect(isPublicApi('GET', '/api/tenants')).toBe(true)
    expect(isPublicApi('GET', '/api/tenants/check/mon-ecole')).toBe(true)
    expect(isPublicApi('GET', '/api/tenants/mon-ecole')).toBe(true)
    expect(isPublicApi('GET', '/api/tenants/install.sql')).toBe(true)
  })
  it('l’inscription publique d’un élève reste possible sans compte', () => {
    expect(isPublicApi('POST', '/api/db/registrations')).toBe(true)
  })
})

describe('L3 — ce qui doit rester fermé', () => {
  it('les données métier exigent une session', () => {
    expect(isPublicApi('GET', '/api/students')).toBe(false)
    expect(isPublicApi('GET', '/api/teachers')).toBe(false)
    expect(isPublicApi('GET', '/api/fees')).toBe(false)
    expect(isPublicApi('POST', '/api/students')).toBe(false)
    expect(isPublicApi('PATCH', '/api/auth/me')).toBe(false)
    expect(isPublicApi('GET', '/api/auth/sessions')).toBe(false)
    expect(isPublicApi('DELETE', '/api/auth/sessions/abc')).toBe(false)
  })
  it('l’administration de la plateforme est fermée', () => {
    expect(isPublicApi('GET', '/api/tenants/admin/list')).toBe(false)
    expect(isPublicApi('PATCH', '/api/tenants/admin/3')).toBe(false)
    expect(isPublicApi('POST', '/api/tenants')).toBe(false)
    expect(isPublicApi('POST', '/api/tenants/test-db')).toBe(false)
    expect(isPublicApi('GET', '/api/admin/metrics')).toBe(false)
    expect(isPublicApi('GET', '/api/admin/editions')).toBe(false)
    expect(isPublicApi('PUT', '/api/admin/edition')).toBe(false)
  })
  it('une table non listée en écriture publique est fermée', () => {
    expect(isPublicApi('POST', '/api/db/students')).toBe(false)
    expect(isPublicApi('POST', '/api/db/user_accounts')).toBe(false)
    expect(isPublicApi('PUT', '/api/db/registrations/1')).toBe(false)
  })
})

describe('L3 — décision de la garde', () => {
  it('laisse passer un visiteur sur une route publique', () => {
    expect(apiGateDecision('GET', '/api/brand', false)).toBeNull()
    expect(apiGateDecision('POST', '/api/auth/login', false)).toBeNull()
  })
  it('laisse passer un utilisateur connecté partout', () => {
    expect(apiGateDecision('GET', '/api/students', true)).toBeNull()
    expect(apiGateDecision('DELETE', '/api/teachers/1', true)).toBeNull()
  })
  it('refuse en 401 un visiteur sur une route protégée', () => {
    expect(apiGateDecision('GET', '/api/students', false)).toEqual({ status: 401, error: 'Non authentifié' })
    expect(apiGateDecision('POST', '/api/fees', false)?.status).toBe(401)
  })
  it('ignore tout ce qui n’est pas sous /api/', () => {
    expect(apiGateDecision('GET', '/', false)).toBeNull()
    expect(apiGateDecision('GET', '/rafiq', false)).toBeNull()
    expect(apiGateDecision('GET', '/static/app.js', false)).toBeNull()
  })
  it('ne bloque jamais un préflight CORS', () => {
    expect(apiGateDecision('OPTIONS', '/api/students', false)).toBeNull()
    expect(apiGateDecision('HEAD', '/api/students', false)).toBeNull()
  })
})

describe('L3 — en-têtes de sécurité', () => {
  it('ferme les vecteurs indépendants des scripts', () => {
    const h = securityHeaders({ secure: true })
    expect(h['Content-Security-Policy']).toContain("object-src 'none'")
    expect(h['Content-Security-Policy']).toContain("base-uri 'self'")
    expect(h['Content-Security-Policy']).toContain("form-action 'self'")
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'self'")
    expect(h['Content-Security-Policy']).toContain("default-src 'self'")
  })
  it('pose les en-têtes complémentaires', () => {
    const h = securityHeaders({ secure: true })
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['Permissions-Policy']).toContain('geolocation=()')
  })
  it('n’envoie HSTS que sur https (sinon le navigateur mémorise un domaine http)', () => {
    expect(securityHeaders({ secure: true })['Strict-Transport-Security']).toContain('max-age=31536000')
    expect(securityHeaders({ secure: false })['Strict-Transport-Security']).toBeUndefined()
  })
  it('autorise les CDN et Supabase réellement utilisés par le client', () => {
    const csp = buildCsp()
    expect(csp).toContain('cdn.tailwindcss.com')
    expect(csp).toContain('cdn.jsdelivr.net')
    expect(csp).toContain('https://*.supabase.co')
    expect(csp).toContain('img-src')
  })
  it('la CSP reste permissive sur les scripts tant que les onclick existent', () => {
    // Verrou explicite : le jour où les gestionnaires en ligne seront retirés, ce test échouera
    // et forcera la décision de durcir script-src — aucune régression silencieuse.
    expect(CSP_DIRECTIVES['script-src']).toContain("'unsafe-inline'")
    expect(CSP_DIRECTIVES['script-src']).toContain("'unsafe-eval'")
  })
  it('sérialise les directives en une seule ligne valide', () => {
    const csp = buildCsp()
    expect(csp.split(';').length).toBe(Object.keys(CSP_DIRECTIVES).length)
    expect(csp).not.toContain('\n')
  })
})
