#!/usr/bin/env node
// Palier 2 — découpage mécanique de src/index.tsx en modules (lib/, routes/, types/)
// piloté par l'AST TypeScript : chaque statement top-level est affecté à un module,
// l'ordre d'enregistrement des routes est préservé, les imports/exports sont calculés.
//   node scripts/refactor-split.mjs            → rapport (dry-run)
//   node scripts/refactor-split.mjs --write    → écrit les fichiers
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const WRITE = process.argv.includes('--write')
const SRC = 'src/index.tsx'
const src = fs.readFileSync(SRC, 'utf8')
const sf = ts.createSourceFile(SRC, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)

// ---------- 1. Affectation des symboles aux modules ----------
const M = {
  bindings: 'types/bindings',
  crypto: 'lib/crypto', utils: 'lib/utils', tenant: 'lib/tenant', supabase: 'lib/supabase', auth: 'lib/auth', brand: 'lib/brand',
  notify: 'lib/notify', notifications: 'lib/notifications',
}
const NAME_TO_MODULE = {}
const assign = (mod, names) => names.forEach(n => (NAME_TO_MODULE[n] = mod))
assign(M.bindings, ['Bindings'])
assign(M.crypto, ['sha256Hex', 'PBKDF2_ITER', 'toHex', 'fromHex', 'pbkdf2Hex', 'hashPassword', 'legacyHash', 'safeEqual', 'verifyPassword', 'b64', 'unb64', 'b64url', 'sha256Bytes', 'docCode', 'CODE_CHARS'])
assign(M.utils, ['clientIp', 'slugOk', 'parseCookie', 'escapeHtml', 'normPhone', 'nextYearLabel', 'LEVEL_ORDER', 'nextLevel', 'cycleOf', 'MONTH_LABELS_FR', '_rlStore', 'rateLimit', 'publicOrigin', 'frDate'])
assign(M.tenant, ['TenantCfg', 'DEFAULT_TENANT', 'tenantCtx', 'currentTenant', 'tenantSlug', '_tcaches', 'tcache', 'tcacheReset', 'TC_DEFAULTS', 'TC', 'tenantAesKey', 'encryptSecret', 'decryptSecret', 'masterFetch', '_tenantsSupported', 'tenantsSupported', 'defaultTenant', '_tenantCache', 'loadTenant', 'tenantInvalidate', 'requestedTenantSlug', 'resolveTenant', 'cfg'])
assign(M.supabase, ['yearCtx', 'activeYear', 'sb', 'YEAR_TABLES', 'yearSupported', 'currentYear', 'requestedYear', 'SOFT_DELETE_TABLES', 'TRASH_RETENTION_DAYS', 'softDeleteSupported', 'getSettings'])
assign(M.auth, ['upgradeHashIfNeeded', 'LOGIN_MAX', 'LOGIN_WINDOW_MIN', 'loginBlocked', 'recordLoginFailure', 'clearLoginFailures', 'audit', 'getUser', 'linkedIds', 'getTeacherId', 'teacherAssignedIds', 'teacherSubjectsSupported', 'teacherScope', 'inScopeSubject', 'inScopeStudent', 'superAdmin'])
assign(M.brand, ['BRAND_DEFAULTS', 'LevelDef', 'CycleDef', 'LevelScheme', 'LEVEL_PRESETS', 'TYPE_PRESET', 'normalizeScheme', 'schemeFor', 'Brand', 'brandDeepMerge', 'getBrand', 'brandInvalidate', 'BRAND_TYPES'])
assign(M.notify, ['sendEmail', 'sendSMS', '_health', 'HEALTH_ALERT_EVERY_MS', 'healthReport', 'adminTelegramChats', 'refreshAdminChatsCache', 'healthNotify', 'getTelegramChats', 'sendTelegram'])
assign(M.notifications, ['receiptToken', 'studentCode', 'parseStudentCode', 'sendReceiptTelegram', 'notifyParent', 'AUDIENCE', 'TARGETED_TYPES', 'targetedSupported', 'broadcastTargeted', 'notifyNewContent', 'userLevels', 'targetedFilter', 'buildFeed'])
// helpers de domaine → module de routes
assign('routes/auth', ['googleRedirectUri'])
assign('routes/tenants', ['TENANT_PUBLIC_COLS', 'probeTenantDb', 'dbUrlOwner'])
assign('routes/admin', ['rowLabel', 'BACKUP_TABLES', 'BACKUP_SENSITIVE', 'buildBackup'])
assign('routes/db', ['TABLES', 'WRITE_ADMIN_TEACHER', 'STUDENT_SCOPED'])
assign('routes/fees', ['generateMonthlyFees', 'sweepOverdueFees', 'dailyFeesMaintenance'])
assign('routes/exams', ['EXAM_REMINDER_OFFSETS', 'sendExamReminders', 'dailyExamReminders'])
assign('routes/school-years', ['rollbackInfo'])
assign('routes/telegram', ['normalizeChannel'])
assign('routes/observability', ['monWindow'])
assign('routes/chat', ['isChatStaff', 'fromParent'])
assign('routes/homeworks', ['hwSupported', 'HW_SEL', 'hwScope', 'hwNotifyPublish', 'dailyHomeworkReminders'])
assign('routes/documents', ['docRegSupported', 'WM_LOGO_URLS', 'wmLogoBytes', 'watermarkPdfServer'])
assign('routes/payments', ['konnectBase', 'payEnabled', 'paySupported', 'payVerify'])
assign('routes/ai', ['LlmEngine', 'aiEngines', 'LlmResult', 'llmChat', 'AI_DAILY_LIMIT', 'aiUsageToday', 'aiBump', 'AI_TOKEN_COST', 'AI_FREE_TOKENS', 'aiWallet', 'aiCharge', 'TUTOR_MAX_TURNS'])
assign('routes/evaluations', ['evaSupported', 'EVA_SEL', 'EVA_AUTO_TYPES', 'evaNorm', 'evaAutoCorrect', 'evaScopeCheck', 'EVA_TYPE_SCHEMAS'])
assign('routes/bank', ['bankSupported', 'BANK_SEL', 'pickBank'])
assign('routes/curriculum', ['curContext', 'curSupported', 'CUR_TABLES', 'curLang', 'curName', 'curMemory', 'curRows', 'curUpsert', 'curAutoMapSubjects', 'curImport'])
assign('routes/imports', ['IMPORT_LEVELS', 'normLevel', 'normDate'])
assign('routes/certificates', ['certSupported', 'CERT_LEVELS', 'CERT_TYPES', 'certBody', 'certToken'])
assign('routes/reports', ['currentTrimester', 'sigSupported', 'bulletinFingerprintSource'])
assign('routes/pages', ['mainPageFor', 'brandedPage'])

