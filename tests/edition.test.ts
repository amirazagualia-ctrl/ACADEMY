// F71 : tests des règles d'édition (logique pure, sans base ni réseau).
// Objectif explicite du lot : « un GET passe en démo, un POST est refusé, complete laisse tout passer ».
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_EDITION,
  DEMO_READ_ONLY_ERROR,
  EDITION_CODES,
  EDITION_FALLBACK,
  EDITION_SWITCH_PATH,
  editionInfo,
  editionWriteBlocked,
  isEditionCode,
  isWriteMethod,
  mergeEditionModules,
  normalizeEditionCode
} from '../src/lib/edition-rules'

const demo = EDITION_FALLBACK.find(e => e.code === 'demo')!
const test = EDITION_FALLBACK.find(e => e.code === 'test')!
const complete = EDITION_FALLBACK.find(e => e.code === 'complete')!

describe('édition — catalogue', () => {
  it('expose exactement les trois éditions demandées', () => {
    expect(EDITION_CODES).toEqual(['demo', 'test', 'complete'])
    expect(EDITION_FALLBACK.map(e => e.code)).toEqual(['demo', 'test', 'complete'])
  })
  it('seule la démo est en lecture seule', () => {
    expect(demo.read_only).toBe(true)
    expect(test.read_only).toBe(false)
    expect(complete.read_only).toBe(false)
  })
  it('la démo masque les modules sensibles (frais, inscriptions)', () => {
    expect(demo.modules.fees).toBe(false)
    expect(demo.modules.registrations).toBe(false)
    expect(complete.modules).toEqual({})
  })
  it('une édition inconnue ou absente retombe sur « complete » (jamais de blocage accidentel)', () => {
    expect(normalizeEditionCode('demo')).toBe('demo')
    expect(normalizeEditionCode(undefined)).toBe(DEFAULT_EDITION)
    expect(normalizeEditionCode(null)).toBe('complete')
    expect(normalizeEditionCode('production')).toBe('complete')
    expect(normalizeEditionCode('DEMO')).toBe('complete') // casse stricte : pas de surprise
  })
  it('isEditionCode est strict', () => {
    expect(isEditionCode('test')).toBe(true)
    expect(isEditionCode('Demo')).toBe(false)
    expect(isEditionCode(42)).toBe(false)
  })
  it('editionInfo ne divulgue pas la configuration interne', () => {
    expect(Object.keys(editionInfo(demo)).sort()).toEqual(['code', 'hint', 'label', 'label_ar', 'read_only'])
  })
})

describe('édition — lecture seule (côté serveur)', () => {
  it('un GET passe en démo', () => {
    expect(editionWriteBlocked('GET', '/api/students', true)).toBe(false)
    expect(editionWriteBlocked('get', '/api/fees', true)).toBe(false)
  })
  it('HEAD et OPTIONS passent (préflight CORS : sinon la démo casserait tous les appels)', () => {
    expect(editionWriteBlocked('HEAD', '/api/students', true)).toBe(false)
    expect(editionWriteBlocked('OPTIONS', '/api/students', true)).toBe(false)
  })
  it('un POST est refusé en démo', () => {
    expect(editionWriteBlocked('POST', '/api/students', true)).toBe(true)
  })
  it('PUT / PATCH / DELETE sont refusés en démo', () => {
    for (const m of ['PUT', 'PATCH', 'DELETE']) expect(editionWriteBlocked(m, '/api/fees/1', true)).toBe(true)
  })
  it('les écritures restent possibles sur /api/auth/* (sinon la démo est inutilisable)', () => {
    expect(editionWriteBlocked('POST', '/api/auth/login', true)).toBe(false)
    expect(editionWriteBlocked('POST', '/api/auth/logout', true)).toBe(false)
  })
  it('la sortie de secours reste ouverte, même en démo (sinon impossible de revenir en complete)', () => {
    expect(editionWriteBlocked('PUT', EDITION_SWITCH_PATH, true)).toBe(false)
  })
  it('complete laisse tout passer', () => {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) expect(editionWriteBlocked(m, '/api/students', false)).toBe(false)
  })
  it('les routes non-API ne sont jamais bloquées (pages HTML)', () => {
    expect(editionWriteBlocked('POST', '/inscription', true)).toBe(false)
    expect(editionWriteBlocked('PUT', '/rafiq', true)).toBe(false)
  })
  it('isWriteMethod est correct', () => {
    expect(['GET', 'HEAD', 'OPTIONS', 'get'].map(isWriteMethod)).toEqual([false, false, false, false])
    expect(['POST', 'PUT', 'PATCH', 'DELETE'].map(isWriteMethod)).toEqual([true, true, true, true])
  })
  it('le message d’erreur exigé par le lot est exactement celui attendu', () => {
    expect(DEMO_READ_ONLY_ERROR).toBe('Édition démo : lecture seule')
  })
})

describe('édition — fusion des modules', () => {
  it('l’édition ne peut que restreindre, jamais activer d’office', () => {
    // l'école a désactivé « chat », l'édition ne le réactive pas
    expect(mergeEditionModules({ chat: false }, {}).chat).toBe(false)
  })
  it('un module interdit par l’édition reste interdit même si l’école l’a activé', () => {
    expect(mergeEditionModules({ fees: true }, { fees: false }).fees).toBe(false)
    expect(mergeEditionModules(undefined, { fees: false }).fees).toBe(false)
  })
  it('les modules non mentionnés restent actifs', () => {
    const m = mergeEditionModules({ chat: true }, { fees: false })
    expect(m.chat).toBe(true)
    expect(m.fees).toBe(false)
  })
  it('sans aucun réglage, le résultat est vide (tout est actif par défaut)', () => {
    expect(mergeEditionModules(undefined, undefined)).toEqual({})
    expect(mergeEditionModules({}, {})).toEqual({})
  })
  it('applique bien le cas réel démo + établissement', () => {
    const m = mergeEditionModules({ chat: false, grades: true }, demo.modules)
    expect(m).toEqual({ chat: false, grades: true, fees: false, registrations: false })
  })
})
