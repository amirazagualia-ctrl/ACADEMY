// F73 L5 : tests du jeu de données de provisionnement (logique pure, sans base ni réseau).
// Objectifs : un profil inconnu n'invente jamais de données ; « none » ne produit rien ;
// demo ⊃ minimal ; l'aperçu correspond exactement à ce qui sera inséré.
import { describe, it, expect } from 'vitest'
import { SEED_PROFILES, buildSeed, normalizeProfile, profileLabel, seedSummary } from '../src/lib/seed'

describe('L5 — profils de provisionnement', () => {
  it('normalise un profil inconnu ou absent en « none »', () => {
    expect(normalizeProfile(undefined)).toBe('none')
    expect(normalizeProfile(null)).toBe('none')
    expect(normalizeProfile('')).toBe('none')
    expect(normalizeProfile('DÉMO')).toBe('none')
    expect(normalizeProfile('inconnu')).toBe('none')
    expect(normalizeProfile(42)).toBe('none')
  })

  it('accepte les trois profils connus, insensible à la casse et aux espaces', () => {
    expect(normalizeProfile('demo')).toBe('demo')
    expect(normalizeProfile(' DEMO ')).toBe('demo')
    expect(normalizeProfile('minimal')).toBe('minimal')
    expect(normalizeProfile('none')).toBe('none')
    expect(SEED_PROFILES).toEqual(['none', 'minimal', 'demo'])
  })

  it('donne un libellé lisible pour chaque profil', () => {
    for (const p of SEED_PROFILES) expect(profileLabel(p).length).toBeGreaterThan(0)
    expect(profileLabel('demo')).toContain('monstration')
  })
})

describe('L5 — contenu du jeu de données', () => {
  it('« none » ne produit AUCUNE donnée et aucun historique', () => {
    const plan = buildSeed('none')
    expect(plan.teachers).toHaveLength(0)
    expect(plan.classes).toHaveLength(0)
    expect(plan.students).toHaveLength(0)
    expect(plan.history).toBe(false)
  })

  it('« minimal » produit un socle sans historique', () => {
    const plan = buildSeed('minimal')
    expect(plan.teachers.length).toBeGreaterThan(0)
    expect(plan.classes.length).toBeGreaterThan(0)
    expect(plan.students.length).toBeGreaterThan(0)
    expect(plan.history).toBe(false)
  })

  it('« demo » produit un jeu complet avec historique', () => {
    const plan = buildSeed('demo')
    expect(plan.history).toBe(true)
    expect(plan.students.length).toBeGreaterThan(plan.classes.length)
  })

  it('demo contient tout ce que contient minimal (jeu strictement plus riche)', () => {
    const min = buildSeed('minimal')
    const demo = buildSeed('demo')
    expect(demo.teachers.length).toBeGreaterThanOrEqual(min.teachers.length)
    expect(demo.classes.length).toBeGreaterThanOrEqual(min.classes.length)
    expect(demo.students.length).toBeGreaterThanOrEqual(min.students.length)
  })

  it('chaque élève référence une classe existante du plan', () => {
    for (const profile of ['minimal', 'demo'] as const) {
      const plan = buildSeed(profile)
      for (const s of plan.students) {
        expect(plan.classes[s.classIdx]).toBeDefined()
        expect(plan.classes[s.classIdx].level).toBe(s.level)
      }
    }
  })

  it('chaque classe référence un enseignant existant du plan', () => {
    for (const profile of ['minimal', 'demo'] as const) {
      const plan = buildSeed(profile)
      for (const c of plan.classes) expect(plan.teachers[c.teacherIdx]).toBeDefined()
    }
  })

  it('les e-mails de démonstration sont tous distincts et non routables', () => {
    const plan = buildSeed('demo')
    const emails = plan.teachers.map(t => t.email)
    expect(new Set(emails).size).toBe(emails.length)
    // domaines réservés : aucune chance d'écrire à une vraie personne
    for (const e of emails) expect(/@(ecole\.example)$/.test(e)).toBe(true)
    for (const s of plan.students) expect(/@example\.tn$/.test(s.parent_email)).toBe(true)
  })
})

describe('L5 — aperçu affiché avant validation', () => {
  it('l’aperçu correspond exactement au plan inséré', () => {
    for (const profile of SEED_PROFILES) {
      const plan = buildSeed(profile)
      const sum = seedSummary(plan)
      expect(sum.teachers).toBe(plan.teachers.length)
      expect(sum.classes).toBe(plan.classes.length)
      expect(sum.students).toBe(plan.students.length)
    }
  })

  it('l’aperçu ne promet aucun historique quand il n’y en a pas', () => {
    for (const profile of ['none', 'minimal'] as const) {
      const sum = seedSummary(buildSeed(profile))
      expect(sum.grades).toBeUndefined()
      expect(sum.attendance).toBeUndefined()
      expect(sum.fees).toBeUndefined()
    }
  })

  it('l’aperçu de démo annonce les volumes d’historique', () => {
    const plan = buildSeed('demo')
    const sum = seedSummary(plan)
    expect(sum.grades).toBe(plan.students.length * 2)
    expect(sum.attendance).toBe(plan.students.length * 5)
    expect(sum.fees).toBe(plan.students.length * 2)
    expect(sum.events).toBe(1)
    expect(sum.homeworks).toBe(1)
  })
})
