import ts from 'typescript'
import fs from 'node:fs'
const file = 'src/index.tsx'
const src = fs.readFileSync(file, 'utf8')
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
const stmts = []
for (const st of sf.statements) {
  let names = []
  if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) names = [st.name?.text].filter(Boolean)
  else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) names.push(d.name.text); else d.name.forEachChild(function w(n){ if (ts.isIdentifier(n)) names.push(n.text); else n.forEachChild(w) }) }
  const kind = ts.SyntaxKind[st.kind]
  const ids = new Set()
  ;(function walk(n) { if (ts.isIdentifier(n)) ids.add(n.text); n.forEachChild(walk) })(st)
  const route = ts.isExpressionStatement(st) && /^app\.(get|post|put|patch|delete|all|use|route|onError|notFound)\(/.test(st.getText(sf)) ? st.getText(sf).slice(0, 60) : null
  const s = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1
  const e = sf.getLineAndCharacterOfPosition(st.end).line + 1
  stmts.push({ kind, names, start: s, end: e, ids: [...ids], route })
}
const declared = new Set(stmts.flatMap(s => s.names))
for (const s of stmts) s.deps = s.ids.filter(i => declared.has(i) && !s.names.includes(i))
fs.writeFileSync('/tmp/p2/map.json', JSON.stringify({ stmts, declared: [...declared] }, null, 1))
console.log(stmts.length, 'statements ;', declared.size, 'symboles déclarés ;', stmts.filter(s => s.route).length, 'app.* ;', stmts.filter(s=>!s.names.length && !s.route).length, 'autres')
