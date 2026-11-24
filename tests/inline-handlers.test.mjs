// F76 : tests du cliquet anti-régression des gestionnaires inline.
// Le script est un module ESM sans types : testé ici en .mjs pour rester dans le
// même langage que lui (aucune duplication de la logique de comptage).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countByFile, evaluate } from '../scripts/inline-handlers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = JSON.parse(readFileSync(join(ROOT, 'tests/inline-handlers.baseline.json'), 'utf8'))

describe('countByFile', () => {
  it('ne compte rien dans un fichier sans gestionnaire', () => {
    const counts = countByFile(ROOT)
    expect(counts['public/static/portal.js']).toBeUndefined()
  })

  it('ne contamine pas les fichiers de données volumineux', () => {
    const counts = countByFile(ROOT)
    for (const f of Object.keys(counts)) {
      expect(f).not.toMatch(/situations-data-\d+\.js$/)
      expect(f).not.toMatch(/pdf-fonts\.js$/)
    }
  })

  it('compte chaque forme d’attribut inline, y compris onerror', () => {
    const counts = countByFile(ROOT)
    // invite.ts porte un unique `onerror` : s'il n'est pas compté, le cliquet est aveugle.
    expect(counts['src/routes/invite.ts']).toBe(1)
  })

  it('le fichier converti ne remonte jamais', () => {
    expect(countByFile(ROOT)['public/static/portal.js'] ?? 0).toBe(0)
  })
})

describe('evaluate', () => {
  const base = { total: 10, files: { 'a.js': 6, 'b.js': 4 } }

  it('accepte une situation identique à la référence', () => {
    expect(evaluate({ 'a.js': 6, 'b.js': 4 }, base).errors).toEqual([])
  })

  it('accepte et signale une baisse (c’est tout l’intérêt du cliquet)', () => {
    const r = evaluate({ 'a.js': 3, 'b.js': 4 }, base)
    expect(r.errors).toEqual([])
    expect(r.improved).toEqual(['a.js : 3 (référence 6)'])
  })

  it('refuse une hausse dans un fichier déjà suivi', () => {
    const r = evaluate({ 'a.js': 7, 'b.js': 4 }, base)
    expect(r.errors).toHaveLength(2) // fichier + total
    expect(r.errors[0]).toContain('a.js : 7')
    expect(r.errors[0]).toContain('+1')
  })

  it('refuse un fichier non suivi qui introduit des gestionnaires', () => {
    const r = evaluate({ 'a.js': 6, 'b.js': 4, 'neuf.js': 2 }, base)
    expect(r.errors.some(e => e.includes('neuf.js') && e.includes('non suivi'))).toBe(true)
  })

  it('refuse même une hausse compensée par une baisse ailleurs (le total ne suffit pas)', () => {
    // a.js monte de 1, b.js baisse de 2 : le total baisse, et pourtant la dette
    // d'un écran a augmenté. Le cliquet par fichier doit le refuser.
    const r = evaluate({ 'a.js': 7, 'b.js': 2 }, base)
    expect(r.errors.some(e => e.startsWith('a.js'))).toBe(true)
  })
})

describe('référence versionnée', () => {
  it('contient un total cohérent avec la somme des fichiers', () => {
    const sum = Object.values(BASE.files).reduce((a, b) => a + b, 0)
    expect(BASE.total).toBe(sum)
  })

  it('est conforme à l’état actuel du dépôt', () => {
    const r = evaluate(countByFile(ROOT), BASE)
    expect(r.errors).toEqual([])
    expect(r.total).toBe(BASE.total)
  })
})