// routes (méthode + chemin) → module ; première règle qui matche
const ROUTE_RULES = [
  [/^\/api\/notifications\//, 'routes/notifications'],
  [/^\/api\/(notify|interactive\/notify)$/, 'routes/notifications'],
  [/^\/api\/auth\//, 'routes/auth'], [/^\/api\/profile$/, 'routes/auth'],
  [/^\/api\/(brand|admin\/brand)$/, 'routes/brand'], [/^\/manifest\.json$/, 'routes/brand'],
  [/^\/api\/tenants/, 'routes/tenants'],
  [/^\/api\/public\/(stats|students)$/, 'routes/students'], [/^\/api\/students\//, 'routes/students'], [/^\/api\/teachers\//, 'routes/students'], [/^\/api\/link-student$/, 'routes/students'],
  [/^\/api\/registrations\//, 'routes/students'],
  [/^\/api\/admin\/(users|audit|trash|backup)/, 'routes/admin'],
  [/^\/api\/db\//, 'routes/db'],
  [/^\/api\/fees\//, 'routes/fees'],
  [/^\/api\/exams\//, 'routes/exams'],
  [/^\/api\/school-years/, 'routes/school-years'],
  [/^\/api\/telegram\//, 'routes/telegram'], [/^\/api\/admin\/health\/test-alert$/, 'routes/telegram'],
  [/^\/api\/admin\/(metrics|observability)/, 'routes/observability'],
  [/^\/api\/chat\//, 'routes/chat'],
  [/^\/api\/homeworks/, 'routes/homeworks'],
  [/^\/api\/upload\//, 'routes/documents'], [/^\/api\/public\/verify\/:code$/, 'routes/documents'], [/^\/api\/admin\/documents/, 'routes/documents'],
  [/^\/api\/(dashboard\/todo|stats|bulletin\/:studentId|alerts\/students|progress\/:studentId|bulletin\/:studentId\/sign|bulletin-signatures.*)$/, 'routes/reports'],
  [/^\/api\/payments/, 'routes/payments'],
  [/^\/api\/(situations|math6)\/progress$/, 'routes/progress'],
  [/^\/api\/ai\//, 'routes/ai'], [/^\/api\/admin\/ai-wallets/, 'routes/ai'],
  [/^\/api\/evaluations/, 'routes/evaluations'], [/^\/api\/colleagues$/, 'routes/evaluations'],
  [/^\/api\/(chapters|bank)/, 'routes/bank'],
  [/^\/api\/curriculum/, 'routes/curriculum'],
  [/^\/api\/admin\/import\//, 'routes/imports'],
  [/^\/api\/certificates/, 'routes/certificates'], [/^\/api\/public\/verify\/:number$/, 'routes/certificates'],
  [/^\/api\/public\/receipt\//, 'routes/pages'],
  [/^\/(|e\/:slug|inscription|aide|verifier\/:code\?|quittance\/:id|paiement\/retour|verifier\/:number)$/, 'routes/pages'],
]
// Ordre de montage des sous-apps dans index.tsx (= ordre de première apparition dans le fichier d'origine)
// Les paires qui se recouvrent (/api/public/verify/:code avant :number ; /verifier/:code? avant :number) sont ainsi conservées.

// ---------- 2. Analyse des statements ----------
const EXTERNAL = {
  Hono: 'hono', cors: 'hono/cors', serveStatic: 'hono/cloudflare-workers', sign: 'hono/jwt', verify: 'hono/jwt', AsyncLocalStorage: 'node:async_hooks',
  CURRICULUM_SEED: '@/curriculum-seed', INSTALL_SQL: '@/install-sql',
  monitoringMiddleware: '@/monitoring', getMetricsManager: '@/monitoring', getAlertManager: '@/monitoring', getSentry: '@/monitoring', createRouteLogger: '@/monitoring',
  MONITORING_CONFIG: '@/monitoring', DEFAULT_RULES: '@/monitoring', calculateP95: '@/monitoring', calculateErrorRate: '@/monitoring', KVLike: '@/monitoring',
}
const EXTERNAL_TYPES = new Set(['KVLike'])

const stmts = []
for (const st of sf.statements) {
  const names = []
  let isType = false
  if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) names.push(st.name.text)
  else if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) { names.push(st.name.text); isType = true }
  else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) names.push(d.name.text) }
  const ids = new Set()
  ;(function walk(n) {
    if (ts.isIdentifier(n)) {
      const p = n.parent
      const isPropName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isPropertySignature(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n)
      if (!isPropName) ids.add(n.text)
    }
    n.forEachChild(walk)
  })(st)
  const text = src.slice(st.getFullStart(), st.end)
  let route = null
  if (ts.isExpressionStatement(st)) {
    const m = /^app\.(get|post|put|patch|delete|all|use)\(\s*(?:'([^']+)')?/.exec(st.getText(sf))
    if (m) route = { method: m[1], path: m[2] || '*' }
  }
  const isImport = ts.isImportDeclaration(st)
  const isExportDefault = ts.isExportAssignment(st)
  const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1
  stmts.push({ names, isType, ids: [...ids], text, route, isImport, isExportDefault, line })
}

// ---------- 3. Affectation ----------
let prevModule = 'index'
for (const s of stmts) {
  let mod = null
  if (s.isImport || s.isExportDefault) mod = 'index'
  else if (s.names.length) {
    if (s.names.includes('app')) mod = 'index'
    else { mod = NAME_TO_MODULE[s.names[0]]; if (!mod) throw new Error(`Symbole non affecté : ${s.names[0]} (ligne ${s.line})`) }
  } else if (s.route) {
    if (s.route.method === 'use' || s.route.path === '/api/health') mod = 'index'
    else { const rule = ROUTE_RULES.find(([re]) => re.test(s.route.path)); if (!rule) throw new Error(`Route non affectée : ${s.route.method} ${s.route.path} (ligne ${s.line})`); mod = rule[1] }
  } else mod = prevModule // ex. boucle for après LEVEL_PRESETS
  s.module = mod; prevModule = mod
}

const declaredIn = {}
for (const s of stmts) for (const n of s.names) declaredIn[n] = s.module
const typeNames = new Set(stmts.filter(s => s.isType).flatMap(s => s.names))
const modules = {}
for (const s of stmts) (modules[s.module] ||= []).push(s)
const mountOrder = []
for (const s of stmts) if (s.route && s.module !== 'index' && !mountOrder.includes(s.module)) mountOrder.push(s.module)

// ---------- 4. Dépendances ----------
const deps = {}
for (const [mod, list] of Object.entries(modules)) {
  const own = new Set(list.flatMap(s => s.names))
  const need = {}
  const ext = {}
  for (const s of list) for (const id of s.ids) {
    if (own.has(id) || id === 'app') continue // `app` : sous-app locale dans chaque module de routes
    if (declaredIn[id] && declaredIn[id] !== mod) (need[declaredIn[id]] ||= new Set()).add(id)
    else if (EXTERNAL[id]) (ext[EXTERNAL[id]] ||= new Set()).add(id)
  }
  deps[mod] = { need, ext }
}
// violations : lib → routes
const problems = []
for (const [mod, d] of Object.entries(deps)) if (mod.startsWith('lib/') || mod.startsWith('types/')) for (const to of Object.keys(d.need)) if (to.startsWith('routes/') || to === 'index') problems.push(`${mod} dépend de ${to} : ${[...d.need[to]].join(', ')}`)
// cycles entre modules de routes
const routeCycles = []
for (const [mod, d] of Object.entries(deps)) for (const to of Object.keys(d.need)) if (mod.startsWith('routes/') && to.startsWith('routes/') && deps[to]?.need[mod]) routeCycles.push(`${mod} <-> ${to}`)

console.log(`${stmts.length} statements → ${Object.keys(modules).length} modules`)
for (const [mod, list] of Object.entries(modules)) {
  const d = deps[mod]
  console.log(`\n[${mod}] ${list.length} statements, ${list.filter(s => s.route).length} routes, ${list.reduce((a, s) => a + s.text.split('\n').length, 0)} lignes`)
  for (const [to, ids] of Object.entries(d.need)) console.log(`   ← ${to}: ${[...ids].join(', ')}`)
}
console.log('\nOrdre de montage :', mountOrder.join(' → '))
if (problems.length) { console.log('\n⚠ VIOLATIONS lib→routes :\n  ' + problems.join('\n  ')) }
if (routeCycles.length) console.log('\nℹ cycles routes↔routes (sûrs à l\'exécution, fonctions appelées à la requête) :\n  ' + [...new Set(routeCycles.map(c => c.split(' <-> ').sort().join(' <-> ')))].join('\n  '))
if (!WRITE) { console.log('\n(dry-run — relancer avec --write)'); process.exit(problems.length ? 1 : 0) }
if (problems.length) process.exit(1)

// ---------- 5. Écriture ----------
const rel = (from, to) => { let p = path.posix.relative(path.posix.dirname(from), to); if (!p.startsWith('.')) p = './' + p; return p }
function importsFor(mod) {
  const d = deps[mod]; const lines = []
  const file = mod === 'index' ? 'index' : mod
  for (const [spec, ids] of Object.entries(d.ext)) {
    const vals = [...ids].filter(i => !EXTERNAL_TYPES.has(i)); const tys = [...ids].filter(i => EXTERNAL_TYPES.has(i))
    const s = spec.startsWith('@/') ? rel(file, spec.slice(2)) : spec
    if (vals.length) lines.push(`import { ${vals.sort().join(', ')} } from '${s}'`)
    if (tys.length) lines.push(`import type { ${tys.sort().join(', ')} } from '${s}'`)
  }
  for (const [to, ids] of Object.entries(d.need).sort()) {
    const vals = [...ids].filter(i => !typeNames.has(i)).sort(); const tys = [...ids].filter(i => typeNames.has(i)).sort()
    if (vals.length) lines.push(`import { ${vals.join(', ')} } from '${rel(file, to)}'`)
    if (tys.length) lines.push(`import type { ${tys.join(', ')} } from '${rel(file, to)}'`)
  }
  return lines
}
// symboles à exporter = utilisés par un autre module
const exported = new Set()
for (const d of Object.values(deps)) for (const ids of Object.values(d.need)) for (const i of ids) exported.add(i)
function withExport(s) {
  if (!s.names.length || !s.names.some(n => exported.has(n))) return s.text
  // insérer `export ` devant le mot-clé de déclaration (après le trivia)
  return s.text.replace(/^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\s)*)(async function|function|const|let|class|type|interface)\b/, (m, lead, kw) => `${lead}export ${kw}`)
}
const HEADER = (title) => `// ${title}\n// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.\n`
const TITLES = {
  'types/bindings': 'Variables d\'environnement / secrets Cloudflare (type Bindings)',
  'lib/crypto': 'Primitives crypto (hash mots de passe PBKDF2, SHA-256, base64, codes documents)',
  'lib/utils': 'Utilitaires génériques (IP, cookies, échappement HTML, niveaux, limiteur mémoire, origine publique)',
  'lib/tenant': 'Multi-établissement F63 : contexte tenant (AsyncLocalStorage), caches par tenant, chiffrement des secrets, résolution',
  'lib/supabase': 'Accès PostgREST Supabase (sb), année scolaire active, corbeille, paramètres',
  'lib/auth': 'Authentification JWT, verrouillage login, audit, périmètre enseignant, super-admin',
  'lib/brand': 'Identité visuelle / schéma de niveaux de l\'établissement',
  'lib/notify': 'Canaux de notification (e-mail, SMS, Telegram) et santé de la base',
  'lib/notifications': 'Notifications parents : codes élèves, reçus, ciblage, fil personnel',
}
const files = {}
for (const [mod, list] of Object.entries(modules)) {
  if (mod === 'index') continue
  const isRoutes = mod.startsWith('routes/')
  const body = list.map(withExport).join('')
  const imports = importsFor(mod)
  if (isRoutes && !imports.some(l => /\bHono\b/.test(l))) imports.unshift(`import { Hono } from 'hono'`)
  if (isRoutes && !/\bBindings\b/.test(imports.join('\n'))) imports.push(`import type { Bindings } from '../types/bindings'`)
  const title = TITLES[mod] || `Routes ${mod.replace('routes/', '')}`
  let out = HEADER(title) + imports.join('\n') + (imports.length ? '\n' : '')
  if (isRoutes) out += `\nconst app = new Hono<{ Bindings: Bindings }>()\n`
  out += body.replace(/^\n+/, '\n') + '\n'
  if (isRoutes) out += `\nexport default app\n`
  files[`src/${mod}.ts`] = out
}
// index.tsx
const idx = modules.index
const idxImports = importsFor('index')
const mountImports = mountOrder.map(m => `import ${m.replace('routes/', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Routes from './${m}'`)
const idxBody = idx.filter(s => !s.isImport && !s.isExportDefault).map(s => s.text).join('')
const mounts = mountOrder.map(m => `app.route('/', ${m.replace('routes/', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Routes)`).join('\n')
files[SRC] = `// Rahma Academy — point d'entrée Hono (Palier 2 : index allégé, domaines dans src/routes/*, helpers dans src/lib/*)
// L'ordre de montage des sous-apps reproduit l'ordre d'enregistrement d'origine (routes qui se recouvrent).
${idxImports.join('\n')}
${mountImports.join('\n')}
${idxBody.replace(/^\n+/, '\n')}

// ---- Montage des domaines (ordre significatif) ----
${mounts}

export default app
`
for (const [f, content] of Object.entries(files)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content) }
console.log(`\n✓ ${Object.keys(files).length} fichiers écrits :\n  ` + Object.entries(files).map(([f, c]) => `${f} (${c.split('\n').length} l.)`).join('\n  '))
