// F77 : tests de la logique PURE du diagnostic d'expéditeur e-mail (aucun réseau).
import { describe, expect, it } from 'vitest'
import { RESEND_TEST_FROM, domainOf, evaluateSender, senderLevelLabel } from '../src/lib/email-status'

describe('domainOf', () => {
  it('extrait la partie après le dernier @', () => {
    expect(domainOf('no-reply@ecole.tn')).toBe('ecole.tn')
    expect(domainOf('  No-Reply@Ecole.TN ')).toBe('ecole.tn')
  })
  it('renvoie une chaîne vide sans @', () => {
    expect(domainOf('pasuneadresse')).toBe('')
    expect(domainOf('')).toBe('')
    expect(domainOf(null as any)).toBe('')
  })
})

describe('evaluateSender', () => {
  it('signale l’absence de clé API avant tout le reste', () => {
    const v = evaluateSender({ apiKey: null, fromEnv: 'no-reply@ecole.tn', domains: [] })
    expect(v.level).toBe('missing')
    expect(v.ready).toBe(false)
  })

  it('détecte le mode test quand RESEND_FROM est absent', () => {
    const v = evaluateSender({ apiKey: 're_x', domains: [] })
    expect(v.from).toBe(RESEND_TEST_FROM)
    expect(v.domain).toBe('resend.dev')
    expect(v.level).toBe('test')
    // Le point capital : le mode test n'est JAMAIS « prêt » pour un tiers.
    expect(v.ready).toBe(false)
    expect(v.reason).toContain('adresse du compte')
  })

  it('détecte le mode test même si RESEND_FROM pointe explicitement sur resend.dev', () => {
    const v = evaluateSender({ apiKey: 're_x', fromEnv: 'onboarding@resend.dev', domains: [{ name: 'resend.dev', status: 'verified' }] })
    expect(v.level).toBe('test')
    expect(v.ready).toBe(false)
  })

  it('ne prétend pas que tout va bien quand l’appel Resend a échoué', () => {
    const v = evaluateSender({ apiKey: 're_x', fromEnv: 'no-reply@ecole.tn', domains: null })
    expect(v.level).toBe('unknown')
    expect(v.ready).toBe(false)
  })

  it('refuse un domaine présent mais non vérifié (cas réel du projet)', () => {
    // État mesuré : /domains renvoie [] → aucun domaine vérifié.
    const v = evaluateSender({ apiKey: 're_x', fromEnv: 'no-reply@ecole.tn', domains: [] })
    expect(v.level).toBe('unverified')
    expect(v.ready).toBe(false)
    expect(v.reason).toContain('ecole.tn')
  })

  it('refuse un domaine vérifié mais différent de celui de RESEND_FROM', () => {
    const v = evaluateSender({
      apiKey: 're_x', fromEnv: 'no-reply@ecole.tn',
      domains: [{ name: 'autre.tn', status: 'verified' }]
    })
    expect(v.level).toBe('unverified')
    expect(v.ready).toBe(false)
    expect(v.verified_domains).toEqual(['autre.tn'])
  })

  it('refuse un domaine au statut « pending »', () => {
    const v = evaluateSender({ apiKey: 're_x', fromEnv: 'no-reply@ecole.tn', domains: [{ name: 'ecole.tn', status: 'pending' }] })
    expect(v.level).toBe('unverified')
    expect(v.verified_domains).toEqual([])
  })

  it('accepte un domaine vérifié correspondant, insensible à la casse', () => {
    const v = evaluateSender({ apiKey: 're_x', fromEnv: 'No-Reply@Ecole.TN', domains: [{ name: 'ecole.tn', status: 'verified' }] })
    expect(v.level).toBe('ok')
    expect(v.ready).toBe(true)
    expect(v.action).toBe('')
  })

  it('trie et déduplique les domaines vérifiés', () => {
    const v = evaluateSender({
      apiKey: 're_x', fromEnv: 'a@b.tn',
      domains: [{ name: 'z.tn', status: 'verified' }, { name: 'b.tn', status: 'verified' }, { name: 'a.tn', status: 'not_started' }]
    })
    expect(v.verified_domains).toEqual(['b.tn', 'z.tn'])
  })

  it('ignore les entrées malformées sans lever d’exception', () => {
    const v = evaluateSender({ apiKey: 're_x', fromEnv: 'a@b.tn', domains: [null as any, {} as any, { name: '', status: 'verified' }] })
    expect(v.verified_domains).toEqual([])
    expect(v.level).toBe('unverified')
  })
})

describe('senderLevelLabel', () => {
  it('donne un libellé français pour chaque niveau', () => {
    for (const l of ['missing', 'test', 'unverified', 'unknown', 'ok'] as const) {
      expect(senderLevelLabel(l)).not.toBe('Inconnu')
    }
  })
  it('retombe sur « Inconnu » pour une valeur imprévue', () => {
    expect(senderLevelLabel('n_importe_quoi' as any)).toBe('Inconnu')
  })
})
