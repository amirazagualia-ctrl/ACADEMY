// F74 : tests de la logique PURE du portail d'entrée (aucune base, aucun réseau).
import { describe, expect, it } from 'vitest'
import { normEmail, validateRequest } from '../src/lib/portal'

describe('normEmail', () => {
  it('normalise en minuscules et retire les espaces', () => {
    expect(normEmail('  Sonia.BenSalah@Ecole.Example ')).toBe('sonia.bensalah@ecole.example')
  })
  it('refuse les adresses invalides', () => {
    for (const bad of ['', 'abc', 'a@b', 'a b@c.tn', '@x.tn', 'x@.tn', null, undefined, 42]) {
      expect(normEmail(bad)).toBe('')
    }
  })
  it('accepte une adresse plausible', () => {
    expect(normEmail('parent@example.tn')).toBe('parent@example.tn')
  })
})

describe('validateRequest', () => {
  const base = { name: 'École El Amal', director_name: 'Ahmed Ben Ali', director_email: 'DIR@Ecole.tn' }

  it('accepte une demande minimale et normalise l’e-mail', () => {
    const v = validateRequest(base)
    expect('value' in v).toBe(true)
    if (!('value' in v)) return
    expect(v.value.name).toBe('École El Amal')
    expect(v.value.director_email).toBe('dir@ecole.tn')
    expect(v.value.type).toBe('ecole')
    expect(v.value.city).toBeNull()
    expect(v.value.expected_students).toBeNull()
    expect(v.value.message).toBeNull()
  })

  it('exige un nom d’établissement d’au moins 2 caractères', () => {
    expect(validateRequest({ ...base, name: 'A' })).toEqual({ error: "Indiquez le nom de votre établissement (2 caractères minimum)." })
    expect(validateRequest({ ...base, name: '   ' })).toEqual({ error: "Indiquez le nom de votre établissement (2 caractères minimum)." })
  })

  it('exige le nom du directeur', () => {
    expect(validateRequest({ ...base, director_name: '' })).toEqual({ error: 'Indiquez le nom du directeur ou de la directrice.' })
  })

  it('refuse un e-mail de directeur invalide', () => {
    expect(validateRequest({ ...base, director_email: 'pas-un-email' })).toEqual({ error: 'Adresse e-mail invalide.' })
  })

  it('borne le nombre d’élèves attendus', () => {
    expect(validateRequest({ ...base, expected_students: 0 })).toEqual({ error: "Nombre d'élèves attendu invalide." })
    expect(validateRequest({ ...base, expected_students: 99999 })).toEqual({ error: "Nombre d'élèves attendu invalide." })
    const v = validateRequest({ ...base, expected_students: '120' })
    expect('value' in v && v.value.expected_students).toBe(120)
  })

  it('ignore un nombre d’élèves vide', () => {
    const v = validateRequest({ ...base, expected_students: '   ' })
    expect('value' in v && v.value.expected_students).toBeNull()
  })

  it('borne la longueur du message', () => {
    expect(validateRequest({ ...base, message: 'x'.repeat(1600) })).toEqual({ error: 'Le message est trop long (1500 caractères maximum).' })
    const v = validateRequest({ ...base, message: '  Bonjour  ' })
    expect('value' in v && v.value.message).toBe('Bonjour')
  })

  it('nettoie le téléphone et tronque le nom', () => {
    const v = validateRequest({ ...base, phone: '+216 71 <script> 000', name: 'N'.repeat(200) })
    expect('value' in v).toBe(true)
    if (!('value' in v)) return
    expect(v.value.phone).toBe('+216 71 000')
    expect(v.value.name.length).toBe(120)
  })

  it('ne transmet jamais de champ secret, même s’il est fourni', () => {
    const v = validateRequest({ ...base, db_key: 'service_role_xxx', password: 'secret' } as any)
    expect('value' in v).toBe(true)
    if (!('value' in v)) return
    expect(Object.keys(v.value).sort()).toEqual(['city', 'director_email', 'director_name', 'expected_students', 'message', 'name', 'phone', 'type'])
  })
})
