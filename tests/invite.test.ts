// F75 : tests des briques PURE de l'invitation (aucune base, aucun réseau).
import { describe, expect, it } from 'vitest'
import { buildInviteEmail, escAttr, hashToken, invitationUsable, newToken, validatePassword } from '../src/lib/invite'

describe('newToken', () => {
  it('produit un jeton opaque, sûr dans une URL', () => {
    const t = newToken()
    expect(t.length).toBeGreaterThanOrEqual(40)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)   // base64url : ni +, ni /, ni =
  })
  it('ne se répète jamais', () => {
    const set = new Set(Array.from({ length: 200 }, () => newToken()))
    expect(set.size).toBe(200)
  })
})

describe('hashToken', () => {
  it('est déterministe et ne renvoie pas le jeton', async () => {
    const t = newToken()
    const a = await hashToken(t), b = await hashToken(t)
    expect(a).toBe(b)
    expect(a).not.toBe(t)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('deux jetons différents donnent deux empreintes différentes', async () => {
    expect(await hashToken(newToken())).not.toBe(await hashToken(newToken()))
  })
})

describe('invitationUsable', () => {
  const NOW = new Date('2026-06-01T12:00:00Z').getTime()
  const future = new Date(NOW + 3600_000).toISOString()
  const past = new Date(NOW - 1).toISOString()

  it('refuse une invitation absente', () => {
    expect(invitationUsable(null, NOW)).toBe(false)
    expect(invitationUsable(undefined, NOW)).toBe(false)
  })
  it('refuse une invitation déjà utilisée', () => {
    expect(invitationUsable({ used_at: past, expires_at: future }, NOW)).toBe(false)
  })
  it('refuse une invitation expirée', () => {
    expect(invitationUsable({ used_at: null, expires_at: past }, NOW)).toBe(false)
  })
  it('refuse exactement à l’instant d’expiration (pas de seconde de rab)', () => {
    expect(invitationUsable({ used_at: null, expires_at: new Date(NOW).toISOString() }, NOW)).toBe(false)
  })
  it('accepte une invitation valide', () => {
    expect(invitationUsable({ used_at: null, expires_at: future }, NOW)).toBe(true)
  })
  it('refuse une date illisible plutôt que de laisser passer', () => {
    expect(invitationUsable({ used_at: null, expires_at: 'pas-une-date' }, NOW)).toBe(false)
  })
})

describe('validatePassword', () => {
  it('refuse trop court', () => {
    const r = validatePassword('ab1')
    expect('error' in r && r.error).toContain('8 caractères')
  })
  it('exige une lettre', () => {
    const r = validatePassword('12345678')
    expect('error' in r && r.error).toContain('lettre')
  })
  it('exige un chiffre', () => {
    const r = validatePassword('motdepasse')
    expect('error' in r && r.error).toContain('chiffre')
  })
  it('refuse un mot de passe démesuré', () => {
    expect('error' in validatePassword('a1' + 'x'.repeat(300))).toBe(true)
  })
  it('accepte un mot de passe raisonnable', () => {
    const r = validatePassword('MotDePasse2026')
    expect('value' in r && r.value).toBe('MotDePasse2026')
  })
  it('refuse les valeurs non textuelles', () => {
    expect('error' in validatePassword(null)).toBe(true)
    expect('error' in validatePassword(undefined)).toBe(true)
  })
})

describe('escAttr', () => {
  it('neutralise les guillemets et chevrons (attribut HTML)', () => {
    expect(escAttr(`a"b'c<d>e&f`)).toBe('a&quot;b&#39;c&lt;d&gt;e&amp;f')
  })
  it('gère null sans planter', () => {
    expect(escAttr(null)).toBe('')
  })
})

describe('buildInviteEmail', () => {
  const base = {
    brandName: 'Rahma Academy', email: 'dir@ecole.tn', tenantName: 'École El Amal',
    url: 'https://app.example/invitation/jeton123'
  }

  it('distingue invitation et réinitialisation par l’objet', () => {
    expect(buildInviteEmail(base).subject).toContain('Votre accès')
    expect(buildInviteEmail({ ...base, purpose: 'reset' }).subject).toContain('Réinitialisation')
  })

  it('contient le lien, le destinataire et le nom de l’établissement', () => {
    const m = buildInviteEmail(base)
    expect(m.html).toContain(base.url)
    expect(m.html).toContain('dir@ecole.tn')
    expect(m.html).toContain('École El Amal')
    expect(m.text).toContain(base.url)
    expect(m.text).toContain('dir@ecole.tn')
  })

  it('échappe le HTML injecté dans les champs libres', () => {
    const m = buildInviteEmail({ ...base, tenantName: '<img src=x onerror=alert(1)>', inviteeName: '"><script>' })
    expect(m.html).not.toContain('<img src=x')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;img')
  })

  it('ne contient JAMAIS de mot de passe', () => {
    const m = buildInviteEmail(base)
    for (const part of [m.subject, m.html, m.text]) {
      expect(part.toLowerCase()).not.toContain('mot de passe :')
      expect(part).not.toMatch(/password\s*[:=]/i)
    }
  })

  it('annonce une durée de validité', () => {
    expect(buildInviteEmail(base).html).toContain('7 jours')
  })
})
