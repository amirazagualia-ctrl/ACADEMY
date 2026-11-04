// Test de non-régression des routes HTTP : toute route ajoutée/supprimée/renommée
// doit être reflétée dans tests/routes.snapshot.txt (npm run routes:update).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const ROOT = join(HERE, '..')
const RE = /\b(?:app|[a-zA-Z_]+Routes?|router)\.(get|post|put|patch|delete|all)\(\s*'([^']+)'/g

function listTs(dir: string): string[] {
  const out: string[] = []
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) out.push(...listTs(p))
    else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}

export function extractRoutes(): string[] {
  const set = new Set<string>()
  for (const file of listTs(join(ROOT, 'src'))) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(RE)) set.add(`${m[1]} ${m[2]}`)
  }
  return [...set].sort()
}

describe('routes HTTP (snapshot)', () => {
  const current = extractRoutes()
  const snapshot = readFileSync(join(HERE, 'routes.snapshot.txt'), 'utf8').split('\n').map((l: string) => l.trim()).filter(Boolean).sort()

  it('aucune route supprimée ou renommée', () => {
    const missing = snapshot.filter((r: string) => !current.includes(r))
    expect(missing, `Routes manquantes:\n${missing.join('\n')}`).toEqual([])
  })
  it('aucune route ajoutée sans mise à jour du snapshot', () => {
    const added = current.filter(r => !snapshot.includes(r))
    expect(added, `Routes nouvelles (lancer npm run routes:update):\n${added.join('\n')}`).toEqual([])
  })
  it('au moins 150 routes détectées', () => {
    expect(current.length).toBeGreaterThanOrEqual(150)
  })
})
