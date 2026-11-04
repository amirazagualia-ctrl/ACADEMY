#!/usr/bin/env node
// Régénère tests/routes.snapshot.txt à partir de src/**/*.ts(x)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RE = /\b(?:app|[a-zA-Z_]+Routes?|router)\.(get|post|put|patch|delete|all)\(\s*'([^']+)'/g
const files = []
const walk = d => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(f)) files.push(p)
  }
}
walk(join(ROOT, 'src'))
const set = new Set()
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(RE)) set.add(`${m[1]} ${m[2]}`)
const out = [...set].sort().join('\n') + '\n'
writeFileSync(join(ROOT, 'tests/routes.snapshot.txt'), out)
console.log(`${set.size} routes écrites dans tests/routes.snapshot.txt`)
