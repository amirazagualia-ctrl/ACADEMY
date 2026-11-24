#!/usr/bin/env node
// F76 — Cliquet anti-régression des gestionnaires d'événements inline.
//
// Problème : un attribut `onclick="fn('${valeur}')"` fait du contenu une chaîne de
// code. Chaque écran converti vers `data-act` retire une surface d'injection ; mais
// sans garde-fou, le prochain écran en rajoute et le compteur repart à la hausse.
//
// Ce cliquet gèle l'état PAR FICHIER. Il échoue si :
//   • un fichier dépasse le nombre de gestionnaires de référence ;
//   • un fichier apparaît avec des gestionnaires alors qu'il n'était pas suivi ;
//   • le total dépasse le budget global.
// Il ne se plaint jamais d'une baisse : c'est tout l'intérêt.
//
//   node scripts/inline-handlers.mjs            → vérifie
//   node scripts/inline-handlers.mjs --update   → abaisse la référence (après conversion)
//   node scripts/inline-handlers.mjs --list     → détail par fichier
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'tests/inline-handlers.baseline.json')

// Sources balayées : scripts front servis tels quels + pages serveur rendues en HTML.
const SCAN = ['public/static', 'src/routes']
// Fichiers volumineux générés (polices, banques de données) : jamais de gestionnaires,
// on les exclut pour ne pas ralentir inutilement.
const SKIP = [/pdf-fonts\.js$/, /situations-data-\d+\.js$/, /exercises-ar-data\.js$/]

// Tout attribut inline. `error`/`load` inclus : ils portent aussi du code exécutable.
const ATTR = /\bon(?:click|change|input|submit|keydown|keypress|keyup|blur|focus|error|load|dblclick|mouseover|mouseout)\s*=\s*["']/g

const walk = d => {
  const out = []
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p).forEach(x => out.push(x))
    else if (/\.(js|ts|tsx)$/.test(f) && !SKIP.some(re => re.test(p))) out.push(p)
  }
  return out
}

export function countByFile(root = ROOT) {
  const files = []
  for (const d of SCAN) {
    try { files.push(...walk(join(root, d))) } catch { /* dossier absent : on ignore */ }
  }
  const counts = {}
  for (const f of files) {
    const n = (readFileSync(f, 'utf8').match(ATTR) || []).length
    if (n > 0) counts[relative(root, f).split('\\').join('/')] = n
  }
  return counts
}

function loadBaseline() {
  try { return JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { return { total: 0, files: {} } }
}

const args = process.argv.slice(2)

// Le module est importable par les tests : le CLI ne s'exécute que si le fichier
// est lancé directement (sinon `process.exit` tuerait le processus Vitest).
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

/** Compare les comptages à la référence. Renvoie { errors, improved, total, base }. */
export function evaluate(counts, base) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const errors = []
  for (const [file, n] of Object.entries(counts)) {
    const allowed = base.files[file]
    if (allowed === undefined) errors.push(`${file} : ${n} gestionnaire(s) inline dans un fichier non suivi (attendu 0)`)
    else if (n > allowed) errors.push(`${file} : ${n} gestionnaire(s) inline, référence ${allowed} (+${n - allowed})`)
  }
  if (base.total !== undefined && total > base.total) {
    errors.push(`total : ${total} gestionnaire(s) inline, budget ${base.total} (+${total - base.total})`)
  }
  const improved = Object.entries(base.files)
    .filter(([f, allowed]) => (counts[f] || 0) < allowed)
    .map(([f, allowed]) => `${f} : ${counts[f] || 0} (référence ${allowed})`)
  return { errors, improved, total, base }
}

if (isMain) main()

function main() {
  const counts = countByFile(ROOT)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  if (args.includes('--update')) {
    const doc = {
      note: 'Référence F76 — ne peut que baisser. Régénérer après conversion avec : npm run lint:inline:update',
      total,
      files: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
    }
    writeFileSync(BASELINE, JSON.stringify(doc, null, 2) + '\n')
    console.log(`✓ référence mise à jour : ${total} gestionnaire(s) inline dans ${Object.keys(counts).length} fichier(s)`)
    process.exit(0)
  }

  const base = loadBaseline()
  const { errors, improved } = evaluate(counts, base)

  if (args.includes('--list')) {
    for (const [f, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      const allowed = base.files[f]
      console.log(`${String(n).padStart(4)}  ${allowed === undefined ? '  ???' : String(allowed).padStart(4)}  ${f}`)
    }
    console.log(`${String(total).padStart(4)}  ${String(base.total).padStart(4)}  TOTAL`)
  }

  if (errors.length) {
    console.error('✗ Cliquet des gestionnaires inline : régression détectée.\n')
    for (const e of errors) console.error('  • ' + e)
    console.error('\n→ Utilisez data-act / data-on (public/static/delegation.js) au lieu d’un attribut on*=().')
    console.error('  Si la baisse est volontaire et déjà mesurée : npm run lint:inline:update')
    process.exit(1)
  }

  const gain = base.total !== undefined ? base.total - total : 0
  console.log(`✓ ${total} gestionnaire(s) inline (budget ${base.total})${gain > 0 ? ` — ${gain} de moins que la référence` : ''}`)
  if (improved.length) {
    console.log('  écrans convertis en dessous de leur référence :')
    for (const i of improved) console.log('    · ' + i)
    console.log('  → figez le progrès : npm run lint:inline:update')
  }
}
