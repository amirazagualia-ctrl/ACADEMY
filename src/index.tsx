import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { sign, verify } from 'hono/jwt'
import { AsyncLocalStorage } from 'node:async_hooks'

type Bindings = {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_KEY?: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
  TWILIO_SID?: string
  TWILIO_TOKEN?: string
  TWILIO_FROM?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_ADMIN_CHAT_ID?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

// SÉCURITÉ : aucun secret dans le code. Tout vient des variables d'environnement
// (.dev.vars en local, secrets Cloudflare en production). Voir .dev.vars.example.
const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// Garde-fou : refuser de servir l'API si la configuration est incomplète
// Santé du service (public, sans données sensibles) : utilisable par un moniteur externe (UptimeRobot, cron-job.org…)
app.get('/api/health', async (c) => {
  const t0 = Date.now()
  const env = c.env
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'].filter(k => !(env as any)?.[k])
  let db: 'ok' | 'down' | 'unconfigured' = 'unconfigured'; let dbMs = 0; let dbError = ''
  if (!missing.length) {
    const t = Date.now()
    try {
      const { url, key } = cfg(env)
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(`${url}/rest/v1/settings?select=key&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctrl.signal })
      clearTimeout(to)
      dbMs = Date.now() - t
      if (res.ok) { db = 'ok'; healthReport(env, true) } else { db = 'down'; dbError = `HTTP ${res.status}`; healthReport(env, false, dbError) }
    } catch (e: any) { dbMs = Date.now() - t; db = 'down'; dbError = e?.name === 'AbortError' ? 'timeout 8s' : (e?.message || 'fetch failed'); healthReport(env, false, dbError) }
    if (db === 'ok' && (!_adminChatsCache || Date.now() - _adminChatsCache.at > 3600_000)) refreshAdminChatsCache(env).catch(() => {})
  }
  const status = db === 'ok' ? 'ok' : 'degraded'
  return c.json({
    status, time: new Date().toISOString(), db, db_latency_ms: dbMs, db_error: dbError || undefined,
    config_missing: missing.length ? missing : undefined,
    telegram_alerts: !!env.TELEGRAM_BOT_TOKEN,
    incident: _health.down ? { since: new Date(_health.since).toISOString(), failures: _health.failures, last_error: _health.lastError } : null,
    total_ms: Date.now() - t0
  }, db === 'ok' ? 200 : 503)
})

app.use('/api/*', async (c, next) => {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'].filter(k => !(c.env as any)?.[k])
  if (missing.length) return c.json({ error: `Configuration serveur incomplète : variables manquantes ${missing.join(', ')}. Définissez-les dans .dev.vars (local) ou via les secrets Cloudflare (production).` }, 503)
  // Année scolaire active pour cette requête (X-School-Year pour consulter une année passée, sinon l'année courante)
  // Contexte isolé par requête (AsyncLocalStorage) : sûr même si plusieurs requêtes s'entrelacent dans le Worker.
  let year: string | null = null
  try { const cy = await currentYear(c.env); if (cy) year = requestedYear(c) || cy } catch {}
  await yearCtx.run(year, () => next())
})
const yearCtx = new AsyncLocalStorage<string | null>()
const activeYear = () => yearCtx.getStore() || null

// ---------- Helpers ----------
function cfg(env: Bindings) {
  return { url: env.SUPABASE_URL!, key: env.SUPABASE_SERVICE_KEY!, jwt: env.JWT_SECRET! }
}

// IP du client (Cloudflare) pour rate-limiting / audit
function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || (c.req.header('X-Forwarded-For') || '').split(',')[0].trim() || 'unknown'
}

async function sb(env: Bindings, path: string, options: RequestInit = {}) {
  const { url, key } = cfg(env)
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(options.headers as Record<string, string> || {})
  }
  // Soft-delete global : toute LECTURE d'une table concernée exclut les lignes supprimées,
  // sauf si la requête mentionne déjà deleted_at (corbeille, purge) ou si la migration n'est pas appliquée.
  const method = (options.method || 'GET').toUpperCase()
  const tbl = path.split('?')[0]
  if (method === 'GET' && _softDeleteSupported === true && SOFT_DELETE_TABLES.includes(tbl) && !path.includes('deleted_at')) {
    path += (path.includes('?') ? '&' : '?') + 'deleted_at=is.null'
  }
  // Année scolaire globale : les requêtes internes (stats, bulletins, mensualités, relances) portent sur l'année
  // active (contexte par requête) ; les lectures par id précis ne sont pas filtrées ; les insertions sont tamponnées avec l'année courante.
  const ay = activeYear()
  if (ay && YEAR_TABLES.includes(tbl) && !path.includes('school_year')) {
    if (method === 'GET' && !/[?&]id=eq\./.test(path)) path += (path.includes('?') ? '&' : '?') + `school_year=eq.${ay}`
    else if (method === 'POST' && options.body && typeof options.body === 'string' && _currentYearCache?.label) {
      try { const b = JSON.parse(options.body); const stamp = (o: any) => { if (o && typeof o === 'object' && !o.school_year) o.school_year = _currentYearCache!.label }; Array.isArray(b) ? b.forEach(stamp) : stamp(b); options = { ...options, body: JSON.stringify(b) } } catch {}
    }
  }
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...options, headers })
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (res.status >= 500 || res.status === 540 || res.status === 402) healthReport(env, false, `HTTP ${res.status} sur ${tbl}`)
    else healthReport(env, true)
    return { ok: res.ok, status: res.status, data }
  } catch (e: any) {
    healthReport(env, false, e?.message || 'fetch failed')
    return { ok: false, status: 503, data: { error: 'Base de données Supabase inaccessible. Le projet Supabase est probablement en pause — restaurez-le sur supabase.com/dashboard puis exécutez schema.sql.', detail: e.message } }
  }
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
// ---------- Mots de passe : PBKDF2-SHA256 (100 000 itérations, sel aléatoire 16 octets) ----------
// Format stocké : pbkdf2$<iterations>$<sel_hex>$<hash_hex>. Les anciens hash SHA-256 (sel fixe) sont
// encore vérifiés et migrés de façon transparente à la prochaine connexion réussie.
const PBKDF2_ITER = 100000
const toHex = (buf: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(buf as ArrayBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) => new Uint8Array((h.match(/.{1,2}/g) || []).map(x => parseInt(x, 16)))
async function pbkdf2Hex(password: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256)
  return toHex(bits)
}
async function hashPassword(p: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${await pbkdf2Hex(p, salt, PBKDF2_ITER)}`
}
const legacyHash = (p: string) => sha256Hex('edusalt::' + p)
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
// Vérifie un mot de passe ; retourne { ok, needsUpgrade } (needsUpgrade = ancien format à migrer)
async function verifyPassword(p: string, stored: string): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false }
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, hash] = stored.split('$')
    const h = await pbkdf2Hex(p, fromHex(salt), Number(iter) || PBKDF2_ITER)
    return { ok: safeEqual(h, hash), needsUpgrade: Number(iter) < PBKDF2_ITER }
  }
  const ok = safeEqual(await legacyHash(p), stored)
  return { ok, needsUpgrade: ok }
}
// Migration transparente du hash après connexion réussie
async function upgradeHashIfNeeded(env: Bindings, userId: number, password: string, res: { ok: boolean; needsUpgrade: boolean }) {
  if (res.ok && res.needsUpgrade) {
    try { await sb(env, `user_accounts?id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ password_hash: await hashPassword(password) }) }) } catch (e) { /* non bloquant */ }
  }
}

// ---------- Rate-limiting connexion : 5 échecs / 15 min par email ou par IP ----------
const LOGIN_MAX = 5
const LOGIN_WINDOW_MIN = 15
async function loginBlocked(env: Bindings, email: string, ip: string): Promise<number> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60000).toISOString()
  const r = await sb(env, `login_attempts?select=created_at&or=(email.eq.${encodeURIComponent(email)},ip.eq.${encodeURIComponent(ip)})&created_at=gte.${since}&order=created_at.desc&limit=${LOGIN_MAX}`)
  if (!r.ok) return 0 // table absente (migration 0007 non appliquée) -> pas de blocage
  const rows = r.data || []
  if (rows.length < LOGIN_MAX) return 0
  const oldest = new Date(rows[rows.length - 1].created_at).getTime()
  return Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MIN * 60000 - Date.now()) / 60000))
}
async function recordLoginFailure(env: Bindings, email: string, ip: string) {
  try { await sb(env, 'login_attempts', { method: 'POST', body: JSON.stringify({ email, ip }), headers: { Prefer: 'return=minimal' } }) } catch (e) {}
}
async function clearLoginFailures(env: Bindings, email: string) {
  try { await sb(env, `login_attempts?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }) } catch (e) {}
}

// ---------- Journal d'audit ----------
async function audit(env: Bindings, c: any, user: any, action: string, table: string, recordId: any, before: any, after: any) {
  try {
    const strip = (o: any) => { if (!o || typeof o !== 'object') return o; const x = { ...o }; delete x.password_hash; return x }
    await sb(env, 'audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      user_id: user?.id || null, user_email: user?.email || null, user_role: user?.role || null,
      action, table_name: table, record_id: recordId != null ? String(recordId) : null,
      before: strip(before) ?? null, after: strip(after) ?? null, ip: clientIp(c)
    }) })
  } catch (e) { /* jamais bloquant */ }
}

// ---------- Année scolaire ----------
// Tables portées par une année scolaire ; les lectures sont filtrées sur l'année sélectionnée (header X-School-Year)
// ou l'année courante ; les écritures reçoivent automatiquement l'année courante.
const YEAR_TABLES = ['grades', 'attendance', 'fees', 'events', 'registrations', 'homeworks', 'bulletin_signatures']
let _yearSupported: { ok: boolean; at: number } | null = null
let _currentYearCache: { label: string; at: number } | null = null
async function yearSupported(env: Bindings): Promise<boolean> {
  // Cache 5 min : la migration 0009 est prise en compte sans redéploiement
  if (_yearSupported && (Date.now() - _yearSupported.at < 300000 || _yearSupported.ok)) return _yearSupported.ok
  const probe = await sb(env, 'school_years?select=id&limit=1')
  _yearSupported = { ok: probe.ok, at: Date.now() }
  return probe.ok
}
async function currentYear(env: Bindings): Promise<string | null> {
  if (!(await yearSupported(env))) return null
  if (_currentYearCache && Date.now() - _currentYearCache.at < 60000) return _currentYearCache.label
  const r = await sb(env, 'school_years?is_current=eq.true&select=label&limit=1')
  const label = r.data?.[0]?.label || null
  if (label) _currentYearCache = { label, at: Date.now() }
  return label
}
// Année demandée par le client (consultation d'une année passée) ; format strict AAAA-AAAA
function requestedYear(c: any): string | null {
  const y = c.req.header('X-School-Year') || c.req.query('school_year') || ''
  return /^\d{4}-\d{4}$/.test(y) ? y : null
}
// Libellé de l'année suivante : 2025-2026 -> 2026-2027
function nextYearLabel(label: string) { const [a, b] = label.split('-').map(Number); return `${a + 1}-${b + 1}` }
// Niveau suivant (promotion) ; null = sortant (fin 4AS)
const LEVEL_ORDER = ['1AP', '2AP', '3AP', '4AP', '5AP', '6AP', '7AB', '8AB', '9AB', '1AS', '2AS', '3AS', '4AS']
function nextLevel(l: string): string | null { const i = LEVEL_ORDER.indexOf(l); return i < 0 ? l : (i === LEVEL_ORDER.length - 1 ? null : LEVEL_ORDER[i + 1]) }
function cycleOf(l: string) { return l.endsWith('AP') ? 'primaire' : l.endsWith('AB') ? 'base' : 'secondaire' }

// ---------- Soft-delete : tables concernées + filtre de lecture ----------
const SOFT_DELETE_TABLES = ['students', 'teachers', 'grades', 'fees', 'courses', 'interactive_courses', 'events', 'classes', 'homeworks', 'certificates']
const TRASH_RETENTION_DAYS = 30
let _softDeleteSupported: boolean | null = null
let _softDeleteCheckedAt = 0
async function softDeleteSupported(env: Bindings): Promise<boolean> {
  if (_softDeleteSupported === true || (_softDeleteSupported === false && Date.now() - _softDeleteCheckedAt < 300000)) return _softDeleteSupported
  const probe = await sb(env, 'students?select=deleted_at&limit=1')
  _softDeleteSupported = probe.ok; _softDeleteCheckedAt = Date.now()
  return probe.ok
}

async function getUser(c: any): Promise<any | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try { return await verify(auth.slice(7), cfg(c.env).jwt, 'HS256') } catch { return null }
}

function linkedIds(user: any): number[] {
  const ids: number[] = []
  if (user?.linked_student_id) ids.push(Number(user.linked_student_id))
  if (Array.isArray(user?.linked_student_ids)) user.linked_student_ids.forEach((i: any) => { const n = Number(i); if (n && !ids.includes(n)) ids.push(n) })
  return ids
}

// ---------- Enseignants : fiche liée + élèves affectés ----------
// Retrouve la fiche enseignant (teachers.id) du compte connecté : via linked_teacher_id, sinon par email (auto-liaison)
async function getTeacherId(env: Bindings, user: any): Promise<number | null> {
  const acc = await sb(env, `user_accounts?id=eq.${user.id}&select=*`)
  const a = acc.data?.[0]
  if (a?.linked_teacher_id) return Number(a.linked_teacher_id)
  const email = a?.email || user.email
  if (!email) return null
  const t = await sb(env, `teachers?email=eq.${encodeURIComponent(email)}&select=id`)
  const tid = t.data?.[0]?.id
  if (tid) { try { await sb(env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ linked_teacher_id: tid }) }) } catch (e) {} }
  return tid ? Number(tid) : null
}

// IDs des élèves affectés à l'enseignant connecté.
// Retourne null si la table teacher_students n'existe pas encore (migration 0003 non appliquée -> pas de filtrage),
// [] si aucun élève affecté (l'enseignant ne voit rien).
async function teacherAssignedIds(env: Bindings, user: any): Promise<number[] | null> {
  const tid = await getTeacherId(env, user)
  const probe = await sb(env, `teacher_students?select=student_id&limit=1`)
  if (!probe.ok) return null // table absente => comportement historique (pas de filtrage)
  if (!tid) return []
  const r = await sb(env, `teacher_students?teacher_id=eq.${tid}&select=student_id`)
  if (!r.ok) return null
  return (r.data || []).map((x: any) => Number(x.student_id))
}

// ---------- Notifications (email / SMS) ----------
async function getSettings(env: Bindings, key: string): Promise<any> {
  const r = await sb(env, `settings?key=eq.${key}&select=value`)
  return (r.ok && r.data?.[0]?.value) || {}
}

async function sendEmail(env: Bindings, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY || !to) return { sent: false, reason: 'no_api_key_or_recipient' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Rahma Academy <onboarding@resend.dev>', to: [to], subject, html })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

async function sendSMS(env: Bindings, to: string, body: string) {
  if (!env.TWILIO_SID || !env.TWILIO_TOKEN || !env.TWILIO_FROM || !to) return { sent: false, reason: 'twilio_not_configured' }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

// ---------- Monitoring : état Supabase + alerte Telegram admin ----------
// État en mémoire du Worker (par isolat) : suffisant pour dédoublonner les alertes ; 1 alerte / 6 h max, message de rétablissement.
const _health = { down: false, since: 0, lastAlert: 0, lastError: '', lastOkAt: 0, failures: 0 }
const HEALTH_ALERT_EVERY_MS = 6 * 60 * 60 * 1000
function healthReport(env: Bindings, ok: boolean, err?: string) {
  const now = Date.now()
  if (ok) {
    _health.lastOkAt = now; _health.failures = 0
    if (_health.down) {
      const mins = Math.round((now - _health.since) / 60000)
      _health.down = false
      healthNotify(env, `✅ <b>Rahma Academy — base de données rétablie</b>\nSupabase répond de nouveau (indisponibilité ≈ ${mins} min).`).catch(() => {})
    }
    return
  }
  _health.failures++; _health.lastError = String(err || '').slice(0, 200)
  if (!_health.down) { _health.down = true; _health.since = now }
  if (now - _health.lastAlert > HEALTH_ALERT_EVERY_MS) {
    _health.lastAlert = now
    healthNotify(env, `🚨 <b>Rahma Academy — base de données inaccessible</b>\nErreur : <code>${escapeHtml(_health.lastError)}</code>\n\nLe projet Supabase est probablement <b>en pause</b> (plan gratuit). Ouvrez supabase.com/dashboard et cliquez sur « Restore project ».\n\nUne nouvelle alerte sera envoyée au plus tôt dans 6 h si le problème persiste.`).catch(() => {})
  }
}
function escapeHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
// Destinataires : chat_id admin explicite (TELEGRAM_ADMIN_CHAT_ID) ou chats Telegram des numéros des comptes admin.
// Ne passe PAS par sb() pour ne pas boucler quand la base est en panne : utilise le cache des chats admin.
let _adminChatsCache: { at: number; ids: string[] } | null = null
async function adminTelegramChats(env: Bindings): Promise<string[]> {
  const ids = new Set<string>()
  if ((env as any).TELEGRAM_ADMIN_CHAT_ID) String((env as any).TELEGRAM_ADMIN_CHAT_ID).split(',').map(x => x.trim()).filter(Boolean).forEach(x => ids.add(x))
  if (_adminChatsCache && Date.now() - _adminChatsCache.at < 3600_000) _adminChatsCache.ids.forEach(x => ids.add(x))
  return [...ids]
}
async function refreshAdminChatsCache(env: Bindings) {
  try {
    const admins = await sb(env, `user_accounts?role=eq.admin&status=eq.active&select=phone`)
    const chats = await getTelegramChats(env)
    const ids = (admins.data || []).map((a: any) => chats[normPhone(a.phone)]).filter(Boolean)
    _adminChatsCache = { at: Date.now(), ids }
  } catch {}
}
async function healthNotify(env: Bindings, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return
  const chats = await adminTelegramChats(env)
  for (const chat_id of chats) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' })
    }).catch(() => {})
  }
}

// ---------- Telegram (alternative SMS gratuite) ----------
function normPhone(p: string) { return (p || '').replace(/[^0-9]/g, '').slice(-8) } // 8 derniers chiffres (numéro tunisien)

async function getTelegramChats(env: Bindings): Promise<Record<string, string>> {
  const r = await sb(env, `settings?key=eq.telegram_chats&select=value`)
  return r.data?.[0]?.value || {}
}

async function sendTelegram(env: Bindings, parentPhone: string, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !parentPhone) return { sent: false, reason: 'telegram_not_configured' }
  const chats = await getTelegramChats(env)
  const chatId = chats[normPhone(parentPhone)]
  if (!chatId) return { sent: false, reason: 'parent_not_linked' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

// ---------- Quittance : lien sécurisé + envoi Telegram ----------
async function receiptToken(env: Bindings, id: string | number) {
  return (await sha256Hex(`quittance::${cfg(env).jwt}::${id}`)).slice(0, 20)
}

// ---------- Code élève : identifiant + code de liaison sécurisé ----------
// Format : RCF-<id>-<4 caractères> (dérivé cryptographiquement, impossible à deviner)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans I/O/0/1 (confusion)
async function studentCode(env: Bindings, id: string | number) {
  const h = await sha256Hex(`eleve::${cfg(env).jwt}::${id}`)
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += CODE_CHARS[parseInt(h.slice(i * 2, i * 2 + 2), 16) % CODE_CHARS.length]
  return `RCF-${id}-${suffix}`
}
// Valide un code saisi ; retourne l'id élève ou null
async function parseStudentCode(env: Bindings, raw: string): Promise<number | null> {
  const m = String(raw || '').trim().toUpperCase().replace(/\s+/g, '').match(/^(?:RCF-?)?(\d+)-?([A-Z2-9]{4})$/)
  if (!m) return null
  const id = Number(m[1])
  const expected = await studentCode(env, id)
  return expected.replace(/-/g, '') === `RCF${m[1]}${m[2]}` ? id : null
}

async function sendReceiptTelegram(env: Bindings, origin: string, fee: any) {
  try {
    const st = await sb(env, `students?id=eq.${fee.student_id}&select=first_name,last_name,parent_phone,parent_name`)
    const student = st.data?.[0]
    if (!student) return
    const token = await receiptToken(env, fee.id)
    const link = `${origin}/quittance/${fee.id}?t=${token}`
    const text = `🧾 <b>Paiement confirmé — Rahma Academy</b>\n\nÉlève : <b>${student.first_name} ${student.last_name}</b>\n${fee.label} : <b>${Number(fee.amount)} DT</b>\nPayé le : ${fee.paid_date || new Date().toISOString().slice(0, 10)}\n\n📄 <b>Téléchargez votre quittance :</b>\n<a href="${link}">${link}</a>`
    const r = await sendTelegram(env, student.parent_phone, text)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: fee.student_id, type: 'frais', title: 'Quittance de paiement', message: `Quittance envoyée : ${link}`, recipient: student.parent_phone || student.parent_name, sent_via: 'telegram', status: r.sent ? 'sent' : 'logged' }) })
  } catch (e) { /* non bloquant */ }
}

// Créer notification + envoyer email/SMS selon les paramètres
async function notifyParent(env: Bindings, studentId: number, type: string, title: string, message: string) {
  const st = await sb(env, `students?id=eq.${studentId}&select=id,first_name,last_name,parent_email,parent_phone,parent_name`)
  const student = st.data?.[0]
  if (!student) return
  const prefs = await getSettings(env, 'notifications')
  const typeKey = type === 'absence' || type === 'retard' ? 'absence' : type === 'frais' ? 'frais' : 'note'
  const results: string[] = []

  // Notification interne (toujours)
  await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_email || student.parent_phone, sent_via: 'app', status: 'sent' }) })

  // Email
  if (prefs[`email_${typeKey}`] !== false && student.parent_email) {
    const r = await sendEmail(env, student.parent_email, `[Rahma Academy] ${title}`, `<div style="font-family:Arial"><h2 style="color:#1e40af">Rahma Academy</h2><p>Cher(e) ${student.parent_name || 'parent'},</p><p>${message}</p><p style="color:#666;font-size:12px">Élève : ${student.first_name} ${student.last_name}</p></div>`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_email, sent_via: 'email', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`email:${r.sent}`)
  }
  // SMS
  if (prefs[`sms_${typeKey}`] === true && student.parent_phone) {
    const r = await sendSMS(env, student.parent_phone, `Rahma Academy: ${message}`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_phone, sent_via: 'sms', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`sms:${r.sent}`)
  }
  // Telegram (gratuit)
  if (prefs[`telegram_${typeKey}`] !== false && student.parent_phone) {
    const r = await sendTelegram(env, student.parent_phone, `🏫 <b>Rahma Academy</b>\n<b>${title}</b>\n${message}\n\nÉlève : ${student.first_name} ${student.last_name}`)
    if (r.sent || r.reason !== 'parent_not_linked') {
      await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_phone, sent_via: 'telegram', status: r.sent ? 'sent' : 'logged' }) })
      results.push(`telegram:${r.sent}`)
    }
  }
  return results
}

// ---------- Notifications ciblées par rôle (cours / événements / examens) ----------
// Matrice de diffusion :
//   cours (courses, interactive_courses) -> élèves + parents + enseignants
//   evenement (events hors examen)       -> parents + enseignants
//   examen (events type=examen)          -> élèves + parents + enseignants
const AUDIENCE: Record<string, string[]> = {
  cours: ['student', 'parent', 'teacher'],
  evenement: ['parent', 'teacher'],
  examen: ['student', 'parent', 'teacher']
}
const TARGETED_TYPES = ['cours', 'evenement', 'examen']

// Notifications historiques (absence/note/frais...) : 1 ligne par élève. Notifications ciblées : 1 ligne par information.
// Retourne false si la migration 0006 n'est pas appliquée (colonne audience absente).
async function targetedSupported(env: Bindings): Promise<boolean> {
  const probe = await sb(env, 'notifications?select=audience&limit=1')
  return probe.ok
}

async function broadcastTargeted(env: Bindings, origin: string, opts: { type: string; title: string; message: string; level?: string | null; ref_table: string; ref_id: number; link: string; created_by?: number | null }) {
  const supported = await targetedSupported(env)
  const audience = AUDIENCE[opts.type] || ['parent', 'teacher']
  const level = opts.level || null
  if (supported) {
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({
      student_id: null, type: opts.type, title: opts.title, message: opts.message,
      recipient: level ? `Niveau ${level}` : 'Toute l\'école', sent_via: 'app', status: 'sent',
      audience, level, ref_table: opts.ref_table, ref_id: opts.ref_id, link: opts.link, created_by: opts.created_by || null
    }) })
  }
  // Canaux externes (parents uniquement) selon préférences : Telegram par défaut, email optionnel
  if (!audience.includes('parent')) return
  const prefs = await getSettings(env, 'notifications')
  const wantTg = prefs[`telegram_${opts.type}`] !== false
  const wantEmail = prefs[`email_${opts.type}`] === true
  if (!wantTg && !wantEmail) return
  let q = `students?status=eq.actif&select=id,first_name,last_name,parent_name,parent_phone,parent_email`
  if (level) q += `&level=eq.${encodeURIComponent(level)}`
  const st = await sb(env, q)
  const fullLink = `${origin}/${opts.link}`
  const icon = opts.type === 'examen' ? '📝' : opts.type === 'cours' ? '📚' : '📅'
  for (const s of (st.data || []).slice(0, 200)) {
    try {
      if (wantTg && s.parent_phone) {
        await sendTelegram(env, s.parent_phone, `${icon} <b>${opts.title}</b>\n${opts.message}\n\n🔗 <a href="${fullLink}">Ouvrir dans l'application</a>\n\nÉlève : ${s.first_name} ${s.last_name}\n— Rahma Academy`)
      }
      if (wantEmail && s.parent_email) {
        await sendEmail(env, s.parent_email, `[Rahma Academy] ${opts.title}`, `<div style="font-family:Arial"><h2 style="color:#1e40af">Rahma Academy</h2><p>Cher(e) ${s.parent_name || 'parent'},</p><p>${opts.message}</p><p><a href="${fullLink}">Ouvrir dans l'application</a></p><p style="color:#666;font-size:12px">Élève : ${s.first_name} ${s.last_name}</p></div>`)
      }
    } catch (e) { /* non bloquant */ }
  }
}

// Déclencheurs : appelé après création (et pour events, après modification de la date d'un examen)
async function notifyNewContent(env: Bindings, origin: string, table: string, row: any, user: any, updated = false) {
  if (!row?.id) return
  const fmtDate = (d: string) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) } catch { return d } }
  const lvl = row.level ? ` (${row.level})` : ''
  if (table === 'courses') {
    let sname = ''
    if (row.subject_id) { const s = await sb(env, `subjects?id=eq.${row.subject_id}&select=name`); sname = s.data?.[0]?.name || '' }
    await broadcastTargeted(env, origin, { type: 'cours', title: `Nouveau cours${sname ? ' — ' + sname : ''}${lvl}`, message: `« ${row.title} » est disponible dans Cours & Documents.${row.description ? ' ' + String(row.description).slice(0, 160) : ''}`, level: row.level, ref_table: 'courses', ref_id: Number(row.id), link: `#courses`, created_by: user?.id })
  } else if (table === 'interactive_courses') {
    const typeLabels: Record<string, string> = { quiz: 'Quiz', flashcards: 'Cartes mémoire', fillblank: 'Texte à trous', external: 'Application' }
    await broadcastTargeted(env, origin, { type: 'cours', title: `Nouveau cours interactif${lvl}`, message: `« ${row.title} » (${typeLabels[row.course_type] || 'Quiz'}) est disponible dans Cours interactifs.`, level: row.level, ref_table: 'interactive_courses', ref_id: Number(row.id), link: `#ic-${row.id}`, created_by: user?.id })
  } else if (table === 'events') {
    const isExam = row.type === 'examen'
    const typeLabel: Record<string, string> = { general: 'Événement', examen: 'Examen', vacances: 'Vacances', reunion: 'Réunion', activite: 'Activité' }
    const when = row.end_date && row.end_date !== row.date ? `du ${fmtDate(row.date)} au ${fmtDate(row.end_date)}` : `le ${fmtDate(row.date)}`
    const title = isExam ? (updated ? `Examen — date modifiée${lvl}` : `Examen programmé${lvl}`) : `${typeLabel[row.type] || 'Événement'}${updated ? ' — mis à jour' : ''}${lvl}`
    await broadcastTargeted(env, origin, { type: isExam ? 'examen' : 'evenement', title, message: `« ${row.title} » ${when}.${row.description ? ' ' + String(row.description).slice(0, 160) : ''}`, level: row.level, ref_table: 'events', ref_id: Number(row.id), link: `#calendar`, created_by: user?.id })
  }
}

// Niveaux scolaires visibles par l'utilisateur (parent/élève : niveaux des enfants liés ; enseignant : niveaux de ses élèves affectés)
async function userLevels(env: Bindings, user: any): Promise<string[] | null> {
  if (user.role === 'admin') return null // tout
  let ids: number[] = []
  if (user.role === 'teacher') { const a = await teacherAssignedIds(env, user); if (a === null) return null; ids = a }
  else ids = linkedIds(user)
  if (!ids.length) return []
  const r = await sb(env, `students?id=in.(${ids.join(',')})&select=level`)
  return Array.from(new Set((r.data || []).map((s: any) => s.level).filter(Boolean)))
}

// Filtre PostgREST des notifications ciblées visibles par l'utilisateur
async function targetedFilter(env: Bindings, user: any): Promise<string> {
  const lv = await userLevels(env, user)
  let f = `audience=cs.["${user.role}"]`
  if (user.role === 'admin') f = `audience=not.is.null`
  if (lv !== null) {
    if (lv.length) f += `&or=(level.is.null,level.in.(${lv.map(l => `"${l}"`).join(',')}))`
    else f += `&level=is.null`
  }
  return f
}

// Fil de notifications de l'utilisateur connecté : ciblées (par rôle/niveau) + historiques (parents/élèves : leurs enfants ; staff : leurs élèves)
async function buildFeed(env: Bindings, user: any, limit: number, type: string) {
  const supported = await targetedSupported(env)
  const sel = 'select=id,student_id,type,title,message,recipient,sent_via,status,created_at' + (supported ? ',audience,level,ref_table,ref_id,link,created_by' : '') + ',students(first_name,last_name)'
  const lists: any[][] = []
  // 1) Ciblées
  if (supported && (!type || TARGETED_TYPES.includes(type))) {
    let q = `notifications?${sel}&${await targetedFilter(env, user)}&order=created_at.desc&limit=${limit}`
    if (type) q += `&type=eq.${type}`
    const r = await sb(env, q)
    if (r.ok) lists.push((r.data || []).filter((n: any) => !(n.created_by && Number(n.created_by) === Number(user.id) && user.role !== 'admin')))
  }
  // 2) Historiques (liées à un élève, type != chat)
  if (!type || !TARGETED_TYPES.includes(type)) {
    let ids: number[] | null = null
    if (user.role === 'parent' || user.role === 'student') ids = linkedIds(user)
    else if (user.role === 'teacher') ids = await teacherAssignedIds(env, user)
    if (!(ids && !ids.length)) {
      let q = `notifications?${sel}&type=neq.chat&sent_via=eq.app&order=created_at.desc&limit=${limit}`
      q += supported ? '&audience=is.null' : ''
      if (ids) q += `&student_id=in.(${ids.join(',')})`
      else if (user.role !== 'admin') q += `&student_id=not.is.null`
      if (type) q += `&type=eq.${type}`
      const r = await sb(env, q)
      if (r.ok) lists.push(r.data || [])
    }
  }
  let all = lists.flat().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit)
  // Lu / non lu
  let readSet = new Set<number>()
  if (supported && all.length) {
    const rr = await sb(env, `notification_reads?user_id=eq.${user.id}&notification_id=in.(${all.map(n => n.id).join(',')})&select=notification_id`)
    if (rr.ok) readSet = new Set((rr.data || []).map((x: any) => Number(x.notification_id)))
  }
  // Sans migration 0006 (pas de suivi de lecture), tout est considéré lu pour éviter un compteur figé
  all = all.map(n => ({ ...n, read: supported ? readSet.has(Number(n.id)) : true }))
  return { items: all, unread: all.filter(n => !n.read).length, supported }
}

app.get('/api/notifications/feed', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const limit = Math.min(200, Number(c.req.query('limit') || 100))
  const type = c.req.query('type') || ''
  return c.json(await buildFeed(c.env, user, limit, type))
})

// Compteur de non-lus (badge cloche) — léger
app.get('/api/notifications/unread-count', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const supported = await targetedSupported(c.env)
  if (!supported) return c.json({ unread: 0, supported: false })
  const since = new Date(Date.now() - 45 * 86400000).toISOString()
  const ids: number[] = []
  const q1 = await sb(c.env, `notifications?select=id,created_by&${await targetedFilter(c.env, user)}&created_at=gte.${since}&limit=300`)
  for (const n of (q1.data || [])) if (!(n.created_by && Number(n.created_by) === Number(user.id) && user.role !== 'admin')) ids.push(Number(n.id))
  let sids: number[] | null = null
  if (user.role === 'parent' || user.role === 'student') sids = linkedIds(user)
  else if (user.role === 'teacher') sids = await teacherAssignedIds(c.env, user)
  if (!(sids && !sids.length)) {
    let q = `notifications?select=id&type=neq.chat&sent_via=eq.app&audience=is.null&created_at=gte.${since}&limit=300`
    if (sids) q += `&student_id=in.(${sids.join(',')})`
    else if (user.role !== 'admin') q += `&student_id=not.is.null`
    const q2 = await sb(c.env, q)
    for (const n of (q2.data || [])) ids.push(Number(n.id))
  }
  if (!ids.length) return c.json({ unread: 0, supported: true })
  const rr = await sb(c.env, `notification_reads?user_id=eq.${user.id}&notification_id=in.(${ids.join(',')})&select=notification_id`)
  const read = new Set((rr.data || []).map((x: any) => Number(x.notification_id)))
  return c.json({ unread: ids.filter(id => !read.has(id)).length, supported: true })
})

// Marquer comme lu : { ids: [..] } ou { all: true } (toutes celles du fil)
app.post('/api/notifications/read', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await targetedSupported(c.env))) return c.json({ ok: false, supported: false })
  const b = await c.req.json().catch(() => ({}))
  let ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : []
  if (b.all) {
    const feed = await buildFeed(c.env, user, 200, '')
    ids = feed.items.filter((n: any) => !n.read).map((n: any) => Number(n.id))
  }
  if (!ids.length) return c.json({ ok: true, marked: 0 })
  const rows = ids.map(id => ({ user_id: user.id, notification_id: id }))
  const r = await sb(c.env, 'notification_reads?on_conflict=user_id,notification_id', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } })
  return c.json({ ok: r.ok, marked: ids.length })
})

// ---------- Connexion Google (OAuth 2.0 / OpenID Connect) ----------
// Règles : compte existant (même email, vérifié par Google) -> connexion directe ;
// nouveau compte -> rôle parent uniquement (jamais admin/enseignant) ; comptes inactifs bloqués.
// Origine publique : derrière un proxy (Cloudflare, sandbox) le Worker peut voir http:// alors que le navigateur est en https://
function publicOrigin(c: any): string {
  const u = new URL(c.req.url)
  const proto = c.req.header('X-Forwarded-Proto') || (u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? 'http' : 'https')
  return `${proto}://${u.host}`
}
function googleRedirectUri(c: any) { return `${publicOrigin(c)}/api/auth/google/callback` }
function b64url(buf: ArrayBuffer | Uint8Array) { return btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }

// Disponibilité (le bouton n'apparaît que si configuré)
app.get('/api/auth/google/status', (c) => c.json({ enabled: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) }))

// 1) Redirection vers Google avec state signé (anti-CSRF, 10 min)
app.get('/api/auth/google', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.text('Connexion Google non configurée (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).', 503)
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const state = await sign({ nonce, ret: c.req.query('ret') || '/', exp: Math.floor(Date.now() / 1000) + 600 }, cfg(c.env).jwt)
  const p = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(c), response_type: 'code',
    scope: 'openid email profile', state, nonce, access_type: 'online', prompt: 'select_account'
  })
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`)
})

// 2) Retour de Google : échange du code, vérification de l'identité, création du JWT applicatif
app.get('/api/auth/google/callback', async (c) => {
  const fail = (msg: string) => c.redirect(`/?google_error=${encodeURIComponent(msg)}`)
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return fail('Connexion Google non configurée')
  const code = c.req.query('code'); const state = c.req.query('state')
  if (c.req.query('error')) return fail('Connexion Google annulée')
  if (!code || !state) return fail('Réponse Google invalide')
  let st: any
  try { st = await verify(state, cfg(c.env).jwt, 'HS256') } catch { return fail('Session expirée, réessayez') }
  // Échange du code
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(c), grant_type: 'authorization_code' })
  })
  const tok: any = await tr.json().catch(() => ({}))
  if (!tr.ok || !tok.id_token) return fail('Échec de l\'échange avec Google')
  // Vérification de l'id_token via tokeninfo (signature, audience, expiration vérifiées par Google)
  const ir = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tok.id_token)}`)
  const info: any = await ir.json().catch(() => ({}))
  if (!ir.ok || info.aud !== c.env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss) || info.nonce !== st.nonce) return fail('Identité Google non vérifiable')
  if (info.email_verified !== 'true' && info.email_verified !== true) return fail('Adresse Google non vérifiée')
  const email = String(info.email).toLowerCase()
  const googleId = String(info.sub)
  const ip = clientIp(c)
  // Compte existant ? (par google_id puis par email)
  let u: any = null
  const byId = await sb(c.env, `user_accounts?google_id=eq.${encodeURIComponent(googleId)}&select=*`)
  const googleCols = byId.ok
  if (googleCols && byId.data?.length) u = byId.data[0]
  if (!u) { const byEmail = await sb(c.env, `user_accounts?email=ilike.${encodeURIComponent(email)}&select=*`); u = byEmail.data?.[0] || null }
  if (u) {
    if (u.status !== 'active') return fail(u.role === 'teacher' ? 'Compte enseignant en attente de validation par l\'administration' : 'Compte désactivé. Contactez l\'administration')
    if (googleCols) {
      const patch: any = { last_login: new Date().toISOString() }
      if (!u.google_id) patch.google_id = googleId
      if (!u.avatar_url && info.picture) patch.avatar_url = info.picture
      await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    } else await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ last_login: new Date().toISOString() }) })
  } else {
    // Nouveau compte : parent uniquement, sans élève lié (liaison via code RCF ensuite), mot de passe aléatoire inutilisable
    const payload: any = { name: info.name || email.split('@')[0], email, password_hash: await hashPassword(b64url(crypto.getRandomValues(new Uint8Array(24)))), role: 'parent', status: 'active', linked_student_ids: [] }
    if (googleCols) { payload.google_id = googleId; payload.avatar_url = info.picture || null; payload.auth_provider = 'google' }
    let r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
    if (!r.ok && googleCols) { delete payload.google_id; delete payload.avatar_url; delete payload.auth_provider; r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) }) }
    if (!r.ok) return fail('Impossible de créer le compte')
    u = r.data[0]
    await audit(c.env, c, u, 'signup_google', 'user_accounts', u.id, null, { email, role: 'parent', ip })
  }
  await clearLoginFailures(c.env, email)
  await audit(c.env, c, u, 'login_google', 'user_accounts', u.id, null, { ip })
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  // Le token est transmis dans le fragment (#) : jamais envoyé au serveur ni journalisé
  const ret = typeof st.ret === 'string' && st.ret.startsWith('/') ? st.ret : '/'
  return c.redirect(`${ret}#gtoken=${token}`)
})

// ---------- AUTH ----------
app.post('/api/auth/signup', async (c) => {
  const b = await c.req.json()
  if (!b.email || !b.password || !b.name) return c.json({ error: 'Champs requis manquants' }, 400)
  const exists = await sb(c.env, `user_accounts?email=eq.${encodeURIComponent(b.email)}&select=id`)
  if (exists.data?.length) return c.json({ error: 'Cet email est déjà utilisé' }, 409)
  // SÉCURITÉ : le rôle admin ne peut PAS être créé via l'inscription publique (uniquement par un admin : POST /api/admin/users)
  if (b.role === 'admin') return c.json({ error: 'La création d\'un compte Administration est réservée à l\'administrateur de la plateforme.' }, 403)
  const role = ['teacher', 'parent', 'student'].includes(b.role) ? b.role : 'parent'
  if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
  // Enseignant : la matière enseignée est obligatoire
  if (role === 'teacher' && !String(b.subject || '').trim()) {
    return c.json({ error: 'La matière enseignée est obligatoire pour un compte enseignant.' }, 400)
  }
  // Liaison élève : uniquement via le code officiel (RCF-id-XXXX) fourni par l'école
  let linkedId: number | null = null
  if (b.student_code && ['parent', 'student'].includes(role)) {
    linkedId = await parseStudentCode(c.env, b.student_code)
    if (!linkedId) return c.json({ error: 'Code élève invalide. Vérifiez le code communiqué par l\'école (format RCF-12-ABCD).' }, 400)
    const st = await sb(c.env, `students?id=eq.${linkedId}&select=id&status=eq.actif`)
    if (!st.data?.length) return c.json({ error: 'Élève introuvable ou inactif' }, 404)
  }
  // Enseignant : lier (ou créer) sa fiche dans la table teachers avec la matière
  let linkedTeacherId: number | null = null
  if (role === 'teacher') {
    const subject = String(b.subject).trim()
    const ex = await sb(c.env, `teachers?email=eq.${encodeURIComponent(b.email)}&select=id,subject`)
    if (ex.data?.length) {
      linkedTeacherId = Number(ex.data[0].id)
      if (!ex.data[0].subject) { try { await sb(c.env, `teachers?id=eq.${linkedTeacherId}`, { method: 'PATCH', body: JSON.stringify({ subject }) }) } catch (e) {} }
    } else {
      const parts = String(b.name).trim().split(/\s+/)
      const tRow = { first_name: parts[0] || b.name, last_name: parts.slice(1).join(' ') || '-', email: b.email, phone: b.phone || null, subject, status: 'actif' }
      const tr = await sb(c.env, 'teachers', { method: 'POST', body: JSON.stringify(tRow) })
      if (tr.ok) linkedTeacherId = Number(tr.data?.[0]?.id) || null
    }
  }
  const payload: any = {
    name: b.name, email: b.email, password_hash: await hashPassword(b.password),
    // Enseignant : compte en attente de validation par l'admin (accès aux données élèves)
    role, status: role === 'teacher' ? 'inactive' : 'active', phone: b.phone || null,
    linked_student_id: linkedId,
    linked_student_ids: linkedId ? [linkedId] : []
  }
  if (linkedTeacherId) payload.linked_teacher_id = linkedTeacherId
  let r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
  // Repli si la colonne linked_teacher_id n'existe pas encore (migration 0003 non appliquée)
  if (!r.ok && linkedTeacherId) {
    delete payload.linked_teacher_id
    r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
  }
  if (!r.ok) return c.json({ error: 'Erreur création compte', detail: r.data }, 500)
  await audit(c.env, c, { id: r.data?.[0]?.id, email: b.email, role }, 'signup', 'user_accounts', r.data?.[0]?.id, null, { email: b.email, role, status: payload.status })
  if (role === 'teacher') return c.json({ pending: true, message: "Compte enseignant créé. Il sera activé par l'administration après vérification — vous serez informé(e)." })
  const u = r.data[0]
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids } })
})

app.post('/api/auth/login', async (c) => {
  const b = await c.req.json()
  const email = String(b.email || '').trim().toLowerCase()
  const ip = clientIp(c)
  // Rate-limiting : 5 échecs / 15 min (par email ou IP)
  const wait = await loginBlocked(c.env, email, ip)
  if (wait > 0) {
    await audit(c.env, c, { email }, 'login_blocked', 'user_accounts', null, null, { ip })
    return c.json({ error: `Trop de tentatives. Réessayez dans ${wait} minute${wait > 1 ? 's' : ''}.`, retry_after_min: wait }, 429)
  }
  const r = await sb(c.env, `user_accounts?email=ilike.${encodeURIComponent(email)}&select=*`)
  if (!r.ok && r.status === 503) return c.json({ error: r.data.error }, 503)
  const u = Array.isArray(r.data) ? r.data[0] : undefined
  const check = u ? await verifyPassword(String(b.password || ''), u.password_hash) : { ok: false, needsUpgrade: false }
  if (!u || !check.ok) {
    await recordLoginFailure(c.env, email, ip)
    await audit(c.env, c, { email }, 'login_failed', 'user_accounts', u?.id ?? null, null, { ip })
    return c.json({ error: 'Email ou mot de passe incorrect' }, 401)
  }
  if (u.status !== 'active') return c.json({ error: u.role === 'teacher' ? 'Compte enseignant en attente de validation par l\'administration.' : 'Compte désactivé. Contactez l\'administration.' }, 403)
  await upgradeHashIfNeeded(c.env, u.id, String(b.password), check)
  await clearLoginFailures(c.env, email)
  await sb(c.env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ last_login: new Date().toISOString() }) })
  await audit(c.env, c, u, 'login', 'user_accounts', u.id, null, { ip })
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids } })
})

app.get('/api/auth/me', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  let r = await sb(c.env, `user_accounts?id=eq.${user.id}&select=id,name,email,role,status,linked_student_id,linked_student_ids,phone,google_id,avatar_url,auth_provider`)
  if (!r.ok) r = await sb(c.env, `user_accounts?id=eq.${user.id}&select=id,name,email,role,status,linked_student_id,linked_student_ids,phone`)
  const u = r.data?.[0]
  if (u) { u.has_google = !!u.google_id; delete u.google_id }
  return c.json({ user: u || user })
})

// Modifier son propre compte (email / nom / téléphone / mot de passe) — mot de passe actuel requis
app.patch('/api/auth/me', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json()
  // Vérifier le mot de passe actuel
  const cur = await sb(c.env, `user_accounts?id=eq.${user.id}&select=*`)
  const u = cur.data?.[0]
  if (!u) return c.json({ error: 'Compte introuvable' }, 404)
  if (!b.current_password || !(await verifyPassword(String(b.current_password), u.password_hash)).ok) {
    return c.json({ error: 'Mot de passe actuel incorrect' }, 403)
  }
  if (b.new_password && String(b.new_password).length < 8) return c.json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' }, 400)
  const allowed: any = {}
  for (const k of ['name', 'phone']) if (b[k]) allowed[k] = b[k]
  if (b.email && b.email !== u.email) {
    const exists = await sb(c.env, `user_accounts?email=eq.${encodeURIComponent(b.email)}&select=id`)
    if (exists.data?.length) return c.json({ error: 'Cet email est déjà utilisé' }, 409)
    allowed.email = b.email
  }
  if (b.new_password) {
    if (String(b.new_password).length < 6) return c.json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' }, 400)
    allowed.password_hash = await hashPassword(b.new_password)
  }
  if (!Object.keys(allowed).length) return c.json({ error: 'Aucune modification' }, 400)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  if (!r.ok) return c.json({ error: 'Erreur mise à jour', detail: r.data }, 500)
  const nu = r.data[0]
  const token = await sign({ id: nu.id, email: nu.email, role: nu.role, name: nu.name, linked_student_id: nu.linked_student_id, linked_student_ids: nu.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ token, user: { id: nu.id, name: nu.name, email: nu.email, role: nu.role, phone: nu.phone } })
})

// Statistiques publiques agrégées pour la page d'accueil (compteurs animés) — aucune donnée personnelle
app.get('/api/public/stats', async (c) => {
  // Compter via select léger — les tables restent petites (école)
  const [st, te, co, ic] = await Promise.all([
    sb(c.env, 'students?select=level&status=eq.actif'),
    sb(c.env, 'teachers?select=id'),
    sb(c.env, 'courses?select=id'),
    sb(c.env, 'interactive_courses?select=id')
  ])
  const levels = new Set((st.data || []).map((s: any) => s.level).filter(Boolean))
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({
    students: (st.data || []).length,
    teachers: (te.data || []).length,
    courses: (co.data || []).length + (ic.data || []).length,
    levels: levels.size
  })
})

// Liste publique des élèves pour liaison à l'inscription (nom + niveau seulement)
// Liste publique des élèves : réservée au staff (fuite de données sinon)
app.get('/api/public/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, 'students?select=id,first_name,last_name,level,class_name&order=last_name.asc&status=eq.actif')
  return c.json(r.data || [])
})

// Code de liaison d'un élève (staff uniquement — à communiquer au tuteur)
app.get('/api/students/:id/code', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'ID invalide' }, 400)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(Number(id))) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  return c.json({ id: Number(id), code: await studentCode(c.env, id) })
})

// ---------- Affectation élèves <-> enseignants ----------
// Lire les affectations d'un enseignant (admin) ou les siennes (teacher)
app.get('/api/teachers/:id/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const tid = Number(c.req.param('id'))
  if (!tid) return c.json({ error: 'ID invalide' }, 400)
  if (user.role === 'teacher') {
    const own = await getTeacherId(c.env, user)
    if (own !== tid) return c.json({ error: 'Accès refusé' }, 403)
  }
  const r = await sb(c.env, `teacher_students?teacher_id=eq.${tid}&select=student_id,students(id,first_name,last_name,level,class_name,status)`)
  if (!r.ok) return c.json({ error: 'Table des affectations absente. Exécutez migrations/0003_teacher_assignments.sql dans Supabase.', detail: r.data }, 500)
  return c.json(r.data || [])
})

// Remplacer en bloc les élèves affectés à un enseignant (admin uniquement)
app.put('/api/teachers/:id/students', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const tid = Number(c.req.param('id'))
  if (!tid) return c.json({ error: 'ID invalide' }, 400)
  const b = await c.req.json()
  const ids: number[] = Array.from(new Set((Array.isArray(b.student_ids) ? b.student_ids : []).map((x: any) => Number(x)).filter((n: number) => n > 0)))
  const del = await sb(c.env, `teacher_students?teacher_id=eq.${tid}`, { method: 'DELETE' })
  if (!del.ok) return c.json({ error: 'Table des affectations absente. Exécutez migrations/0003_teacher_assignments.sql dans Supabase.', detail: del.data }, 500)
  if (ids.length) {
    const rows = ids.map((sid) => ({ teacher_id: tid, student_id: sid }))
    const ins = await sb(c.env, 'teacher_students', { method: 'POST', body: JSON.stringify(rows) })
    if (!ins.ok) return c.json({ error: 'Erreur affectation', detail: ins.data }, 500)
  }
  return c.json({ ok: true, teacher_id: tid, student_ids: ids })
})

// Lier un élève à son compte (parent/élève) avec le code fourni par l'école
app.post('/api/link-student', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!['parent', 'student'].includes(user.role)) return c.json({ error: 'Réservé aux parents et élèves' }, 403)
  const b = await c.req.json()
  const sid = await parseStudentCode(c.env, b.code)
  if (!sid) return c.json({ error: 'Code élève invalide. Vérifiez le code communiqué par l\'école (format RCF-12-ABCD).' }, 400)
  const st = await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level&status=eq.actif`)
  const student = st.data?.[0]
  if (!student) return c.json({ error: 'Élève introuvable ou inactif' }, 404)
  // Ajouter aux liaisons existantes
  const acc = await sb(c.env, `user_accounts?id=eq.${user.id}&select=linked_student_ids,linked_student_id`)
  const cur: number[] = Array.isArray(acc.data?.[0]?.linked_student_ids) ? acc.data[0].linked_student_ids.map(Number) : []
  if (!cur.includes(sid)) cur.push(sid)
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ linked_student_ids: cur, linked_student_id: acc.data?.[0]?.linked_student_id || sid }) })
  if (!r.ok) return c.json({ error: 'Erreur de liaison' }, 500)
  // Nouveau JWT avec les liaisons à jour
  const u = r.data[0]
  const token = await sign({ id: u.id, email: u.email, role: u.role, name: u.name, linked_student_id: u.linked_student_id, linked_student_ids: u.linked_student_ids, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }, cfg(c.env).jwt)
  return c.json({ ok: true, token, student: { id: student.id, first_name: student.first_name, last_name: student.last_name, level: student.level }, linked_student_ids: u.linked_student_ids })
})

// ---------- ADMIN : gestion des utilisateurs ----------
app.get('/api/admin/users', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const role = c.req.query('role')
  let q = 'user_accounts?select=id,name,email,role,status,linked_student_id,linked_student_ids,phone,last_login,created_at&order=created_at.desc'
  if (role) q += `&role=eq.${role}`
  const r = await sb(c.env, q)
  return c.json(r.data || [])
})

// Création d'un compte par l'admin (seule voie pour créer un autre administrateur)
app.post('/api/admin/users', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!b.email || !b.password || !b.name) return c.json({ error: 'Champs requis manquants' }, 400)
  if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
  const role = ['admin', 'teacher', 'parent', 'student'].includes(b.role) ? b.role : 'parent'
  const email = String(b.email).trim().toLowerCase()
  const exists = await sb(c.env, `user_accounts?email=ilike.${encodeURIComponent(email)}&select=id`)
  if (exists.data?.length) return c.json({ error: 'Cet email est déjà utilisé' }, 409)
  const payload: any = { name: b.name, email, password_hash: await hashPassword(b.password), role, status: 'active', phone: b.phone || null, linked_student_ids: [] }
  const r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
  if (!r.ok) return c.json({ error: 'Erreur création compte', detail: r.data }, 500)
  await audit(c.env, c, user, 'create', 'user_accounts', r.data?.[0]?.id, null, { email, role, name: b.name })
  const { password_hash, ...safe } = r.data?.[0] || {}
  return c.json(safe, 201)
})

app.patch('/api/admin/users/:id', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const allowed: any = {}
  for (const k of ['status', 'role', 'name', 'email', 'linked_student_id', 'linked_student_ids', 'phone']) if (k in b) allowed[k] = b[k]
  if (b.password) {
    if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
    allowed.password_hash = await hashPassword(b.password)
  }
  const before = (await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}&select=id,name,email,role,status,phone,linked_student_ids`)).data?.[0]
  const r = await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  await audit(c.env, c, user, 'update', 'user_accounts', c.req.param('id'), before, { ...allowed, password_hash: b.password ? '(modifié)' : undefined })
  const { password_hash: _ph, ...safeU } = r.data?.[0] || {}
  return c.json(r.data?.[0] ? safeU : { ok: r.ok })
})

app.delete('/api/admin/users/:id', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (String(user.id) === c.req.param('id')) return c.json({ error: 'Impossible de supprimer votre propre compte' }, 400)
  const before = (await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}&select=id,name,email,role,status`)).data?.[0]
  const r = await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}`, { method: 'DELETE' })
  await audit(c.env, c, user, 'delete', 'user_accounts', c.req.param('id'), before, null)
  return c.json({ ok: r.ok })
})

// ---------- Journal d'audit (admin) ----------
app.get('/api/admin/audit', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const limit = Math.min(500, Number(c.req.query('limit') || 200))
  let q = `audit_log?select=*&order=created_at.desc&limit=${limit}`
  for (const k of ['action', 'table_name', 'user_email']) { const v = c.req.query(k); if (v) q += `&${k}=eq.${encodeURIComponent(v)}` }
  const from = c.req.query('from'); if (from) q += `&created_at=gte.${from}`
  const to = c.req.query('to'); if (to) q += `&created_at=lte.${to}T23:59:59`
  const r = await sb(c.env, q)
  if (!r.ok) return c.json({ error: 'Journal d\'audit indisponible — exécutez migrations/0007_security.sql', supported: false, items: [] }, 200)
  return c.json({ supported: true, items: r.data || [] })
})

// ---------- Corbeille (soft-delete) : liste / restauration / purge ----------
app.get('/api/admin/trash', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!(await softDeleteSupported(c.env))) return c.json({ supported: false, items: [] })
  // Auto-purge des éléments supprimés depuis plus de 30 jours
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400000).toISOString()
  const items: any[] = []
  for (const t of SOFT_DELETE_TABLES) {
    try { await sb(c.env, `${t}?deleted_at=lt.${cutoff}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }) } catch (e) {}
    const r = await sb(c.env, `${t}?deleted_at=not.is.null&select=*&order=deleted_at.desc&limit=200`)
    for (const row of (r.data || [])) items.push({ table: t, id: row.id, deleted_at: row.deleted_at, deleted_by: row.deleted_by, label: rowLabel(t, row), expires_at: new Date(new Date(row.deleted_at).getTime() + TRASH_RETENTION_DAYS * 86400000).toISOString() })
  }
  items.sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)))
  return c.json({ supported: true, retention_days: TRASH_RETENTION_DAYS, items })
})
function rowLabel(t: string, r: any): string {
  if (t === 'students' || t === 'teachers') return `${r.first_name || ''} ${r.last_name || ''}`.trim() + (r.level ? ` (${r.level})` : '')
  if (t === 'grades') return `Note ${r.score}/${r.max_score || 20} — élève #${r.student_id} T${r.trimester}`
  if (t === 'fees') return `${r.label || 'Frais'} ${r.amount} DT — élève #${r.student_id} (${r.status})`
  if (t === 'events') return `${r.title} — ${r.date}`
  return r.title || r.name || `#${r.id}`
}
app.post('/api/admin/trash/restore', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!SOFT_DELETE_TABLES.includes(b.table) || !b.id) return c.json({ error: 'Paramètres invalides' }, 400)
  const r = await sb(c.env, `${b.table}?id=eq.${Number(b.id)}&deleted_at=not.is.null`, { method: 'PATCH', body: JSON.stringify({ deleted_at: null, deleted_by: null }) })
  if (!r.data?.length) return c.json({ error: 'Élément introuvable dans la corbeille' }, 404)
  await audit(c.env, c, user, 'restore', b.table, b.id, null, r.data?.[0] || null)
  return c.json({ ok: r.ok, row: r.data?.[0] })
})
app.post('/api/admin/trash/purge', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!SOFT_DELETE_TABLES.includes(b.table) || !b.id) return c.json({ error: 'Paramètres invalides' }, 400)
  // deleted_at=not.is.null : lecture explicite d'un élément en corbeille (le filtre global exclut sinon les supprimés)
  const before = (await sb(c.env, `${b.table}?id=eq.${Number(b.id)}&deleted_at=not.is.null&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Seuls les éléments déjà dans la corbeille peuvent être supprimés définitivement' }, 400)
  const r = await sb(c.env, `${b.table}?id=eq.${Number(b.id)}`, { method: 'DELETE' })
  await audit(c.env, c, user, 'purge', b.table, b.id, before, null)
  return c.json({ ok: r.ok })
})

// Profil : mise à jour de ses propres infos (parents notamment)
app.patch('/api/profile', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json()
  const allowed: any = {}
  for (const k of ['name', 'phone']) if (k in b) allowed[k] = b[k]
  // Sécurité : les parents/élèves ne peuvent PLUS modifier leurs liaisons ici.
  // Liaison uniquement via POST /api/link-student (code officiel) ou par l'admin.
  if (b.password) {
    if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
    allowed.password_hash = await hashPassword(b.password)
  }
  const r = await sb(c.env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  const { password_hash: _ph, ...safeP } = r.data?.[0] || {}
  return c.json(r.data?.[0] ? safeP : { ok: r.ok })
})

// ---------- CRUD générique avec filtrage par rôle ----------
const TABLES = ['students', 'teachers', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events', 'notifications', 'registrations', 'settings', 'teacher_students']
const WRITE_ADMIN_TEACHER = ['students', 'teachers', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events']
const STUDENT_SCOPED = ['grades', 'attendance', 'fees', 'notifications']

app.get('/api/db/:table', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const url = new URL(c.req.url)
  let qs = url.search.slice(1)
  // Filtrage parent/élève : accès uniquement aux données de leurs enfants
  if ((user.role === 'parent' || user.role === 'student')) {
    const ids = linkedIds(user)
    if (STUDENT_SCOPED.includes(table)) {
      if (!ids.length) return c.json([])
      qs += (qs ? '&' : '') + `student_id=in.(${ids.join(',')})`
    }
    if (table === 'students') {
      if (!ids.length) return c.json([])
      qs += (qs ? '&' : '') + `id=in.(${ids.join(',')})`
    }
    if (table === 'registrations') return c.json({ error: 'Accès refusé' }, 403)
    if (table === 'teacher_students') return c.json({ error: 'Accès refusé' }, 403)
  }
  // Filtrage enseignant : uniquement les élèves qui lui sont affectés par l'admin
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null) {
      if (STUDENT_SCOPED.includes(table)) {
        if (!aids.length) return c.json([])
        qs += (qs ? '&' : '') + `student_id=in.(${aids.join(',')})`
      }
      if (table === 'students') {
        if (!aids.length) return c.json([])
        qs += (qs ? '&' : '') + `id=in.(${aids.join(',')})`
      }
    }
    if (table === 'registrations') return c.json({ error: 'Accès refusé' }, 403)
  }
  // Année scolaire : filtrer les tables datées sur l'année demandée (ou courante) sauf all_years=1 (admin)
  if (YEAR_TABLES.includes(table) && !qs.includes('school_year=') && !(url.searchParams.get('all_years') === '1' && user.role === 'admin')) {
    const y = requestedYear(c) || await currentYear(c.env)
    if (y) qs += (qs ? '&' : '') + `school_year=eq.${y}`
  }
  qs = qs.replace(/(^|&)all_years=[^&]*/g, '')
  // Soft-delete : masquer les éléments dans la corbeille (sauf demande explicite admin ?include_deleted=1)
  if (SOFT_DELETE_TABLES.includes(table) && !(user.role === 'admin' && url.searchParams.get('include_deleted') === '1') && await softDeleteSupported(c.env)) {
    qs = qs.replace(/(^|&)include_deleted=[^&]*/g, '')
    qs += (qs ? '&' : '') + 'deleted_at=is.null'
  }
  const r = await sb(c.env, `${table}?${qs || 'select=*'}`)
  return c.json(r.data || [], r.ok ? 200 : (r.status as any))
})

app.post('/api/db/:table', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  // Inscriptions publiques autorisées sans compte
  if (table !== 'registrations') {
    if (!user) return c.json({ error: 'Non authentifié' }, 401)
    if (WRITE_ADMIN_TEACHER.includes(table) && !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
    if ((table === 'settings' || table === 'notifications') && user.role !== 'admin' && !(table === 'notifications' && user.role === 'teacher') && !(table === 'settings' && user.role === 'teacher' && String((await c.req.raw.clone().json().catch(() => ({})) as any)?.key || '').startsWith('notebook_'))) return c.json({ error: 'Accès refusé' }, 403)
    if (table === 'teacher_students' && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  }
  const body = await c.req.json()
  // Matière obligatoire pour chaque enseignant
  if (table === 'teachers' && !String(body.subject || '').trim()) {
    return c.json({ error: "La matière enseignée est obligatoire pour chaque enseignant." }, 400)
  }
  // Identifiant élève (12 chiffres) : format + unicité (élève déjà enregistré => refus)
  if (table === 'students' || table === 'registrations') {
    const nid = String(body.national_id || '').replace(/\s+/g, '')
    if (table === 'students' && !/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
    if (nid) {
      if (!/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
      body.national_id = nid
      const dup = await sb(c.env, `students?national_id=eq.${nid}&select=id,first_name,last_name`)
      if (dup.data?.length) return c.json({ error: `Cet élève est déjà enregistré (identifiant ${nid} — ${dup.data[0].first_name} ${dup.data[0].last_name}). Double enregistrement refusé.` }, 409)
      if (table === 'registrations') {
        const dupReg = await sb(c.env, `registrations?national_id=eq.${nid}&status=eq.pending&select=id`)
        if (dupReg.data?.length) return c.json({ error: `Une demande d'inscription avec l'identifiant ${nid} est déjà en attente.` }, 409)
      }
    }
  }
  // Notes & cours interactifs créés par un enseignant : enregistrer l'auteur (sa fiche teacher)
  if ((table === 'grades' || table === 'interactive_courses') && user?.role === 'teacher' && !body.teacher_id) {
    try { const tid = await getTeacherId(c.env, user); if (tid) body.teacher_id = tid } catch (e) {}
  }
  // Année scolaire : tamponner les créations avec l'année courante (refus si l'année sélectionnée est clôturée)
  if (YEAR_TABLES.includes(table)) {
    const cy = await currentYear(c.env)
    if (cy) {
      const ry = requestedYear(c)
      if (ry && ry !== cy) return c.json({ error: `L'année scolaire ${ry} est clôturée (lecture seule). Revenez sur l'année courante ${cy} pour saisir des données.` }, 423)
      const stamp = (o: any) => { if (o && typeof o === 'object' && !o.school_year) o.school_year = cy }
      Array.isArray(body) ? body.forEach(stamp) : stamp(body)
    }
  }
  const isUpsert = table === 'attendance' || table === 'settings'
  const headers: Record<string, string> = isUpsert ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {}
  let r = await sb(c.env, table + (isUpsert ? (table === 'attendance' ? '?on_conflict=student_id,date' : '?on_conflict=key') : ''), { method: 'POST', body: JSON.stringify(body), headers })
  // Repli : colonnes migration 0004 absentes (teacher_id / course_type / content / external_url)
  if (!r.ok && (table === 'grades' || table === 'interactive_courses') && (r.data?.code === 'PGRST204')) {
    for (const col of ['teacher_id', 'course_type', 'content', 'external_url']) delete (body as any)[col]
    r = await sb(c.env, table, { method: 'POST', body: JSON.stringify(body), headers })
  }
  // Repli : colonnes migration 0005 absentes (students.monthly_fee / fees.period)
  if (!r.ok && (table === 'students' || table === 'fees') && (r.data?.code === 'PGRST204')) {
    for (const col of ['monthly_fee', 'period']) delete (body as any)[col]
    r = await sb(c.env, table, { method: 'POST', body: JSON.stringify(body), headers })
  }
  if (!r.ok) return c.json({ error: 'Erreur', detail: r.data }, 500)

  // ---- Notifications automatiques ----
  const rows = Array.isArray(r.data) ? r.data : [r.data]
  try {
    if (table === 'attendance') {
      for (const row of rows) {
        if (row.status === 'absent') await notifyParent(c.env, row.student_id, 'absence', 'Absence signalée', `Votre enfant a été marqué(e) ABSENT(E) le ${row.date}.${row.notes ? ' Note : ' + row.notes : ''}`)
        else if (row.status === 'retard') await notifyParent(c.env, row.student_id, 'retard', 'Retard signalé', `Votre enfant est arrivé(e) en RETARD le ${row.date}.${row.notes ? ' Note : ' + row.notes : ''}`)
      }
    }
    if (table === 'grades' && c.req.header('X-Skip-Notify') !== '1') {
      for (const row of rows) {
        const subj = await sb(c.env, `subjects?id=eq.${row.subject_id}&select=name`)
        const sname = subj.data?.[0]?.name || 'Matière'
        await notifyParent(c.env, row.student_id, 'note', 'Nouvelle note', `Nouvelle note en ${sname} : ${row.score}/${row.max_score || 20} (Trimestre ${row.trimester}).${row.comment ? ' Commentaire : ' + row.comment : ''}`)
      }
    }
    // Frais créé directement payé -> envoyer lien quittance via Telegram
    if (table === 'fees') {
      const origin = `https://${new URL(c.req.url).host}`
      for (const row of rows) {
        if (row.status === 'paid') await sendReceiptTelegram(c.env, origin, row)
      }
    }
    // Nouveau cours / cours interactif / événement / examen -> notification ciblée par rôle
    if ((table === 'courses' || table === 'interactive_courses' || table === 'events') && c.req.header('X-Skip-Notify') !== '1') {
      const origin = `https://${new URL(c.req.url).host}`
      for (const row of rows) await notifyNewContent(c.env, origin, table, row, user)
    }
  } catch (e) { /* notifications non bloquantes */ }
  if (table !== 'registrations' || user) for (const row of rows) await audit(c.env, c, user, 'create', table, row?.id ?? row?.key, null, row)
  return c.json(rows.length === 1 ? rows[0] : rows, 201)
})

app.put('/api/db/:table/:id', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if ((table === 'settings' || table === 'registrations') && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  // Année clôturée : lecture seule
  if (YEAR_TABLES.includes(table)) { const ry = requestedYear(c); const cy = await currentYear(c.env); if (ry && cy && ry !== cy) return c.json({ error: `L'année scolaire ${ry} est clôturée (lecture seule).` }, 423) }
  const body = await c.req.json()
  // Matière obligatoire pour chaque enseignant (si le champ est envoyé)
  if (table === 'teachers' && 'subject' in body && !String(body.subject || '').trim()) {
    return c.json({ error: "La matière enseignée est obligatoire pour chaque enseignant." }, 400)
  }
  if (table === 'teacher_students' && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  // Identifiant élève : format + unicité (en excluant l'élève lui-même)
  if (table === 'students' && 'national_id' in body) {
    const nid = String(body.national_id || '').replace(/\s+/g, '')
    if (!/^\d{12}$/.test(nid)) return c.json({ error: "L'identifiant de l'élève doit contenir exactement 12 chiffres." }, 400)
    body.national_id = nid
    const dup = await sb(c.env, `students?national_id=eq.${nid}&id=neq.${c.req.param('id')}&select=id,first_name,last_name`)
    if (dup.data?.length) return c.json({ error: `Cet identifiant est déjà utilisé par ${dup.data[0].first_name} ${dup.data[0].last_name}.` }, 409)
  }
  const pk = table === 'settings' ? 'key' : 'id'
  // Examen : détecter un changement de date (avant le PATCH) -> notification « date modifiée »
  let examDateChanged = false
  if (table === 'events' && ('date' in body || 'end_date' in body)) {
    try {
      const prev = (await sb(c.env, `events?id=eq.${c.req.param('id')}&select=date,end_date,type`)).data?.[0]
      const newType = body.type || prev?.type
      if (prev && newType === 'examen' && ((body.date && body.date !== prev.date) || ('end_date' in body && (body.end_date || null) !== (prev.end_date || null)))) examDateChanged = true
    } catch (e) { /* non bloquant */ }
  }
  // Détecter la transition non-payé -> payé pour les frais (avant le PATCH)
  let feeWasUnpaid = false
  if (table === 'fees' && body.status === 'paid') {
    try {
      const prev = await sb(c.env, `fees?id=eq.${c.req.param('id')}&select=status`)
      feeWasUnpaid = prev.data?.[0]?.status !== 'paid'
    } catch (e) { /* non bloquant */ }
  }
  // Audit : état avant modification (tables métier sensibles)
  let beforeRow: any = null
  if (['grades', 'fees', 'students', 'teachers', 'attendance', 'events', 'courses', 'interactive_courses', 'classes', 'subjects'].includes(table)) {
    try { beforeRow = (await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}&select=*`)).data?.[0] || null } catch (e) {}
  }
  let r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  // Repli PUT : colonnes migration 0004 absentes
  if (!r.ok && (table === 'grades' || table === 'interactive_courses') && (r.data?.code === 'PGRST204')) {
    for (const col of ['teacher_id', 'course_type', 'content', 'external_url']) delete (body as any)[col]
    r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  // Repli PUT : colonnes migration 0005 absentes (students.monthly_fee / fees.period)
  if (!r.ok && (table === 'students' || table === 'fees') && (r.data?.code === 'PGRST204')) {
    for (const col of ['monthly_fee', 'period']) delete (body as any)[col]
    r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  // Paiement confirmé -> envoyer lien quittance via Telegram au tuteur
  if (r.ok && feeWasUnpaid && r.data?.[0]) {
    try { await sendReceiptTelegram(c.env, `https://${new URL(c.req.url).host}`, r.data[0]) } catch (e) { /* non bloquant */ }
  }
  // Date d'examen modifiée -> notifier élèves / parents / enseignants
  if (r.ok && examDateChanged && r.data?.[0] && c.req.header('X-Skip-Notify') !== '1') {
    try { await notifyNewContent(c.env, `https://${new URL(c.req.url).host}`, 'events', r.data[0], user, true) } catch (e) { /* non bloquant */ }
  }
  if (r.ok) await audit(c.env, c, user, 'update', table, c.req.param('id'), beforeRow, body)
  return c.json(r.data?.[0] || { ok: r.ok }, r.ok ? 200 : 500)
})

app.delete('/api/db/:table/:id', async (c) => {
  const table = c.req.param('table')
  if (!TABLES.includes(table)) return c.json({ error: 'Table inconnue' }, 404)
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if ((table === 'settings' || table === 'registrations' || table === 'teacher_students') && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const pk = table === 'settings' ? 'key' : 'id'
  if (YEAR_TABLES.includes(table)) { const ry = requestedYear(c); const cy = await currentYear(c.env); if (ry && cy && ry !== cy) return c.json({ error: `L'année scolaire ${ry} est clôturée (lecture seule).` }, 423) }
  let before: any = null
  try { before = (await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}&select=*`)).data?.[0] || null } catch (e) {}
  // Soft-delete : marquage deleted_at (corbeille 30 jours) au lieu d'une suppression physique
  if (SOFT_DELETE_TABLES.includes(table) && await softDeleteSupported(c.env)) {
    const r = await sb(c.env, `${table}?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: user.id }) })
    await audit(c.env, c, user, 'soft_delete', table, c.req.param('id'), before, null)
    return c.json({ ok: r.ok, soft: true })
  }
  const r = await sb(c.env, `${table}?${pk}=eq.${c.req.param('id')}`, { method: 'DELETE' })
  await audit(c.env, c, user, 'delete', table, c.req.param('id'), before, null)
  return c.json({ ok: r.ok })
})

// ---------- Approbation d'une inscription -> crée l'élève ----------
app.post('/api/registrations/:id/approve', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const id = c.req.param('id')
  const r = await sb(c.env, `registrations?id=eq.${id}&select=*`)
  const reg = r.data?.[0]
  if (!reg) return c.json({ error: 'Introuvable' }, 404)
  // Anti-doublon : refuser si un élève avec cet identifiant existe déjà
  if (reg.national_id) {
    const dup = await sb(c.env, `students?national_id=eq.${reg.national_id}&select=id,first_name,last_name`)
    if (dup.data?.length) return c.json({ error: `Cet élève est déjà enregistré (identifiant ${reg.national_id} — ${dup.data[0].first_name} ${dup.data[0].last_name}).` }, 409)
  }
  const st = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify({
    first_name: reg.first_name, last_name: reg.last_name, birth_date: reg.birth_date, gender: reg.gender,
    cycle: reg.cycle, level: reg.level, parent_name: reg.parent_name, parent_email: reg.parent_email,
    parent_phone: reg.parent_phone, address: reg.address, status: 'actif', national_id: reg.national_id || null
  }) })
  if (!st.ok) return c.json({ error: 'Erreur création élève', detail: st.data }, 500)
  await sb(c.env, `registrations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) })
  // Créer automatiquement le frais d'inscription de 40 DT (échéance : 30 jours)
  const due = new Date(); due.setDate(due.getDate() + 30)
  await sb(c.env, 'fees', { method: 'POST', body: JSON.stringify({
    student_id: st.data[0].id, label: "Frais d'inscription", amount: 40,
    due_date: due.toISOString().slice(0, 10), status: 'pending'
  }) })
  // Envoyer le code élève au tuteur (Telegram + email) pour lier son compte
  const code = await studentCode(c.env, st.data[0].id)
  const codeMsg = `Inscription approuvée pour ${reg.first_name} ${reg.last_name} ! Votre code élève : ${code} — utilisez-le pour lier votre compte parent sur la plateforme (bouton « Lier un élève »). Gardez ce code confidentiel.`
  try {
    await notifyParent(c.env, st.data[0].id, 'info', 'Inscription approuvée — Code élève', codeMsg)
  } catch (e) { /* non bloquant */ }
  return c.json({ ok: true, student: st.data[0], code })
})

// ---------- Mensualités automatiques ----------
// Génère la mensualité du mois courant pour chaque élève actif qui ne l'a pas encore.
// Montant : students.monthly_fee sinon montant par défaut (settings.fees.monthly_amount, défaut 60 DT).
// Échéance : le 10 du mois. Anti-doublon via la colonne fees.period (YYYY-MM),
// avec repli sur le libellé si la migration 0005 n'est pas appliquée.
const MONTH_LABELS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

async function generateMonthlyFees(env: Bindings) {
  const now = new Date()
  const period = now.toISOString().slice(0, 7) // YYYY-MM
  const label = `Mensualité ${MONTH_LABELS_FR[now.getMonth()]} ${now.getFullYear()}`
  const feeCfg = await getSettings(env, 'fees')
  const defaultAmount = Number(feeCfg.monthly_amount) > 0 ? Number(feeCfg.monthly_amount) : 60
  const dueDate = `${period}-10`

  // Élèves actifs (monthly_fee si la colonne existe)
  let hasCols = true
  let st = await sb(env, `students?status=eq.actif&select=id,monthly_fee`)
  if (!st.ok) { hasCols = false; st = await sb(env, `students?status=eq.actif&select=id`) }
  const students = st.data || []
  if (!students.length) return { created: 0, period }

  // Mensualités déjà générées ce mois-ci
  let existing = await sb(env, `fees?period=eq.${period}&select=student_id`)
  if (!existing.ok) { hasCols = false; existing = await sb(env, `fees?label=eq.${encodeURIComponent(label)}&select=student_id`) }
  const done = new Set((existing.data || []).map((f: any) => Number(f.student_id)))

  const rows = students.filter((s: any) => !done.has(Number(s.id))).map((s: any) => ({
    student_id: s.id, label,
    amount: Number(s.monthly_fee) > 0 ? Number(s.monthly_fee) : defaultAmount,
    due_date: dueDate, status: 'pending',
    ...(hasCols ? { period } : {})
  }))
  if (!rows.length) return { created: 0, period }

  let ins = await sb(env, 'fees', { method: 'POST', body: JSON.stringify(rows) })
  // Repli : colonne period absente (migration 0005 non appliquée)
  if (!ins.ok && ins.data?.code === 'PGRST204') {
    for (const r of rows) delete (r as any).period
    ins = await sb(env, 'fees', { method: 'POST', body: JSON.stringify(rows) })
  }
  return { created: ins.ok ? rows.length : 0, period, error: ins.ok ? undefined : ins.data }
}

// Marque en retard les frais échus + notifie les tuteurs. maxNotify limite les envois par passage.
async function sweepOverdueFees(env: Bindings, maxNotify = 50) {
  const today = new Date().toISOString().slice(0, 10)
  const r = await sb(env, `fees?status=eq.pending&due_date=lt.${today}&select=*`)
  const overdue = r.data || []
  let notified = 0
  for (const fee of overdue) {
    await sb(env, `fees?id=eq.${fee.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'overdue' }) })
    if (notified < maxNotify) {
      await notifyParent(env, fee.student_id, 'frais', 'Rappel de paiement', `⚠️ Le paiement « ${fee.label} » de ${fee.amount} DT était dû le ${fee.due_date}. Merci de régulariser la situation auprès de l'administration.`)
      notified++
    }
  }
  return { overdue: overdue.length, notified }
}

// Maintenance quotidienne automatique (déclenchée par les requêtes entrantes, 1×/jour) :
// génère les mensualités du mois + bascule les frais échus en retard avec rappel.
async function dailyFeesMaintenance(env: Bindings) {
  const today = new Date().toISOString().slice(0, 10)
  const lastRun = await getSettings(env, 'fees_maintenance')
  if (lastRun.last_run === today) return null
  // Verrou optimiste : enregistrer la date AVANT le traitement pour éviter les doubles passages
  await sb(env, 'settings?on_conflict=key', {
    method: 'POST', body: JSON.stringify({ key: 'fees_maintenance', value: { last_run: today } }),
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' }
  })
  const gen = await generateMonthlyFees(env)
  const sweep = await sweepOverdueFees(env)
  return { ...gen, ...sweep }
}

// ---------- Rappels automatiques avant examen (J-3 et J-1) ----------
// Pour chaque événement de type examen dont la date est dans 3 jours ou demain : notification ciblée
// (élèves + parents + enseignants du niveau) + Telegram parents. Anti-doublon via settings.exam_reminders_sent.
const EXAM_REMINDER_OFFSETS = [3, 1]
async function sendExamReminders(env: Bindings, origin: string, force = false) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const sent = await getSettings(env, 'exam_reminders_sent') // { "<eventId>:<offset>": "YYYY-MM-DD" }
  const result = { checked: 0, sent: 0, skipped: 0, details: [] as string[] }
  for (const offset of EXAM_REMINDER_OFFSETS) {
    const target = new Date(today); target.setUTCDate(target.getUTCDate() + offset)
    const r = await sb(env, `events?type=eq.examen&date=eq.${iso(target)}&select=id,title,date,end_date,level,description`)
    for (const ev of (r.data || [])) {
      result.checked++
      const key = `${ev.id}:${offset}`
      if (sent[key] && !force) { result.skipped++; continue }
      const when = offset === 1 ? 'demain' : `dans ${offset} jours`
      const dateFr = new Date(ev.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      const lvl = ev.level ? ` (${ev.level})` : ''
      await broadcastTargeted(env, origin, {
        type: 'examen', title: `⏰ Rappel : examen ${when}${lvl}`,
        message: `« ${ev.title} » aura lieu ${when}, le ${dateFr}.${ev.description ? ' ' + String(ev.description).slice(0, 140) : ''} Bonne préparation ! — تذكير : امتحان ${offset === 1 ? 'غداً' : 'بعد ' + offset + ' أيام'}`,
        level: ev.level, ref_table: 'events', ref_id: Number(ev.id), link: '#calendar', created_by: null
      })
      sent[key] = iso(today)
      result.sent++
      result.details.push(`${ev.title} (J-${offset})`)
    }
  }
  // Nettoyage des clés de plus de 60 jours + sauvegarde
  const cutoff = new Date(today); cutoff.setUTCDate(cutoff.getUTCDate() - 60)
  for (const k of Object.keys(sent)) if (sent[k] < iso(cutoff)) delete sent[k]
  await sb(env, 'settings?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'exam_reminders_sent', value: sent }), headers: { Prefer: 'return=minimal,resolution=merge-duplicates' } })
  return result
}

// Maintenance quotidienne des rappels (verrou 1×/jour, déclenchée par les requêtes entrantes)
async function dailyExamReminders(env: Bindings, origin: string) {
  const today = new Date().toISOString().slice(0, 10)
  const last = await getSettings(env, 'exam_reminders_maintenance')
  if (last.last_run === today) return null
  await sb(env, 'settings?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'exam_reminders_maintenance', value: { last_run: today } }), headers: { Prefer: 'return=minimal,resolution=merge-duplicates' } })
  return sendExamReminders(env, origin)
}

// Route manuelle (admin) : lancer les rappels maintenant ; ?force=1 renvoie même si déjà envoyés
app.post('/api/exams/send-reminders', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const force = c.req.query('force') === '1'
  const r = await sendExamReminders(c.env, publicOrigin(c), force)
  await audit(c.env, c, user, 'exam_reminders', 'events', null, null, r)
  return c.json({ ok: true, ...r })
})

// Aperçu (admin) : examens à venir dans les 14 jours + état des rappels
app.get('/api/exams/upcoming', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const r = await sb(c.env, `events?type=eq.examen&date=gte.${today}&date=lte.${end}&select=id,title,date,level&order=date.asc`)
  const sent = await getSettings(c.env, 'exam_reminders_sent')
  const items = (r.data || []).map((e: any) => ({ ...e, days_left: Math.round((new Date(e.date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000), reminders: { j3: sent[`${e.id}:3`] || null, j1: sent[`${e.id}:1`] || null } }))
  return c.json({ items, offsets: EXAM_REMINDER_OFFSETS })
})

// ---------- Années scolaires : liste, création, année courante, assistant de passage ----------
app.get('/api/school-years', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await yearSupported(c.env))) return c.json({ supported: false, current: null, items: [] })
  const r = await sb(c.env, 'school_years?select=*&order=start_date.desc')
  const items = r.data || []
  return c.json({ supported: true, current: items.find((y: any) => y.is_current)?.label || null, items })
})

// Aperçu du passage : pour chaque élève actif, niveau actuel -> niveau proposé (ou sortant)
app.get('/api/school-years/rollover/preview', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const cy = await currentYear(c.env)
  if (!cy) return c.json({ error: 'Exécutez migrations/0009_school_years.sql' }, 400)
  const st = await sb(c.env, 'students?status=eq.actif&select=id,first_name,last_name,level,class_name&order=level.asc,last_name.asc')
  const students = (st.data || []).map((s: any) => ({ ...s, next_level: nextLevel(s.level), outcome: nextLevel(s.level) ? 'promu' : 'sortant' }))
  // Moyenne annuelle (si notes) pour aider la décision : < 10 -> suggestion redoublant
  const gr = await sb(c.env, `grades?school_year=eq.${cy}&select=student_id,score,max_score`)
  const agg: Record<number, { s: number; n: number }> = {}
  for (const g of (gr.data || [])) { const k = Number(g.student_id); agg[k] = agg[k] || { s: 0, n: 0 }; agg[k].s += Number(g.score) / (Number(g.max_score) || 20) * 20; agg[k].n++ }
  for (const s of students) { const a = agg[Number(s.id)]; s.average = a ? Math.round(a.s / a.n * 100) / 100 : null; if (s.average !== null && s.average < 10 && s.outcome === 'promu') s.outcome = 'redoublant' }
  return c.json({ current: cy, next: nextYearLabel(cy), students })
})

// Exécution du passage : clôture l'année courante, crée la suivante, applique les décisions
// body: { decisions: { [studentId]: 'promu' | 'redoublant' | 'sortant' }, start_date?, end_date?, confirm: '<label courant>' }
app.post('/api/school-years/rollover', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const cy = await currentYear(c.env)
  if (!cy) return c.json({ error: 'Exécutez migrations/0009_school_years.sql' }, 400)
  const b = await c.req.json()
  if (b.confirm !== cy) return c.json({ error: `Confirmation requise : saisissez « ${cy} » pour clôturer cette année.` }, 400)
  const ny = nextYearLabel(cy)
  const startY = Number(ny.split('-')[0])
  const start_date = b.start_date || `${startY}-09-01`, end_date = b.end_date || `${startY + 1}-06-30`
  const decisions: Record<string, string> = b.decisions || {}
  const st = await sb(c.env, 'students?status=eq.actif&select=id,level,class_name')
  const counts = { promu: 0, redoublant: 0, sortant: 0 }
  // 1) Historique de l'année clôturée + application des décisions
  for (const s of (st.data || [])) {
    const suggested = nextLevel(s.level) ? 'promu' : 'sortant'
    const d = (decisions[String(s.id)] || suggested) as keyof typeof counts
    counts[d] = (counts[d] || 0) + 1
    await sb(c.env, 'student_year_levels?on_conflict=student_id,school_year', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ student_id: s.id, school_year: cy, level: s.level, class_name: s.class_name, outcome: d }) })
    if (d === 'promu') { const nl = nextLevel(s.level)!; await sb(c.env, `students?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ level: nl, cycle: cycleOf(nl), class_name: null }) }) }
    else if (d === 'sortant') await sb(c.env, `students?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'inactif' }) })
    // redoublant : niveau inchangé
    if (d !== 'sortant') { const lvl = d === 'promu' ? nextLevel(s.level)! : s.level; await sb(c.env, 'student_year_levels?on_conflict=student_id,school_year', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ student_id: s.id, school_year: ny, level: lvl }) }) }
  }
  // 2) Clôture + nouvelle année courante
  await sb(c.env, `school_years?label=eq.${cy}`, { method: 'PATCH', body: JSON.stringify({ is_current: false, closed_at: new Date().toISOString() }) })
  const ins = await sb(c.env, 'school_years?on_conflict=label', { method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify({ label: ny, start_date, end_date, is_current: true, closed_at: null }) })
  if (!ins.ok) { await sb(c.env, `school_years?label=eq.${cy}`, { method: 'PATCH', body: JSON.stringify({ is_current: true, closed_at: null }) }); return c.json({ error: 'Impossible de créer la nouvelle année', detail: ins.data }, 500) }
  _currentYearCache = null
  // 3) Remise à zéro des verrous de maintenance (mensualités, rappels) pour la nouvelle année
  await sb(c.env, 'settings?key=in.(fees_maintenance,exam_reminders_maintenance)', { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await audit(c.env, c, user, 'rollover', 'school_years', ny, { closed: cy }, { opened: ny, ...counts })
  return c.json({ ok: true, closed: cy, opened: ny, ...counts })
})

// Rouvrir une année clôturée comme courante (correction d'erreur) — admin
app.post('/api/school-years/set-current', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!/^\d{4}-\d{4}$/.test(b.label || '')) return c.json({ error: 'Libellé invalide' }, 400)
  await sb(c.env, 'school_years?is_current=eq.true', { method: 'PATCH', body: JSON.stringify({ is_current: false }) })
  const r = await sb(c.env, `school_years?label=eq.${b.label}`, { method: 'PATCH', body: JSON.stringify({ is_current: true, closed_at: null }) })
  _currentYearCache = null
  await audit(c.env, c, user, 'set_current_year', 'school_years', b.label, null, r.data?.[0] || null)
  return c.json({ ok: r.ok && !!r.data?.length })
})

// ---------- Sauvegardes (export complet / restauration) ----------
// Export JSON de TOUTES les tables (toutes années, y compris corbeille) — admin uniquement.
// Le stockage automatique hebdomadaire vers R2 sera branché au déploiement (binding R2 optionnel).
const BACKUP_TABLES = ['school_years', 'students', 'student_year_levels', 'teachers', 'teacher_students', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events', 'homeworks', 'homework_submissions', 'bulletin_signatures', 'certificates', 'notifications', 'notification_reads', 'registrations', 'settings', 'user_accounts', 'audit_log']
const BACKUP_SENSITIVE = ['password_hash'] // exclus de l'export

async function buildBackup(env: Bindings, user: any) {
  const tables: Record<string, any[]> = {}
  const counts: Record<string, number> = {}
  const errors: string[] = []
  for (const t of BACKUP_TABLES) {
    // Lecture brute hors contexte (toutes années, supprimés inclus) : requête directe sans filtres globaux
    const rows: any[] = []
    let from = 0
    while (true) {
      // ALL_ROWS : mention de « deleted_at » sans effet (or toujours vrai) pour neutraliser le filtre global soft-delete
      const r = await yearCtx.run(null, () => sb(env, `${t}?select=*&order=${t === 'settings' ? 'key' : 'id'}.asc${SOFT_DELETE_TABLES.includes(t) ? '&or=(deleted_at.is.null,deleted_at.not.is.null)' : ''}`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } }))
      if (!r.ok) { if (from === 0) errors.push(`${t}: ${r.data?.message || r.status}`); break }
      const chunk = Array.isArray(r.data) ? r.data : []
      rows.push(...chunk)
      if (chunk.length < 1000) break
      from += 1000
    }
    for (const row of rows) for (const k of BACKUP_SENSITIVE) delete row[k]
    tables[t] = rows; counts[t] = rows.length
  }
  return {
    meta: { app: 'Rahma Academy', version: 1, exported_at: new Date().toISOString(), exported_by: user?.email || null, tables: counts, errors },
    tables
  }
}

// Export complet (JSON). Enregistre une entrée dans l'historique (settings.backup_history, 30 dernières)
app.get('/api/admin/backup/export', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const data = await buildBackup(c.env, user)
  const json = JSON.stringify(data)
  const total = Object.values(data.meta.tables).reduce((a, b) => a + b, 0)
  try {
    const hist = await getSettings(c.env, 'backup_history')
    const items = Array.isArray(hist.items) ? hist.items : []
    items.unshift({ at: data.meta.exported_at, by: user.email, rows: total, size: json.length, tables: data.meta.tables, kind: 'manual' })
    await sb(c.env, 'settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: 'backup_history', value: { items: items.slice(0, 30) } }) })
  } catch (e) {}
  await audit(c.env, c, user, 'backup_export', 'all', null, null, { rows: total, size: json.length })
  const fname = `rahma-academy-backup-${data.meta.exported_at.slice(0, 19).replace(/[:T]/g, '-')}.json`
  return new Response(json, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}"`, 'Cache-Control': 'no-store' } })
})

// Historique + tailles actuelles
app.get('/api/admin/backup/status', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const hist = await getSettings(c.env, 'backup_history')
  const counts: Record<string, number> = {}
  await Promise.all(BACKUP_TABLES.map(async t => {
    const r = await yearCtx.run(null, () => sb(c.env, `${t}?select=${t === 'settings' ? 'key' : 'id'}${SOFT_DELETE_TABLES.includes(t) ? '&or=(deleted_at.is.null,deleted_at.not.is.null)' : ''}`))
    counts[t] = r.ok ? (Array.isArray(r.data) ? r.data.length : 0) : -1
  }))
  return c.json({ history: Array.isArray(hist.items) ? hist.items : [], counts, r2: false, tables: BACKUP_TABLES })
})

// Restauration d'UNE table depuis une sauvegarde JSON : { table, rows, mode: 'upsert' | 'replace' }
// - upsert : insère/met à jour par clé primaire (sans toucher aux autres lignes)
// - replace : vide la table puis réinsère (protégé par confirmation côté client)
app.post('/api/admin/backup/restore', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const table = String(b.table || '')
  if (!BACKUP_TABLES.includes(table) || table === 'audit_log') return c.json({ error: 'Table non restaurable' }, 400)
  const rows: any[] = Array.isArray(b.rows) ? b.rows : []
  if (!rows.length) return c.json({ error: 'Aucune ligne à restaurer' }, 400)
  if (table === 'user_accounts') for (const r of rows) if (!r.password_hash) delete r.password_hash // ne pas écraser les mots de passe
  const pk = table === 'settings' ? 'key' : 'id'
  const mode = b.mode === 'replace' ? 'replace' : 'upsert'
  if (mode === 'replace') {
    if (b.confirm !== table) return c.json({ error: `Confirmation requise : saisissez « ${table} »` }, 400)
    const del = await yearCtx.run(null, () => sb(c.env, `${table}?${pk}=not.is.null`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }))
    if (!del.ok) return c.json({ error: 'Échec du vidage de la table', detail: del.data }, 500)
  }
  let inserted = 0, updated = 0, skipped = 0; const errors: string[] = []
  if (mode === 'replace' || table === 'settings') {
    // Table vide (ou clé texte) : insertion directe. Les colonnes identity « GENERATED ALWAYS » refusent un id fourni :
    // on tente avec id (préserve les liaisons), sinon repli sans id (les liaisons par id seraient alors perdues -> signalé).
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      let r = await yearCtx.run(null, () => sb(c.env, `${table}?on_conflict=${pk}`, { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(chunk) }))
      if (!r.ok && table !== 'settings' && /identity|GENERATED ALWAYS|428C9/i.test(JSON.stringify(r.data))) {
        r = await yearCtx.run(null, () => sb(c.env, table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(chunk.map(({ id, ...rest }: any) => rest)) }))
        if (r.ok) errors.push('Identifiants régénérés (colonne id GENERATED ALWAYS) : les liaisons vers cette table peuvent être décalées')
      }
      if (r.ok) inserted += chunk.length; else errors.push(String(r.data?.message || r.data?.details || r.status))
    }
  } else {
    // Mode compléter : ligne par ligne — PATCH si l'id existe, sinon INSERT (sans id si identity ALWAYS). Jamais de doublon.
    const existing = new Set<string>()
    const ex = await yearCtx.run(null, () => sb(c.env, `${table}?select=${pk}${SOFT_DELETE_TABLES.includes(table) ? '&or=(deleted_at.is.null,deleted_at.not.is.null)' : ''}`))
    for (const e of (ex.data || [])) existing.add(String(e[pk]))
    for (const row of rows) {
      const id = row[pk]
      if (id != null && existing.has(String(id))) {
        const { [pk]: _k, ...rest } = row
        const r = await yearCtx.run(null, () => sb(c.env, `${table}?${pk}=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rest) }))
        if (r.ok) updated++; else errors.push(`#${id}: ${r.data?.message || r.status}`)
      } else {
        let r = await yearCtx.run(null, () => sb(c.env, table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }))
        if (!r.ok && /identity|GENERATED ALWAYS|428C9/i.test(JSON.stringify(r.data))) { const { [pk]: _k, ...rest } = row; r = await yearCtx.run(null, () => sb(c.env, table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rest) })) }
        if (r.ok) inserted++; else errors.push(`#${id ?? '?'}: ${r.data?.message || r.status}`)
      }
      if (errors.length > 20) { skipped = rows.length - inserted - updated; break }
    }
  }
  _currentYearCache = null
  const uniqErrors = Array.from(new Set(errors))
  await audit(c.env, c, user, 'backup_restore', table, null, null, { mode, rows: rows.length, inserted, updated, skipped, errors: uniqErrors.slice(0, 3) })
  return c.json({ ok: !uniqErrors.length, table, mode, inserted, updated, skipped, total: rows.length, errors: uniqErrors.slice(0, 5) })
})

// Route manuelle : générer les mensualités du mois maintenant (admin)
app.post('/api/fees/generate-monthly', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const gen = await generateMonthlyFees(c.env)
  return c.json({ ok: true, ...gen })
})

// ---------- Vérification des frais en retard + relances ----------
app.post('/api/fees/check-overdue', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const result = await sweepOverdueFees(c.env)
  return c.json({ checked: true, ...result })
})

// ---------- Historique de paiement d'un élève ----------
app.get('/api/fees/history/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if ((user.role === 'parent' || user.role === 'student') && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  const [st, fees] = await Promise.all([
    sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name,monthly_fee,status`),
    sb(c.env, `fees?student_id=eq.${sid}&select=*&order=due_date.desc.nullslast,created_at.desc`)
  ])
  // Repli : colonne monthly_fee absente
  let student = st.data?.[0]
  if (!st.ok) {
    const st2 = await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name,status`)
    student = st2.data?.[0]
  }
  if (!student) return c.json({ error: 'Élève introuvable' }, 404)
  const list = fees.data || []
  const totals = {
    paid: list.filter((f: any) => f.status === 'paid').reduce((s: number, f: any) => s + Number(f.amount), 0),
    pending: list.filter((f: any) => f.status === 'pending').reduce((s: number, f: any) => s + Number(f.amount), 0),
    overdue: list.filter((f: any) => f.status === 'overdue').reduce((s: number, f: any) => s + Number(f.amount), 0)
  }
  return c.json({ student, fees: list, totals })
})

// ---------- Notification manuelle ----------
app.post('/api/notify', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const results = await notifyParent(c.env, b.student_id, b.type || 'info', b.title || 'Information', b.message)
  return c.json({ ok: true, results })
})

// Partager un cours interactif : notifier les tuteurs des élèves du niveau
app.post('/api/interactive/notify', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const cid = Number(b.course_id)
  if (!cid) return c.json({ error: 'course_id requis' }, 400)
  const cr = await sb(c.env, `interactive_courses?id=eq.${cid}&select=id,title,level,course_type`)
  const ic = cr.data?.[0]
  if (!ic) return c.json({ error: 'Cours interactif introuvable' }, 404)
  // Élèves ciblés : ceux du niveau du cours (ou tous si pas de niveau), actifs
  let q = `students?status=eq.actif&select=id`
  if (ic.level) q += `&level=eq.${encodeURIComponent(ic.level)}`
  const st = await sb(c.env, q)
  let ids: number[] = (st.data || []).map((s: any) => Number(s.id))
  // Enseignant : limiter à ses élèves affectés
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null) ids = ids.filter(id => aids.includes(id))
  }
  if (!ids.length) return c.json({ error: 'Aucun élève actif trouvé pour ce niveau' }, 404)
  const typeLabels: Record<string, string> = { quiz: 'Quiz', flashcards: 'Cartes mémoire', fillblank: 'Texte à trous', external: 'Application' }
  const origin = new URL(c.req.url).origin
  const link = `${origin}/#ic-${ic.id}`
  const msg = `📚 Nouveau cours interactif « ${ic.title} » (${typeLabels[ic.course_type] || 'Quiz'}) est disponible ! Ouvrez l'application, rubrique Cours interactifs, ou suivez ce lien : ${link}`
  let sent = 0
  for (const sid of ids.slice(0, 100)) {
    try { await notifyParent(c.env, sid, 'info', 'Nouveau cours interactif', msg); sent++ } catch (e) {}
  }
  return c.json({ ok: true, sent, total: ids.length })
})

// ---------- Telegram : webhook + configuration ----------
// Webhook appelé par Telegram quand un parent écrit au bot
app.post('/api/telegram/webhook', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ ok: true })
  const update = await c.req.json().catch(() => ({}))
  const msg = update.message
  if (!msg?.chat?.id || !msg.text) return c.json({ ok: true })
  const chatId = String(msg.chat.id)
  const text = String(msg.text).trim()
  const tgApi = `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`
  const reply = (t: string) => fetch(tgApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: t, parse_mode: 'HTML' }) })

  // /start → message d'accueil
  if (text.startsWith('/start')) {
    await reply("🏫 <b>Bienvenue sur les notifications de Rahma Academy !</b>\n\nPour recevoir les alertes concernant votre enfant (absences, notes, frais), envoyez simplement votre <b>numéro de téléphone</b> tel qu'enregistré à l'école.\n\nExemple : <code>52517581</code>")
    return c.json({ ok: true })
  }

  // Sinon : on cherche le numéro dans les élèves
  const phone = normPhone(text)
  if (phone.length < 8) {
    await reply('❌ Numéro invalide. Envoyez votre numéro de téléphone (8 chiffres), exemple : <code>52517581</code>')
    return c.json({ ok: true })
  }
  const st = await sb(c.env, `students?select=id,first_name,last_name,parent_phone,parent_name&status=eq.actif`)
  const matches = (st.data || []).filter((s: any) => normPhone(s.parent_phone) === phone)
  if (!matches.length) {
    await reply("❌ Aucun élève trouvé avec ce numéro. Vérifiez que c'est bien le numéro communiqué à l'école, ou contactez l'administration : +216 52 517 581")
    return c.json({ ok: true })
  }
  // Enregistrer la liaison téléphone → chat Telegram
  const chats = await getTelegramChats(c.env)
  chats[phone] = chatId
  await sb(c.env, 'settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ key: 'telegram_chats', value: chats }) })
  const names = matches.map((s: any) => `${s.first_name} ${s.last_name}`).join(', ')
  await reply(`✅ <b>Liaison réussie !</b>\n\nVous recevrez désormais les notifications concernant : <b>${names}</b>\n\n(absences, retards, notes, rappels de frais)`)
  return c.json({ ok: true })
})

// Configurer le webhook Telegram (admin) : enregistre l'URL actuelle auprès de Telegram
app.post('/api/telegram/setup', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: "TELEGRAM_BOT_TOKEN non configuré. Ajoutez-le dans .dev.vars (local) ou les secrets (production)." }, 400)
  const u = new URL(c.req.url)
  const origin = `https://${u.host}` // Telegram exige HTTPS (derrière proxy, le protocole détecté peut être http)
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${origin}/api/telegram/webhook` })
  })
  const data: any = await res.json().catch(() => ({}))
  const me = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getMe`).then(r => r.json()).catch(() => ({} as any))
  return c.json({ ok: data.ok === true, webhook: `${origin}/api/telegram/webhook`, bot: (me as any).result?.username || null, detail: data.description || null })
})

// Statut Telegram : bot + nombre de parents liés
app.get('/api/telegram/status', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ configured: false, linked: 0, bot: null })
  const chats = await getTelegramChats(c.env)
  const me: any = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getMe`).then(r => r.json()).catch(() => ({}))
  return c.json({ configured: true, linked: Object.keys(chats).length, bot: me.result?.username || null })
})

// ---------- Canal d'annonces Telegram ----------
// Publier une annonce sur le canal Telegram de l'école (le bot doit être admin du canal)
// Normalise l'identifiant d'un canal : @nom, nom, -100xxxx ou lien t.me/nom
function normalizeChannel(v: string): string {
  let t = String(v || '').trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
  if (/^-?\d+$/.test(t)) return t
  t = t.replace(/^@/, '')
  return t ? '@' + t : ''
}

// Vérifier un canal auprès de Telegram : existe, n'est pas le bot, le bot en est administrateur (peut poster)
// Test d'alerte monitoring (admin) : envoie un message Telegram de test aux destinataires d'alerte
app.post('/api/admin/health/test-alert', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  await refreshAdminChatsCache(c.env)
  const chats = await adminTelegramChats(c.env)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ ok: false, reason: 'TELEGRAM_BOT_TOKEN manquant' })
  if (!chats.length) return c.json({ ok: false, reason: 'Aucun destinataire : liez le téléphone d\u2019un compte admin au bot Telegram, ou définissez TELEGRAM_ADMIN_CHAT_ID' })
  await healthNotify(c.env, `🔔 <b>Rahma Academy — test d\u2019alerte monitoring</b>\nCe compte recevra les alertes si la base de données devient inaccessible.`)
  return c.json({ ok: true, recipients: chats.length })
})
app.post('/api/telegram/channel/verify', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Bot Telegram non configuré (TELEGRAM_BOT_TOKEN)' }, 400)
  const b = await c.req.json()
  const target = normalizeChannel(b.channel)
  if (!target) return c.json({ error: 'Nom de canal vide' }, 400)
  const api = `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}`
  const me: any = await fetch(`${api}/getMe`).then(r => r.json()).catch(() => ({}))
  const botUser = me.result?.username || ''
  if (botUser && target.toLowerCase() === '@' + botUser.toLowerCase()) {
    return c.json({ error: `« ${target} » est le nom du BOT, pas d'un canal. Créez un canal Telegram (ex : @RahmaAcademyTN), ajoutez le bot @${botUser} comme administrateur, puis saisissez le nom de ce canal.` }, 400)
  }
  const chat: any = await fetch(`${api}/getChat?chat_id=${encodeURIComponent(target)}`).then(r => r.json()).catch(() => ({}))
  if (!chat.ok) return c.json({ error: `Canal introuvable (${chat.description || 'chat not found'}). Vérifiez le nom exact du canal public, ou son identifiant numérique (-100…) pour un canal privé.` }, 404)
  if (!['channel', 'supergroup', 'group'].includes(chat.result?.type)) {
    return c.json({ error: `« ${target} » est un ${chat.result?.type === 'private' ? 'compte utilisateur/bot' : chat.result?.type}, pas un canal.` }, 400)
  }
  const member: any = await fetch(`${api}/getChatMember?chat_id=${encodeURIComponent(target)}&user_id=${me.result?.id}`).then(r => r.json()).catch(() => ({}))
  if (!member.ok && /member list is inaccessible/i.test(member.description || '')) {
    return c.json({ error: `Le canal « ${chat.result.title || target} » existe ✅ mais le bot @${botUser} n'en est pas encore administrateur. Dans Telegram : ouvrez le canal → (nom du canal) → Administrateurs → Ajouter un administrateur → cherchez @${botUser} → cochez « Publier des messages » → Enregistrer. Puis recliquez sur Vérifier.`, step: 'add_admin', title: chat.result.title }, 400)
  }
  const st = member.result?.status
  const canPost = st === 'creator' || (st === 'administrator' && member.result?.can_post_messages !== false)
  if (!canPost) return c.json({ error: `Le bot @${botUser} n'est pas administrateur du canal ${chat.result.title || target} (statut : ${st || 'inconnu'}). Dans Telegram : canal → Administrateurs → Ajouter → @${botUser} → autoriser « Publier des messages ».` }, 400)
  return c.json({ ok: true, chat_id: String(chat.result.id), username: chat.result.username ? '@' + chat.result.username : target, title: chat.result.title, type: chat.result.type, members: chat.result.members_count })
})

app.post('/api/telegram/announce', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Bot Telegram non configuré (TELEGRAM_BOT_TOKEN)' }, 400)
  const b = await c.req.json()
  if (!b.message) return c.json({ error: 'Message requis' }, 400)
  const chan = await getSettings(c.env, 'telegram_channel')
  const target = normalizeChannel(chan.chat_id || chan.username || '')
  if (!target) return c.json({ error: "Aucun canal configuré. Enregistrez le nom du canal dans Paramètres → Notifications → Canal d'annonces Telegram." }, 400)
  const text = `📢 <b>${b.title || 'Annonce'}</b>\n\n${b.message}\n\n— Rahma Academy`
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: target, text, parse_mode: 'HTML' })
  })
  const data: any = await res.json().catch(() => ({}))
  if (data.ok) {
    try { await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: null, type: 'info', title: `📢 ${b.title || 'Annonce'}`, message: b.message, recipient: 'Canal Telegram', sent_via: 'telegram', status: 'sent' }) }) } catch (e) {}
    await audit(c.env, c, user, 'announce', 'telegram_channel', target, null, { title: b.title, message: String(b.message).slice(0, 200) })
    return c.json({ ok: true })
  }
  // Messages d'erreur Telegram traduits en actions concrètes
  const d = String(data.description || '')
  let hint = d
  if (/can't send messages to the bot/i.test(d)) hint = "Le canal configuré est le nom du BOT lui-même. Saisissez le nom d'un vrai canal Telegram dans Paramètres → Notifications."
  else if (/chat not found/i.test(d)) hint = 'Canal introuvable : vérifiez le nom exact (canal public) ou utilisez son identifiant numérique (canal privé).'
  else if (/not enough rights|CHAT_WRITE_FORBIDDEN|need administrator rights/i.test(d)) hint = "Le bot n'est pas administrateur du canal ou n'a pas le droit « Publier des messages »."
  else if (/member list is inaccessible|bot is not a member|not a member/i.test(d)) hint = "Le bot n'est pas (encore) administrateur du canal. Dans Telegram : ouvrez le canal → Administrateurs → Ajouter un administrateur → @RahmaEcoleBot → cochez « Publier des messages »."
  else if (/bot was kicked/i.test(d)) hint = 'Le bot a été retiré du canal : ajoutez-le de nouveau comme administrateur.'
  return c.json({ ok: false, error: hint, detail: d }, 400)
})

// ---------- Messagerie interne (Discussions parents <-> administration) ----------
// Stockée dans notifications avec type='chat' : un fil par élève.
// title = 'staff:Nom' ou 'parent:Nom' (expéditeur), sent_via='chat', status='unread'|'read'
const isChatStaff = (u: any) => ['admin', 'teacher'].includes(u?.role)
const fromParent = (m: any) => (m.title || '').startsWith('parent:')

// Liste des fils de discussion
app.get('/api/chat/threads', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (isChatStaff(user)) {
    // Enseignant : uniquement les fils de ses élèves affectés
    let teacherFilter: number[] | null = null
    if (user.role === 'teacher') {
      teacherFilter = await teacherAssignedIds(c.env, user)
      if (teacherFilter !== null && !teacherFilter.length) return c.json([])
    }
    const tf = teacherFilter ? `&student_id=in.(${teacherFilter.join(',')})` : ''
    const r = await sb(c.env, `notifications?type=eq.chat${tf}&select=id,student_id,title,message,status,created_at,students(first_name,last_name,level,parent_name)&order=created_at.desc&limit=500`)
    const threads: Record<string, any> = {}
    for (const m of (r.data || [])) {
      if (!m.student_id) continue
      if (!threads[m.student_id]) threads[m.student_id] = { student_id: m.student_id, student: m.students, last: { message: m.message, created_at: m.created_at, title: m.title }, unread: 0 }
      if (m.status === 'unread' && fromParent(m)) threads[m.student_id].unread++
    }
    return c.json(Object.values(threads))
  }
  // Parent / élève : un fil par enfant lié (même vide)
  const ids = linkedIds(user)
  if (!ids.length) return c.json([])
  const st = await sb(c.env, `students?id=in.(${ids.join(',')})&select=id,first_name,last_name,level`)
  const r = await sb(c.env, `notifications?type=eq.chat&student_id=in.(${ids.join(',')})&select=id,student_id,title,message,status,created_at&order=created_at.desc&limit=300`)
  const threads = (st.data || []).map((s: any) => {
    const msgs = (r.data || []).filter((m: any) => m.student_id === s.id)
    const unread = msgs.filter((m: any) => m.status === 'unread' && !fromParent(m)).length
    return { student_id: s.id, student: s, last: msgs[0] ? { message: msgs[0].message, created_at: msgs[0].created_at, title: msgs[0].title } : null, unread }
  })
  return c.json(threads)
})

// Messages d'un fil (et marquage lu des messages reçus)
app.get('/api/chat/messages/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if (!sid) return c.json({ error: 'Élève invalide' }, 400)
  if (!isChatStaff(user) && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  const r = await sb(c.env, `notifications?type=eq.chat&student_id=eq.${sid}&select=id,student_id,title,message,status,created_at&order=created_at.asc&limit=300`)
  const msgs = r.data || []
  // Marquer lus les messages envoyés par l'autre partie
  const staff = isChatStaff(user)
  const unreadIds = msgs.filter((m: any) => m.status === 'unread' && (staff ? fromParent(m) : !fromParent(m))).map((m: any) => m.id)
  if (unreadIds.length) {
    try { await sb(c.env, `notifications?id=in.(${unreadIds.join(',')})`, { method: 'PATCH', body: JSON.stringify({ status: 'read' }) }) } catch (e) {}
  }
  return c.json(msgs)
})

// Envoyer un message dans un fil
app.post('/api/chat/send', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json()
  const sid = Number(b.student_id)
  const text = String(b.text || '').trim().slice(0, 2000)
  if (!sid || !text) return c.json({ error: 'Message vide' }, 400)
  const staff = isChatStaff(user)
  if (!staff && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  // Expéditeur : ajouter la matière de l'enseignant (title = 'staff:Nom|Matière')
  let senderLabel = user.name || ''
  if (user.role === 'teacher') {
    try {
      const tid = await getTeacherId(c.env, user)
      if (tid) {
        const t = await sb(c.env, `teachers?id=eq.${tid}&select=subject`)
        const subj = t.data?.[0]?.subject
        if (subj) senderLabel = `${user.name || ''}|${subj}`
      }
    } catch (e) { /* non bloquant */ }
  }
  const row = { student_id: sid, type: 'chat', title: `${staff ? 'staff' : 'parent'}:${senderLabel}`, message: text, sent_via: 'chat', status: 'unread' }
  const r = await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur envoi', detail: r.data }, 500)
  // Réponse du staff -> prévenir le parent sur Telegram (non bloquant)
  if (staff) {
    try {
      const st = await sb(c.env, `students?id=eq.${sid}&select=first_name,last_name,parent_phone`)
      const s = st.data?.[0]
      if (s?.parent_phone) await sendTelegram(c.env, s.parent_phone, `💬 <b>Nouveau message de l'administration</b>\n\n${text}\n\n— Rahma Academy (à propos de ${s.first_name} ${s.last_name})\nRépondez depuis votre espace parent : rubrique « Discussions ».`)
    } catch (e) { /* non bloquant */ }
  }
  return c.json(Array.isArray(r.data) ? r.data[0] : r.data, 201)
})

// ---------- Devoirs à rendre (الواجبات المنزلية) ----------
let _hwSupported: { ok: boolean; at: number } | null = null
async function hwSupported(env: Bindings) {
  if (_hwSupported && (_hwSupported.ok || Date.now() - _hwSupported.at < 300000)) return _hwSupported.ok
  const p = await sb(env, 'homeworks?select=id&limit=1'); _hwSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
const HW_SEL = 'select=*,subjects(name),teachers(first_name,last_name,subject)'
// Portée : élèves visibles par l'utilisateur (ids) et niveaux
async function hwScope(env: Bindings, user: any): Promise<{ studentIds: number[] | null; levels: string[] | null; teacherId: number | null }> {
  if (user.role === 'admin') return { studentIds: null, levels: null, teacherId: null }
  if (user.role === 'teacher') { const ids = await teacherAssignedIds(env, user); const tid = await getTeacherId(env, user); const lv = await userLevels(env, user); return { studentIds: ids, levels: lv, teacherId: tid } }
  const ids = linkedIds(user); const lv = await userLevels(env, user)
  return { studentIds: ids, levels: lv, teacherId: null }
}
async function hwNotifyPublish(env: Bindings, origin: string, hw: any, user: any) {
  const sname = hw.subjects?.name || (hw.subject_id ? (await sb(env, `subjects?id=eq.${hw.subject_id}&select=name`)).data?.[0]?.name : '') || ''
  const due = new Date(hw.due_at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  await broadcastTargeted(env, origin, { type: 'cours', title: `📚 Nouveau devoir${sname ? ' de ' + sname : ''} (${hw.level})`, message: `« ${hw.title} » à rendre pour le ${due}. — واجب منزلي جديد`, level: hw.level, ref_table: 'homeworks', ref_id: Number(hw.id), link: `#homeworks`, created_by: user?.id })
}

// Liste (filtrée par rôle) + progression
app.get('/api/homeworks', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await hwSupported(c.env))) return c.json({ supported: false, items: [] })
  const sc = await hwScope(c.env, user)
  let q = `homeworks?${HW_SEL}&order=due_at.desc&limit=300`
  if (user.role === 'teacher') { if (!sc.teacherId) return c.json({ supported: true, items: [] }); q += c.req.query('mine') === '0' && sc.levels?.length ? `&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})` : `&teacher_id=eq.${sc.teacherId}` }
  if (['parent', 'student'].includes(user.role)) { if (!sc.levels?.length) return c.json({ supported: true, items: [] }); q += `&status=neq.draft&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})` }
  const r = await sb(c.env, q)
  const items = r.data || []
  if (!items.length) return c.json({ supported: true, items: [] })
  // Dépôts (portée élèves) + effectif par niveau
  let sq = `homework_submissions?homework_id=in.(${items.map((h: any) => h.id).join(',')})&select=id,homework_id,student_id,status,score,is_late,submitted_at,feedback,files,content,students(first_name,last_name,level)`
  if (sc.studentIds) { if (!sc.studentIds.length) sq += '&student_id=eq.0'; else sq += `&student_id=in.(${sc.studentIds.join(',')})` }
  const subs = (await sb(c.env, sq)).data || []
  const levels = Array.from(new Set(items.map((h: any) => h.level)))
  let stq = `students?status=eq.actif&level=in.(${levels.map(l => `"${l}"`).join(',')})&select=id,level`
  if (sc.studentIds) stq += sc.studentIds.length ? `&id=in.(${sc.studentIds.join(',')})` : '&id=eq.0'
  const studs = (await sb(c.env, stq)).data || []
  const now = Date.now()
  const out = items.map((h: any) => {
    const hs = subs.filter((s: any) => s.homework_id === h.id)
    const total = studs.filter((s: any) => s.level === h.level).length
    return { ...h, total_students: total, submitted: hs.length, graded: hs.filter((s: any) => s.status !== 'submitted').length, overdue: new Date(h.due_at).getTime() < now, my_submissions: ['parent', 'student'].includes(user.role) ? hs : undefined }
  })
  return c.json({ supported: true, items: out })
})

// Créer / modifier / fermer / supprimer (enseignant pour ses devoirs, admin tout)
app.post('/api/homeworks', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!b.title || !b.level || !b.due_at) return c.json({ error: 'Titre, niveau et date limite requis' }, 400)
  const tid = user.role === 'teacher' ? await getTeacherId(c.env, user) : (b.teacher_id || null)
  const row: any = { title: b.title, instructions: b.instructions || null, subject_id: b.subject_id || null, level: b.level, teacher_id: tid, due_at: b.due_at, attachment_url: b.attachment_url || null, attachment_name: b.attachment_name || null, max_points: Number(b.max_points) > 0 ? Number(b.max_points) : 20, allow_late: b.allow_late !== false, count_in_term: !!b.count_in_term, trimester: [1, 2, 3].includes(Number(b.trimester)) ? Number(b.trimester) : 1, status: ['draft', 'published'].includes(b.status) ? b.status : 'published', created_by: user.id, school_year: await currentYear(c.env) }
  const r = await sb(c.env, `homeworks?${HW_SEL}`, { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur création', detail: r.data }, 500)
  const hw = r.data[0]
  await audit(c.env, c, user, 'create', 'homeworks', hw.id, null, row)
  if (hw.status === 'published') { try { await hwNotifyPublish(c.env, publicOrigin(c), hw, user) } catch {} }
  return c.json(hw, 201)
})
app.put('/api/homeworks/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `homeworks?id=eq.${id}&${HW_SEL}`)).data?.[0]
  if (!before) return c.json({ error: 'Devoir introuvable' }, 404)
  if (user.role === 'teacher' && Number(before.teacher_id) !== await getTeacherId(c.env, user)) return c.json({ error: 'Vous ne pouvez modifier que vos devoirs' }, 403)
  const b = await c.req.json(); const patch: any = {}
  for (const k of ['title', 'instructions', 'subject_id', 'level', 'due_at', 'attachment_url', 'attachment_name', 'max_points', 'allow_late', 'count_in_term', 'trimester', 'status']) if (k in b) patch[k] = b[k]
  const r = await sb(c.env, `homeworks?id=eq.${id}&${HW_SEL}`, { method: 'PATCH', body: JSON.stringify(patch) })
  await audit(c.env, c, user, 'update', 'homeworks', id, before, patch)
  if (before.status === 'draft' && patch.status === 'published') { try { await hwNotifyPublish(c.env, publicOrigin(c), r.data?.[0] || before, user) } catch {} }
  return c.json(r.data?.[0] || { ok: r.ok })
})
app.delete('/api/homeworks/:id', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Devoir introuvable' }, 404)
  if (user.role === 'teacher' && Number(before.teacher_id) !== await getTeacherId(c.env, user)) return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, `homeworks?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: user.id }) })
  await audit(c.env, c, user, 'soft_delete', 'homeworks', id, before, null)
  return c.json({ ok: r.ok, soft: true })
})

// Dépôt (élève pour lui-même, parent pour un enfant lié) — création ou remplacement avant correction
app.post('/api/homeworks/:id/submit', async (c) => {
  const user = await getUser(c)
  if (!user || !['student', 'parent'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const b = await c.req.json()
  const sid = Number(b.student_id || (user.role === 'student' ? linkedIds(user)[0] : 0))
  if (!sid || !linkedIds(user).includes(sid)) return c.json({ error: 'Élève non lié à votre compte' }, 403)
  const hw = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!hw || hw.status !== 'published') return c.json({ error: 'Devoir indisponible' }, 404)
  const st = (await sb(c.env, `students?id=eq.${sid}&select=level,first_name,last_name`)).data?.[0]
  if (!st || st.level !== hw.level) return c.json({ error: "Ce devoir ne concerne pas le niveau de l'élève" }, 400)
  const late = Date.now() > new Date(hw.due_at).getTime()
  if (late && !hw.allow_late) return c.json({ error: 'Date limite dépassée : le dépôt tardif n\'est pas autorisé pour ce devoir.' }, 423)
  const files = Array.isArray(b.files) ? b.files.slice(0, 5) : []
  if (!String(b.content || '').trim() && !files.length) return c.json({ error: 'Ajoutez une réponse ou un fichier' }, 400)
  const existing = (await sb(c.env, `homework_submissions?homework_id=eq.${id}&student_id=eq.${sid}&select=id,status`)).data?.[0]
  if (existing && existing.status !== 'submitted') return c.json({ error: 'Ce devoir a déjà été corrigé : dépôt verrouillé.' }, 423)
  const row = { homework_id: id, student_id: sid, content: b.content || null, files, submitted_at: new Date().toISOString(), submitted_by: user.id, is_late: late, status: 'submitted' }
  const r = existing ? await sb(c.env, `homework_submissions?id=eq.${existing.id}`, { method: 'PATCH', body: JSON.stringify(row) }) : await sb(c.env, 'homework_submissions', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: 'Erreur dépôt', detail: r.data }, 500)
  await audit(c.env, c, user, existing ? 'update' : 'create', 'homework_submissions', r.data?.[0]?.id, null, { homework_id: id, student_id: sid, late })
  // Notifier l'enseignant (in-app, groupé par devoir : une notification par dépôt mais ciblée sur l'auteur du devoir)
  try {
    if (hw.created_by) await sb(c.env, 'notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ student_id: sid, type: 'info', title: `📥 Dépôt reçu — ${hw.title}`, message: `${st.first_name} ${st.last_name} (${st.level}) a rendu le devoir${late ? ' (en retard)' : ''}.`, recipient: 'enseignant', sent_via: 'app', status: 'sent', audience: ['teacher'], level: hw.level, ref_table: 'homeworks', ref_id: id, link: '#homeworks', school_year: hw.school_year }) })
  } catch {}
  return c.json(r.data?.[0], existing ? 200 : 201)
})

// Correction (enseignant auteur / admin) : note + commentaire (+ report dans grades si count_in_term)
app.post('/api/homeworks/:id/grade', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const b = await c.req.json()
  const hw = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!hw) return c.json({ error: 'Devoir introuvable' }, 404)
  const tid = user.role === 'teacher' ? await getTeacherId(c.env, user) : null
  if (user.role === 'teacher' && Number(hw.teacher_id) !== tid) return c.json({ error: 'Vous ne pouvez corriger que vos devoirs' }, 403)
  const sid = Number(b.student_id)
  const score = b.score === null || b.score === '' ? null : Number(b.score)
  if (score !== null && (isNaN(score) || score < 0 || score > Number(hw.max_points))) return c.json({ error: `Note entre 0 et ${hw.max_points}` }, 400)
  let sub = (await sb(c.env, `homework_submissions?homework_id=eq.${id}&student_id=eq.${sid}&select=*`)).data?.[0]
  if (!sub) { // non rendu : créer une ligne « non rendu » notée (ex. 0)
    const r = await sb(c.env, 'homework_submissions', { method: 'POST', body: JSON.stringify({ homework_id: id, student_id: sid, content: null, files: [], is_late: true, status: 'submitted', submitted_by: null }) })
    sub = r.data?.[0]; if (!sub) return c.json({ error: 'Impossible de créer la ligne', detail: r.data }, 500)
  }
  const patch: any = { score, feedback: b.feedback ?? sub.feedback ?? null, corrected_file_url: b.corrected_file_url ?? sub.corrected_file_url ?? null, status: score !== null ? 'graded' : 'submitted', graded_by: user.id, graded_at: new Date().toISOString() }
  // Report dans le carnet (grades) : une note exam_type='devoir' liée par grade_id, mise à jour si déjà reportée
  if (score !== null && (b.count_in_term ?? hw.count_in_term)) {
    const scaled = Math.round(score / Number(hw.max_points || 20) * 20 * 100) / 100
    const g = { student_id: sid, subject_id: hw.subject_id, trimester: hw.trimester || 1, score: scaled, max_score: 20, exam_type: 'devoir', comment: `Devoir : ${hw.title}`, teacher_id: hw.teacher_id }
    if (sub.grade_id) await sb(c.env, `grades?id=eq.${sub.grade_id}`, { method: 'PATCH', body: JSON.stringify({ score: scaled }) })
    else if (hw.subject_id) { const gr = await sb(c.env, 'grades', { method: 'POST', body: JSON.stringify(g) }); if (gr.ok) patch.grade_id = gr.data?.[0]?.id }
  }
  const r = await sb(c.env, `homework_submissions?id=eq.${sub.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  await audit(c.env, c, user, 'grade', 'homework_submissions', sub.id, { score: sub.score, status: sub.status }, patch)
  // Notifier élève + parent
  if (score !== null) { try { await notifyParent(c.env, sid, 'note', `✅ Devoir corrigé — ${hw.title}`, `Note : ${score}/${hw.max_points}.${b.feedback ? ' Commentaire : ' + String(b.feedback).slice(0, 200) : ''}`) } catch {} }
  return c.json(r.data?.[0] || { ok: r.ok })
})

// Relancer les élèves qui n'ont pas rendu (enseignant / admin)
app.post('/api/homeworks/:id/remind', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const hw = (await sb(c.env, `homeworks?id=eq.${id}&select=*`)).data?.[0]
  if (!hw) return c.json({ error: 'Devoir introuvable' }, 404)
  const sc = await hwScope(c.env, user)
  let q = `students?status=eq.actif&level=eq.${encodeURIComponent(hw.level)}&select=id`
  if (sc.studentIds) q += sc.studentIds.length ? `&id=in.(${sc.studentIds.join(',')})` : '&id=eq.0'
  const studs = ((await sb(c.env, q)).data || []).map((s: any) => Number(s.id))
  const done = new Set(((await sb(c.env, `homework_submissions?homework_id=eq.${id}&select=student_id`)).data || []).map((s: any) => Number(s.student_id)))
  const missing = studs.filter(x => !done.has(x))
  const due = new Date(hw.due_at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  let sent = 0
  for (const sid of missing.slice(0, 100)) { try { await notifyParent(c.env, sid, 'info', `⏰ Devoir à rendre — ${hw.title}`, `Le devoir « ${hw.title} » (${hw.level}) est attendu pour le ${due}. Il n'a pas encore été rendu. — تذكير بواجب منزلي`); sent++ } catch {} }
  await audit(c.env, c, user, 'remind', 'homeworks', id, null, { missing: missing.length, sent })
  return c.json({ ok: true, missing: missing.length, sent })
})

// Rappel automatique J-1 (intégré à la maintenance quotidienne) : élèves du niveau n'ayant pas rendu
async function dailyHomeworkReminders(env: Bindings) {
  if (!(await hwSupported(env))) return
  const today = new Date().toISOString().slice(0, 10)
  const last = await getSettings(env, 'homework_reminders_maintenance')
  if (last.last_run === today) return
  await sb(env, 'settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: 'homework_reminders_maintenance', value: { last_run: today } }) })
  const from = new Date(); from.setUTCDate(from.getUTCDate() + 1); from.setUTCHours(0, 0, 0, 0)
  const to = new Date(from); to.setUTCDate(to.getUTCDate() + 1)
  const hws = (await sb(env, `homeworks?status=eq.published&due_at=gte.${from.toISOString()}&due_at=lt.${to.toISOString()}&select=*`)).data || []
  for (const hw of hws) {
    const studs = ((await sb(env, `students?status=eq.actif&level=eq.${encodeURIComponent(hw.level)}&select=id`)).data || []).map((s: any) => Number(s.id))
    const done = new Set(((await sb(env, `homework_submissions?homework_id=eq.${hw.id}&select=student_id`)).data || []).map((s: any) => Number(s.student_id)))
    const due = new Date(hw.due_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    for (const sid of studs.filter(x => !done.has(x)).slice(0, 100)) { try { await notifyParent(env, sid, 'info', `⏰ Devoir à rendre demain — ${hw.title}`, `Rappel : « ${hw.title} » (${hw.level}) est à rendre demain à ${due}. — الواجب المنزلي غداً`) } catch {} }
  }
}

// Compteur pour le badge menu : élève/parent = devoirs publiés non rendus ; enseignant = dépôts à corriger
app.get('/api/homeworks/badge', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await hwSupported(c.env))) return c.json({ count: 0 })
  const sc = await hwScope(c.env, user)
  if (user.role === 'teacher') {
    if (!sc.teacherId) return c.json({ count: 0 })
    const hws = ((await sb(c.env, `homeworks?teacher_id=eq.${sc.teacherId}&status=eq.published&select=id`)).data || []).map((h: any) => h.id)
    if (!hws.length) return c.json({ count: 0 })
    const subs = (await sb(c.env, `homework_submissions?homework_id=in.(${hws.join(',')})&status=eq.submitted&select=id`)).data || []
    return c.json({ count: subs.length })
  }
  if (['parent', 'student'].includes(user.role)) {
    if (!sc.levels?.length || !sc.studentIds?.length) return c.json({ count: 0 })
    const hws = (await sb(c.env, `homeworks?status=eq.published&level=in.(${sc.levels.map(l => `"${l}"`).join(',')})&select=id,level`)).data || []
    if (!hws.length) return c.json({ count: 0 })
    const studs = (await sb(c.env, `students?id=in.(${sc.studentIds.join(',')})&select=id,level`)).data || []
    const subs = (await sb(c.env, `homework_submissions?homework_id=in.(${hws.map((h: any) => h.id).join(',')})&student_id=in.(${sc.studentIds.join(',')})&select=homework_id,student_id`)).data || []
    const doneKey = new Set(subs.map((s: any) => `${s.homework_id}:${s.student_id}`))
    let count = 0
    for (const h of hws) for (const s of studs) if (s.level === h.level && !doneKey.has(`${h.id}:${s.id}`)) count++
    return c.json({ count })
  }
  return c.json({ count: 0 })
})

// ---------- Upload fichiers (photos élèves & cours) vers Supabase Storage ----------
app.post('/api/upload/:bucket', async (c) => {
  const user = await getUser(c)
  const bucket = c.req.param('bucket')
  if (!['photos', 'courses', 'homeworks'].includes(bucket)) return c.json({ error: 'Bucket invalide' }, 400)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (bucket !== 'homeworks' && !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json() // { filename, contentType, data(base64) }
  if (bucket === 'homeworks') {
    if (!/^(application\/pdf|image\/(jpeg|png|webp)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(b.contentType || '')) return c.json({ error: 'Format non autorisé (PDF, JPG, PNG, WEBP, DOCX)' }, 400)
    if ((b.data || '').length * 0.75 > 10 * 1024 * 1024) return c.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, 400)
  }
  const bin = Uint8Array.from(atob(b.data), ch => ch.charCodeAt(0))
  const safe = (b.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${Date.now()}_${safe}`
  const { url, key } = cfg(c.env)
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': b.contentType || 'application/octet-stream' },
    body: bin
  })
  if (!res.ok) return c.json({ error: 'Erreur upload', detail: await res.text() }, 500)
  return c.json({ url: `${url}/storage/v1/object/public/${bucket}/${path}`, path })
})

// ---------- Statistiques dashboard ----------
app.get('/api/stats', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  // Maintenance quotidienne des frais (mensualités + retards) — 1×/jour, non bloquante
  try { await dailyFeesMaintenance(c.env) } catch (e) { /* non bloquant */ }
  try { await dailyExamReminders(c.env, publicOrigin(c)) } catch (e) { /* non bloquant */ }
  try { await dailyHomeworkReminders(c.env) } catch (e) { /* non bloquant */ }
  if (!_adminChatsCache || Date.now() - _adminChatsCache.at > 3600_000) refreshAdminChatsCache(c.env).catch(() => {})
  let ids = linkedIds(user)
  let scoped = (user.role === 'parent' || user.role === 'student') && ids.length > 0
  // Enseignant : statistiques limitées à ses élèves affectés
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null) { ids = aids.length ? aids : [0]; scoped = true }
  }
  const idFilter = scoped ? `&student_id=in.(${ids.join(',')})` : ''
  const stFilter = scoped ? `&id=in.(${ids.join(',')})` : ''
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const [students, teachers, fees, attToday, attMonth, notifs] = await Promise.all([
    sb(c.env, `students?select=id,cycle,status${stFilter}`),
    sb(c.env, 'teachers?select=id'),
    sb(c.env, `fees?select=id,amount,status${idFilter}`),
    sb(c.env, `attendance?date=eq.${today}&select=status${idFilter}`),
    sb(c.env, `attendance?date=gte.${monthStart}&select=status,student_id${idFilter}`),
    sb(c.env, `notifications?select=id,type,title,message,created_at,student_id&order=created_at.desc&limit=10${idFilter}`)
  ])
  const feesArr = fees.data || []
  return c.json({
    students: { total: (students.data || []).length, byCycle: (students.data || []).reduce((a: any, s: any) => { a[s.cycle] = (a[s.cycle] || 0) + 1; return a }, {}) },
    teachers: (teachers.data || []).length,
    fees: {
      paid: feesArr.filter((f: any) => f.status === 'paid').reduce((s: number, f: any) => s + Number(f.amount), 0),
      pending: feesArr.filter((f: any) => f.status === 'pending').reduce((s: number, f: any) => s + Number(f.amount), 0),
      overdue: feesArr.filter((f: any) => f.status === 'overdue').reduce((s: number, f: any) => s + Number(f.amount), 0)
    },
    attendanceToday: (attToday.data || []).reduce((a: any, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {}),
    attendanceMonth: (attMonth.data || []).reduce((a: any, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {}),
    notifications: notifs.data || []
  })
})

// ---------- Bulletin (données agrégées) ----------
app.get('/api/bulletin/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if ((user.role === 'parent' || user.role === 'student') && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  const trimester = c.req.query('trimester') || '1'
  const [st, gr, school] = await Promise.all([
    sb(c.env, `students?id=eq.${sid}&select=*`),
    sb(c.env, `grades?student_id=eq.${sid}&trimester=eq.${trimester}&select=*,subjects(name,coefficient)`),
    getSettings(c.env, 'school')
  ])
  const student = st.data?.[0]
  if (!student) return c.json({ error: 'Élève introuvable' }, 404)
  const grades = gr.data || []
  const bySubject: any = {}
  for (const g of grades) {
    const name = g.subjects?.name || 'Matière'
    if (!bySubject[name]) bySubject[name] = { name, coefficient: Number(g.subjects?.coefficient || 1), scores: [], comments: [] }
    bySubject[name].scores.push(Number(g.score) * 20 / Number(g.max_score || 20))
    if (g.comment) bySubject[name].comments.push(g.comment)
  }
  const subjects = Object.values(bySubject).map((s: any) => ({ ...s, average: s.scores.reduce((a: number, b: number) => a + b, 0) / s.scores.length }))
  const totalCoef = subjects.reduce((a: number, s: any) => a + s.coefficient, 0)
  const generalAverage = totalCoef ? subjects.reduce((a: number, s: any) => a + s.average * s.coefficient, 0) / totalCoef : 0
  // Signature parentale (accusé de lecture) pour ce bulletin, si la migration 0011 est appliquée
  let signature: any = null; let signSupported = false
  if (await sigSupported(c.env)) {
    signSupported = true
    const sg = await sb(c.env, `bulletin_signatures?student_id=eq.${sid}&trimester=eq.${trimester}&select=*`)
    signature = sg.data?.[0] || null
  }
  const fingerprint = await sha256Hex(bulletinFingerprintSource(grades, generalAverage))
  return c.json({ student, school, trimester: Number(trimester), subjects, generalAverage, gradesCount: grades.length, fingerprint, signature, signSupported, canSign: signSupported && user.role === 'parent' && !signature && grades.length > 0 })
})

// ---------- Progression par matière (graphes trimestre par trimestre) ----------
app.get('/api/progress/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if ((user.role === 'parent' || user.role === 'student') && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé' }, 403) }
  const st = (await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name`)).data?.[0]
  if (!st) return c.json({ error: 'Élève introuvable' }, 404)
  const yr = activeYear() || _currentYearCache?.label || null
  // Notes de l'élève (année active) + notes du niveau (comparaison) + historique toutes années (moyenne générale par année/trimestre)
  const [mine, level, hist, att] = await Promise.all([
    sb(c.env, `grades?student_id=eq.${sid}&select=subject_id,trimester,score,max_score,exam_type,created_at,subjects(name,coefficient)`),
    Promise.resolve(null),
    sb(c.env, `grades?student_id=eq.${sid}&select=trimester,score,max_score,school_year,subjects(coefficient)&school_year=not.is.null`),
    sb(c.env, `attendance?student_id=eq.${sid}&select=status,date`)
  ])
  // Comparaison : notes des élèves du même niveau (année active)
  const peersIds = ((await sb(c.env, `students?level=eq.${encodeURIComponent(st.level)}&status=eq.actif&select=id`)).data || []).map((x: any) => x.id)
  const peers = peersIds.length ? (await sb(c.env, `grades?student_id=in.(${peersIds.join(',')})&select=student_id,subject_id,trimester,score,max_score,subjects(coefficient)`)).data || [] : []
  const n20 = (g: any) => Number(g.score) * 20 / Number(g.max_score || 20)
  // Par matière × trimestre
  const subjects: Record<string, any> = {}
  for (const g of mine.data || []) {
    const name = g.subjects?.name || 'Matière'; const t = Number(g.trimester)
    subjects[name] = subjects[name] || { name, coefficient: Number(g.subjects?.coefficient || 1), byTrim: { 1: [], 2: [], 3: [] }, notes: [] }
    if (subjects[name].byTrim[t]) subjects[name].byTrim[t].push(n20(g))
    subjects[name].notes.push({ trimester: t, score: Number(g.score), max_score: Number(g.max_score || 20), exam_type: g.exam_type, date: g.created_at })
  }
  const avg = (a: number[]) => a.length ? Number((a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)) : null
  // Moyenne du niveau par matière × trimestre
  const peerBy: Record<string, Record<number, Record<number, number[]>>> = {} // subject_id → trimester → student → scores
  for (const g of peers) { const sj = g.subject_id, t = Number(g.trimester); peerBy[sj] = peerBy[sj] || {}; peerBy[sj][t] = peerBy[sj][t] || {}; (peerBy[sj][t][g.student_id] = peerBy[sj][t][g.student_id] || []).push(n20(g)) }
  const subjIdByName: Record<string, number> = {}; for (const g of mine.data || []) subjIdByName[g.subjects?.name || 'Matière'] = g.subject_id
  const out = Object.values(subjects).map((s: any) => {
    const sjId = subjIdByName[s.name]
    const trims = [1, 2, 3].map(t => {
      const me = avg(s.byTrim[t])
      const peerAvgs = Object.values(peerBy[sjId]?.[t] || {}).map((arr: any) => avg(arr)).filter((x: any) => x !== null) as number[]
      const cls = avg(peerAvgs); const rank = me !== null ? peerAvgs.filter(x => x > me).length + 1 : null
      return { trimester: t, average: me, class_average: cls, rank, class_size: peerAvgs.length }
    })
    const vals = trims.map(x => x.average).filter(x => x !== null) as number[]
    const trend = vals.length >= 2 ? Number((vals[vals.length - 1] - vals[vals.length - 2]).toFixed(2)) : null
    return { name: s.name, coefficient: s.coefficient, trimesters: trims, trend, notes: s.notes.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')) }
  }).sort((a, b) => a.name.localeCompare(b.name))
  // Moyenne générale par trimestre (élève et niveau)
  const general = [1, 2, 3].map(t => {
    let tc = 0, tot = 0
    for (const s of out) { const m = s.trimesters[t - 1].average; if (m !== null) { tc += s.coefficient; tot += m * s.coefficient } }
    // niveau : moyenne générale par élève puis moyenne
    const perStudent: Record<number, { tc: number; tot: number }> = {}
    for (const g of peers) { if (Number(g.trimester) !== t) continue; const coef = Number(g.subjects?.coefficient || 1); perStudent[g.student_id] = perStudent[g.student_id] || { tc: 0, tot: 0 } }
    for (const [sj, byT] of Object.entries(peerBy)) { const byS = byT[t] || {}; for (const [stu, arr] of Object.entries(byS)) { const coef = Number((peers.find((g: any) => g.subject_id === Number(sj))?.subjects?.coefficient) || 1); const m = avg(arr as number[])!; perStudent[Number(stu)] = perStudent[Number(stu)] || { tc: 0, tot: 0 }; perStudent[Number(stu)].tc += coef; perStudent[Number(stu)].tot += m * coef } }
    const classAvgs = Object.values(perStudent).filter(x => x.tc > 0).map(x => x.tot / x.tc)
    const me = tc ? Number((tot / tc).toFixed(2)) : null
    return { trimester: t, average: me, class_average: avg(classAvgs), rank: me !== null ? classAvgs.filter(x => x > me).length + 1 : null, class_size: classAvgs.length }
  })
  // Historique pluriannuel (moyenne générale par année/trimestre)
  const histBy: Record<string, Record<number, { tc: number; tot: number; bySub: Record<string, number[]> }>> = {}
  for (const g of hist.data || []) { const y = g.school_year, t = Number(g.trimester); histBy[y] = histBy[y] || {}; histBy[y][t] = histBy[y][t] || { tc: 0, tot: 0, bySub: {} } }
  // simplification : moyenne simple des notes /20 par année-trimestre (les coefficients par matière nécessitent subject_id ; acceptable pour une tendance)
  const histSimple: Record<string, Record<number, number[]>> = {}
  for (const g of hist.data || []) { const y = g.school_year, t = Number(g.trimester); histSimple[y] = histSimple[y] || {}; (histSimple[y][t] = histSimple[y][t] || []).push(n20(g)) }
  const history = Object.keys(histSimple).sort().map(y => ({ school_year: y, trimesters: [1, 2, 3].map(t => avg(histSimple[y][t] || [])) }))
  // Assiduité par trimestre (année active) : T1 sept-déc, T2 janv-mars, T3 avr-juin
  const trimOf = (d: string) => { const m = Number(d.slice(5, 7)); return m >= 9 ? 1 : m <= 3 ? 2 : 3 }
  const attendance = [1, 2, 3].map(t => { const rows = (att.data || []).filter((a: any) => trimOf(a.date) === t); const abs = rows.filter((a: any) => a.status === 'absent').length; return { trimester: t, days: rows.length, absences: abs, lates: rows.filter((a: any) => a.status === 'retard').length, rate: rows.length ? Math.round((rows.length - abs) * 100 / rows.length) : null } })
  return c.json({ student: st, school_year: yr, subjects: out, general, history, attendance })
})

// ---------- Import Excel en masse (admin) : élèves / notes ----------
const IMPORT_LEVELS = ['1AP','2AP','3AP','4AP','5AP','6AP','7AB','8AB','9AB','1AS','2AS','3AS','4AS']
function normLevel(v: any): string | null {
  const t = String(v || '').toUpperCase().replace(/\s+/g, '').replace('ÈME', '').replace('ÈRE', '').replace('EME', '').replace('ERE', '')
  if (IMPORT_LEVELS.includes(t)) return t
  const m = t.match(/^(\d)(AP|AB|AS|P|B|S)$/); if (m) { const x = m[1] + (m[2].length === 1 ? 'A' + m[2] : m[2]); if (IMPORT_LEVELS.includes(x)) return x }
  return null
}
function normDate(v: any): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(+d) ? null : d.toISOString().slice(0, 10) } // série Excel
  const t = String(v).trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
// Élèves : { rows:[{national_id, first_name, last_name, birth_date, gender, level, class_name, parent_name, parent_phone, parent_email, address, monthly_fee}], dry_run }
app.post('/api/admin/import/students', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const rows: any[] = Array.isArray(b.rows) ? b.rows.slice(0, 2000) : []
  const dry = !!b.dry_run; const mode = b.mode === 'update' ? 'update' : 'skip' // doublon d'identifiant : ignorer ou mettre à jour
  const existing = (await sb(c.env, `students?select=id,national_id,first_name,last_name,level&national_id=not.is.null&limit=5000`)).data || []
  const byNid: Record<string, any> = {}; existing.forEach((e: any) => { byNid[e.national_id] = e })
  const seen = new Set<string>()
  const report: any[] = []; const toInsert: any[] = []; const toUpdate: any[] = []
  rows.forEach((r, i) => {
    const line = r._line || i + 2; const errs: string[] = []
    const nid = String(r.national_id || '').replace(/\D/g, '')
    const first = String(r.first_name || '').trim(), last = String(r.last_name || '').trim()
    const level = normLevel(r.level)
    if (!/^\d{12}$/.test(nid)) errs.push('identifiant : 12 chiffres requis')
    if (!first) errs.push('prénom manquant'); if (!last) errs.push('nom manquant')
    if (!level) errs.push(`niveau invalide « ${r.level || ''} » (attendu 1AP…6AP, 7AB…9AB, 1AS…4AS)`)
    const birth = normDate(r.birth_date); if (r.birth_date && !birth) errs.push('date de naissance illisible (JJ/MM/AAAA)')
    const gender = String(r.gender || 'M').trim().toUpperCase().startsWith('F') ? 'F' : 'M'
    const phone = String(r.parent_phone || '').replace(/[^\d+]/g, '')
    const email = String(r.parent_email || '').trim().toLowerCase(); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push('email parent invalide')
    if (nid && seen.has(nid)) errs.push('identifiant en double dans le fichier'); seen.add(nid)
    const fee = r.monthly_fee !== undefined && r.monthly_fee !== '' && r.monthly_fee != null ? Number(String(r.monthly_fee).replace(',', '.')) : null
    if (fee !== null && isNaN(fee)) errs.push('mensualité non numérique')
    const dup = byNid[nid]
    let action = 'insert'
    if (dup) action = mode === 'update' ? 'update' : 'skip'
    if (errs.length) action = 'error'
    report.push({ line, national_id: nid, name: `${first} ${last}`.trim(), level, action, errors: errs, existing: dup ? `${dup.first_name} ${dup.last_name} (${dup.level})` : null })
    if (action === 'error' || action === 'skip') return
    const row: any = { national_id: nid, first_name: first, last_name: last, birth_date: birth, gender, cycle: cycleOf(level!), level, class_name: String(r.class_name || '').trim() || null, parent_name: String(r.parent_name || '').trim() || null, parent_phone: phone || null, parent_email: email || null, address: String(r.address || '').trim() || null, status: 'actif' }
    if (fee !== null) row.monthly_fee = fee
    if (action === 'update') toUpdate.push({ id: dup.id, row }); else toInsert.push(row)
  })
  const summary = { total: rows.length, insert: toInsert.length, update: toUpdate.length, skip: report.filter(r => r.action === 'skip').length, error: report.filter(r => r.action === 'error').length }
  if (dry) return c.json({ dry_run: true, summary, report })
  let inserted = 0, updated = 0; const failures: any[] = []
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100)
    const r = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify(chunk) })
    if (r.ok) inserted += chunk.length
    else { // repli ligne par ligne pour isoler l'erreur
      for (const row of chunk) { const r1 = await sb(c.env, 'students', { method: 'POST', body: JSON.stringify(row) }); if (r1.ok) inserted++; else failures.push({ national_id: row.national_id, name: `${row.first_name} ${row.last_name}`, error: r1.data?.message || r1.data?.error || 'erreur' }) }
    }
  }
  for (const u of toUpdate) { const r = await sb(c.env, `students?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify(u.row) }); if (r.ok) updated++; else failures.push({ national_id: u.row.national_id, name: `${u.row.first_name} ${u.row.last_name}`, error: r.data?.message || 'erreur' }) }
  await audit(c.env, c, user, 'import_students', 'students', null, null, { inserted, updated, skipped: summary.skip, errors: summary.error + failures.length })
  return c.json({ ok: true, summary: { ...summary, inserted, updated, failed: failures.length }, report, failures })
})
// Notes : { rows:[{national_id | student_name, subject, trimester, exam_type, score, max_score, comment, date}], dry_run }
app.post('/api/admin/import/grades', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const rows: any[] = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : []
  const dry = !!b.dry_run
  const [stR, subR] = await Promise.all([sb(c.env, `students?select=id,national_id,first_name,last_name,level&status=eq.actif&limit=5000`), sb(c.env, `subjects?select=id,name,cycle`)])
  const students = stR.data || []; const subjects = subR.data || []
  let allowed: number[] | null = null
  if (user.role === 'teacher') allowed = await teacherAssignedIds(c.env, user)
  const tid = user.role === 'teacher' ? await getTeacherId(c.env, user) : null
  const norm = (x: string) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
  const byNid: Record<string, any> = {}; const byName: Record<string, any[]> = {}
  for (const s of students) { if (s.national_id) byNid[s.national_id] = s; const k = norm(`${s.first_name} ${s.last_name}`); (byName[k] = byName[k] || []).push(s); const k2 = norm(`${s.last_name} ${s.first_name}`); if (k2 !== k) (byName[k2] = byName[k2] || []).push(s) }
  const subByName: Record<string, any[]> = {}; for (const sj of subjects) (subByName[norm(sj.name)] = subByName[norm(sj.name)] || []).push(sj)
  const EXAM = ['controle', 'synthese', 'oral', 'devoir1', 'devoir2', 'examen', 'devoir']
  const report: any[] = []; const toInsert: any[] = []
  rows.forEach((r, i) => {
    const line = r._line || i + 2; const errs: string[] = []
    const nid = String(r.national_id || '').replace(/\D/g, '')
    let st = nid ? byNid[nid] : null
    if (!st && r.student_name) { const cands = byName[norm(r.student_name)] || []; if (cands.length === 1) st = cands[0]; else if (cands.length > 1) errs.push('plusieurs élèves portent ce nom : indiquez l\u2019identifiant'); }
    if (!st) errs.push(nid ? `élève introuvable (identifiant ${nid})` : 'élève introuvable')
    if (st && allowed !== null && !allowed.includes(st.id)) errs.push('élève non affecté à cet enseignant')
    let subj: any = null
    if (r.subject_id) subj = subjects.find((x: any) => x.id === Number(r.subject_id))
    if (!subj && r.subject) { const cands = subByName[norm(r.subject)] || []; subj = cands.length === 1 ? cands[0] : (st ? cands.find((x: any) => x.cycle === cycleOf(st.level)) : null) || cands[0] || null }
    if (!subj) errs.push(`matière inconnue « ${r.subject || ''} »`)
    const tri = Number(r.trimester); if (![1, 2, 3].includes(tri)) errs.push('trimestre : 1, 2 ou 3')
    const et = norm(r.exam_type || 'controle').replace(/[^a-z0-9]/g, ''); const exam_type = EXAM.includes(et) ? et : et.startsWith('dev') && et.endsWith('1') ? 'devoir1' : et.startsWith('dev') && et.endsWith('2') ? 'devoir2' : et.startsWith('exam') ? 'examen' : et.startsWith('synth') ? 'synthese' : et.startsWith('oral') ? 'oral' : 'controle'
    const max = r.max_score ? Number(String(r.max_score).replace(',', '.')) : 20
    const score = Number(String(r.score ?? '').replace(',', '.'))
    if (isNaN(score) || r.score === '' || r.score == null) errs.push('note manquante ou non numérique'); else if (score < 0 || score > max) errs.push(`note hors barème (0–${max})`)
    const date = normDate(r.date)
    report.push({ line, student: st ? `${st.first_name} ${st.last_name}` : (r.student_name || nid), subject: subj?.name || r.subject, trimester: tri, exam_type, score, max_score: max, action: errs.length ? 'error' : 'insert', errors: errs })
    if (errs.length) return
    const row: any = { student_id: st.id, subject_id: subj.id, trimester: tri, exam_type, score, max_score: max, comment: String(r.comment || '').trim() || null }
    if (tid) row.teacher_id = tid
    if (date) row.created_at = date
    toInsert.push(row)
  })
  const summary = { total: rows.length, insert: toInsert.length, error: report.filter(r => r.action === 'error').length }
  if (dry) return c.json({ dry_run: true, summary, report })
  let inserted = 0; const failures: any[] = []
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200)
    const r = await sb(c.env, 'grades', { method: 'POST', body: JSON.stringify(chunk) })
    if (r.ok) inserted += chunk.length
    else for (const row of chunk) { const r1 = await sb(c.env, 'grades', { method: 'POST', body: JSON.stringify(row) }); if (r1.ok) inserted++; else failures.push({ ...row, error: r1.data?.message || 'erreur' }) }
  }
  await audit(c.env, c, user, 'import_grades', 'grades', null, null, { inserted, errors: summary.error + failures.length })
  return c.json({ ok: true, summary: { ...summary, inserted, failed: failures.length }, report, failures })
})

// ---------- Certificats & attestations (PDF filigrané + QR de vérification) ----------
let _certSupported: { ok: boolean; at: number } | null = null
async function certSupported(env: Bindings) {
  if (_certSupported && (_certSupported.ok || Date.now() - _certSupported.at < 300000)) return _certSupported.ok
  const p = await sb(env, 'certificates?select=id&limit=1&deleted_at=is.null'); _certSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
const CERT_LEVELS: Record<string, string> = { '1AP': '1ère année primaire', '2AP': '2ème année primaire', '3AP': '3ème année primaire', '4AP': '4ème année primaire', '5AP': '5ème année primaire', '6AP': '6ème année primaire', '7AB': '7ème année de base', '8AB': '8ème année de base', '9AB': '9ème année de base', '1AS': '1ère année secondaire', '2AS': '2ème année secondaire', '3AS': '3ème année secondaire', '4AS': '4ème année secondaire' }
const CERT_TYPES: Record<string, { title: string; prefix: string }> = {
  scolarite: { title: 'ATTESTATION DE SCOLARITÉ', prefix: 'ATS' },
  presence: { title: 'ATTESTATION DE PRÉSENCE', prefix: 'ATP' },
  reussite: { title: 'ATTESTATION DE RÉUSSITE', prefix: 'ATR' },
  inscription: { title: 'ATTESTATION D\u2019INSCRIPTION', prefix: 'ATI' },
  conduite: { title: 'CERTIFICAT DE BONNE CONDUITE', prefix: 'CBC' },
  autre: { title: 'ATTESTATION', prefix: 'ATT' }
}
function frDate(d: string | Date) { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }
function certBody(type: string, st: any, school: any, yr: string, extra: any) {
  const civ = st.gender === 'F' ? 'l\u2019élève' : 'l\u2019élève'
  const born = st.birth_date ? `, né${st.gender === 'F' ? 'e' : ''} le ${frDate(st.birth_date)}` : ''
  const lvl = CERT_LEVELS[st.level] || st.level
  const cls = st.class_name ? ` (classe ${st.class_name})` : ''
  const who = `${civ} ${st.first_name} ${st.last_name}${born}`
  const dir = `Je soussigné(e), ${extra?.signer || 'le Directeur'} de ${school.name || 'Rahma Academy'}, certifie que`
  switch (type) {
    case 'scolarite': return `${dir} ${who} est régulièrement inscrit${st.gender === 'F' ? 'e' : ''} dans notre établissement en ${lvl}${cls} pour l\u2019année scolaire ${yr}, et y suit assidûment les cours.`
    case 'presence': return `${dir} ${who}, inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls}, a été présent${st.gender === 'F' ? 'e' : ''} dans notre établissement${extra?.from && extra?.to ? ` du ${frDate(extra.from)} au ${frDate(extra.to)}` : ` durant l\u2019année scolaire ${yr}`}${extra?.presence_rate != null ? `, avec un taux de présence de ${extra.presence_rate} %${extra.absences != null ? ` (${extra.absences} absence(s))` : ''}` : ''}.`
    case 'reussite': return `${dir} ${who}, inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls} pour l\u2019année scolaire ${yr}, a satisfait aux exigences de son niveau${extra?.average != null ? ` avec une moyenne générale de ${Number(extra.average).toFixed(2)}/20${extra?.mention ? ` (mention ${extra.mention})` : ''}` : ''}${extra?.next_level ? ` et est admis${st.gender === 'F' ? 'e' : ''} en ${CERT_LEVELS[extra.next_level] || extra.next_level}` : ''}.`
    case 'inscription': return `${dir} ${who} est inscrit${st.gender === 'F' ? 'e' : ''} dans notre établissement en ${lvl}${cls} pour l\u2019année scolaire ${yr}.`
    case 'conduite': return `${dir} ${who}, inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls} pour l\u2019année scolaire ${yr}, a fait preuve d\u2019une bonne conduite et n\u2019a fait l\u2019objet d\u2019aucune sanction disciplinaire.`
    default: return extra?.custom_body || `${dir} ${who} est inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls} pour l\u2019année scolaire ${yr}.`
  }
}
async function certToken(env: Bindings, number: string) { return (await sha256Hex(`certificat::${cfg(env).jwt}::${number}`)).slice(0, 20) }

// Émettre un certificat (admin) : figé + numéroté + jeton de vérification
app.post('/api/certificates', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!(await certSupported(c.env))) return c.json({ error: 'Module certificats non installé (migration 0012)' }, 501)
  const b = await c.req.json().catch(() => ({}))
  const type = CERT_TYPES[b.type] ? b.type : 'autre'
  const sid = Number(b.student_id)
  const st = (await sb(c.env, `students?id=eq.${sid}&select=*`)).data?.[0]
  if (!st) return c.json({ error: 'Élève introuvable' }, 404)
  const yr = b.school_year || activeYear() || _currentYearCache?.label || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
  const school = await getSettings(c.env, 'school')
  const extra = b.extra || {}
  // Présence : calcul automatique si période fournie et taux absent
  if (type === 'presence' && extra.from && extra.to && extra.presence_rate == null) {
    const at = await sb(c.env, `attendance?student_id=eq.${sid}&date=gte.${extra.from}&date=lte.${extra.to}&select=status&school_year=eq.${yr}`)
    const rows = at.data || []; const abs = rows.filter((r: any) => r.status === 'absent').length
    if (rows.length) { extra.presence_rate = Math.round((rows.length - abs) * 100 / rows.length); extra.absences = abs; extra.days = rows.length }
  }
  const title = b.title || CERT_TYPES[type].title
  const body = (b.body && String(b.body).trim()) || certBody(type, st, school, yr, extra)
  // Numéro séquentiel par année : PREFIX-YYYY-NNNNN
  const y = new Date().getFullYear()
  const last = (await sb(c.env, `certificates?number=like.${CERT_TYPES[type].prefix}-${y}-*&select=number&order=number.desc&limit=1&deleted_at=not.is.null`)).data?.[0]?.number
  const last2 = (await sb(c.env, `certificates?number=like.${CERT_TYPES[type].prefix}-${y}-*&select=number&order=number.desc&limit=1`)).data?.[0]?.number
  const seq = Math.max(Number((last || '').split('-').pop() || 0), Number((last2 || '').split('-').pop() || 0)) + 1
  const number = `${CERT_TYPES[type].prefix}-${y}-${String(seq).padStart(5, '0')}`
  const verify_token = await certToken(c.env, number)
  const fingerprint = await sha256Hex(`${number}|${sid}|${title}|${body}`)
  const row = { number, type, student_id: sid, school_year: yr, title, body, extra, issued_by: user.id, issued_by_name: user.name || null, verify_token, fingerprint }
  const r = await sb(c.env, 'certificates', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: r.data?.message || 'Erreur' }, 500)
  const cert = Array.isArray(r.data) ? r.data[0] : r.data
  await audit(c.env, c, user, 'issue_certificate', 'certificates', cert.id, null, { number, type, student_id: sid })
  return c.json({ ok: true, certificate: { ...cert, students: st, school, verify_url: `${publicOrigin(c)}/verifier/${number}?t=${verify_token}` } })
})
// Liste (admin) / par élève (staff + famille)
app.get('/api/certificates', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await certSupported(c.env))) return c.json({ supported: false, items: [] })
  const sid = c.req.query('student_id')
  let q = `certificates?select=*,students(first_name,last_name,level,class_name)&order=issued_at.desc&limit=300`
  if (['parent', 'student'].includes(user.role)) { const ids = linkedIds(user); if (!ids.length) return c.json({ supported: true, items: [] }); q += `&student_id=in.(${ids.join(',')})&revoked_at=is.null` }
  else if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) q += `&student_id=in.(${aids.length ? aids.join(',') : 0})` }
  if (sid) q += `&student_id=eq.${Number(sid)}`
  const r = await sb(c.env, q)
  const origin = publicOrigin(c)
  const items = (r.data || []).map((x: any) => ({ ...x, verify_url: `${origin}/verifier/${x.number}?t=${x.verify_token}` }))
  return c.json({ supported: true, items })
})
// Révoquer (admin)
app.post('/api/certificates/:id/revoke', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id')); const b = await c.req.json().catch(() => ({}))
  const before = (await sb(c.env, `certificates?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Introuvable' }, 404)
  const r = await sb(c.env, `certificates?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_reason: (b.reason || '').slice(0, 300) || null }) })
  if (!r.ok) return c.json({ error: 'Erreur' }, 500)
  await audit(c.env, c, user, 'revoke_certificate', 'certificates', id, before, { revoked_reason: b.reason })
  return c.json({ ok: true })
})
// Vérification publique (QR) : ne dévoile que le strict nécessaire
app.get('/api/public/verify/:number', async (c) => {
  const number = c.req.param('number'); const t = c.req.query('t') || ''
  if (!/^[A-Z]{3}-\d{4}-\d{5}$/.test(number) || t !== await certToken(c.env, number)) return c.json({ valid: false, error: 'Lien de vérification invalide' }, 403)
  const r = await sb(c.env, `certificates?number=eq.${number}&select=number,type,title,school_year,issued_at,issued_by_name,revoked_at,revoked_reason,fingerprint,students(first_name,last_name,level)`)
  const cert = r.data?.[0]
  if (!cert) return c.json({ valid: false, error: 'Document introuvable ou supprimé' }, 404)
  const school = await getSettings(c.env, 'school')
  return c.json({ valid: !cert.revoked_at, number: cert.number, title: cert.title, type: cert.type, school_year: cert.school_year, issued_at: cert.issued_at, issued_by: cert.issued_by_name, revoked_at: cert.revoked_at, revoked_reason: cert.revoked_reason, fingerprint: cert.fingerprint, student: `${cert.students?.first_name || ''} ${cert.students?.last_name || ''}`.trim(), level: CERT_LEVELS[cert.students?.level] || cert.students?.level, school: school.name || 'Rahma Academy' })
})

// ---------- Détection précoce : élèves en difficulté (admin / enseignant) ----------
// Critères : moyenne du trimestre < 10, matières < 10, absences (30 j) >= seuil, retards, devoirs non rendus (échus), frais en retard.
app.get('/api/alerts/students', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const trimester = Number(c.req.query('trimester') || currentTrimester())
  const absThreshold = Number(c.req.query('abs') || 3)
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  let idFilter = ''
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) idFilter = `&student_id=in.(${aids.length ? aids.join(',') : 0})` }
  const stFilter = idFilter ? idFilter.replace('&student_id=', '&id=') : ''
  const hw = await hwSupported(c.env)
  const nowIso = new Date().toISOString()
  const [st, gr, att, fees, hws, subs] = await Promise.all([
    sb(c.env, `students?status=eq.actif&select=id,first_name,last_name,level,class_name,parent_name,parent_phone${stFilter}`),
    sb(c.env, `grades?trimester=eq.${trimester}&select=student_id,subject_id,score,max_score,subjects(name,coefficient)${idFilter}`),
    sb(c.env, `attendance?date=gte.${since}&status=in.(absent,retard)&select=student_id,status,date${idFilter}`),
    sb(c.env, `fees?status=in.(overdue,pending)&select=student_id,amount,due_date,status${idFilter}`),
    hw ? sb(c.env, `homeworks?status=eq.published&due_at=lt.${nowIso}&select=id,title,level,due_at`) : Promise.resolve({ data: [] } as any),
    hw ? sb(c.env, `homework_submissions?select=homework_id,student_id`) : Promise.resolve({ data: [] } as any)
  ])
  const today = new Date().toISOString().slice(0, 10)
  const byStudent: Record<number, any> = {}
  for (const s of st.data || []) byStudent[s.id] = { student: s, avg: null, weakSubjects: [] as any[], absences: 0, lates: 0, missingHomeworks: [] as any[], overdueFees: 0, overdueAmount: 0, reasons: [] as string[], score: 0 }
  // Moyennes
  const grByS: Record<number, Record<string, { coef: number; s: number[] }>> = {}
  for (const g of gr.data || []) {
    const b = byStudent[g.student_id]; if (!b) continue
    const name = g.subjects?.name || 'Matière'
    grByS[g.student_id] = grByS[g.student_id] || {}
    grByS[g.student_id][name] = grByS[g.student_id][name] || { coef: Number(g.subjects?.coefficient || 1), s: [] }
    grByS[g.student_id][name].s.push(Number(g.score) * 20 / Number(g.max_score || 20))
  }
  for (const [sid, subsMap] of Object.entries(grByS)) {
    const b = byStudent[Number(sid)]; let tc = 0, tot = 0
    for (const [name, v] of Object.entries(subsMap)) { const m = v.s.reduce((a, x) => a + x, 0) / v.s.length; tc += v.coef; tot += m * v.coef; if (m < 10) b.weakSubjects.push({ name, average: Number(m.toFixed(2)) }) }
    b.avg = tc ? Number((tot / tc).toFixed(2)) : null
  }
  for (const a of att.data || []) { const b = byStudent[a.student_id]; if (!b) continue; if (a.status === 'absent') b.absences++; else b.lates++ }
  for (const f of fees.data || []) { const b = byStudent[f.student_id]; if (!b) continue; if (f.status === 'overdue' || (f.due_date && f.due_date < today)) { b.overdueFees++; b.overdueAmount += Number(f.amount || 0) } }
  if (hw) {
    const submitted = new Set((subs.data || []).map((x: any) => `${x.homework_id}:${x.student_id}`))
    for (const h of hws.data || []) for (const b of Object.values(byStudent)) if (b.student.level === h.level && !submitted.has(`${h.id}:${b.student.id}`)) b.missingHomeworks.push({ id: h.id, title: h.title, due_at: h.due_at })
  }
  const items = Object.values(byStudent).map((b: any) => {
    if (b.avg !== null && b.avg < 10) { b.reasons.push('moyenne'); b.score += 3 + (10 - b.avg) / 2 }
    else if (b.weakSubjects.length) { b.reasons.push('matieres'); b.score += b.weakSubjects.length }
    if (b.absences >= absThreshold) { b.reasons.push('absences'); b.score += 2 + (b.absences - absThreshold) * 0.5 }
    if (b.lates >= 3) { b.reasons.push('retards'); b.score += 1 }
    if (b.missingHomeworks.length >= 2) { b.reasons.push('devoirs'); b.score += 1 + b.missingHomeworks.length * 0.5 }
    if (b.overdueFees > 0 && user.role === 'admin') { b.reasons.push('frais'); b.score += 1 }
    return b
  }).filter((b: any) => b.reasons.length).sort((a: any, b: any) => b.score - a.score)
  return c.json({ trimester, since, absThreshold, hwSupported: hw, total: (st.data || []).length, items })
})
function currentTrimester(): number { const m = new Date().getMonth() + 1; return m >= 9 || m <= 12 ? 1 : m <= 3 ? 2 : 3 }

// ---------- Signature du bulletin par le parent (accusé de lecture horodaté) ----------
let _sigSupported: { ok: boolean; at: number } | null = null
async function sigSupported(env: Bindings) {
  if (_sigSupported && (_sigSupported.ok || Date.now() - _sigSupported.at < 300000)) return _sigSupported.ok
  const p = await sb(env, 'bulletin_signatures?select=id&limit=1&school_year=not.is.null'); _sigSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
// Empreinte du contenu signé : ids/notes triés + moyenne (permet de prouver que le bulletin n'a pas changé depuis la signature)
function bulletinFingerprintSource(grades: any[], avg: number) {
  return grades.map(g => `${g.id}:${g.subject_id}:${g.score}/${g.max_score || 20}`).sort().join('|') + `|avg=${avg.toFixed(2)}`
}
app.post('/api/bulletin/:studentId/sign', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (user.role !== 'parent') return c.json({ error: 'Seul un parent/tuteur peut signer le bulletin' }, 403)
  const sid = Number(c.req.param('studentId'))
  if (!linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await sigSupported(c.env))) return c.json({ error: 'Module signature non installé (migration 0011)' }, 501)
  const body = await c.req.json().catch(() => ({}))
  const trimester = Number(body.trimester)
  if (![1, 2, 3].includes(trimester)) return c.json({ error: 'Trimestre invalide' }, 400)
  if (!body.confirm) return c.json({ error: 'Confirmation requise' }, 400)
  const yr = activeYear() || _currentYearCache?.label
  if (!yr) return c.json({ error: 'Année scolaire inconnue' }, 400)
  const gr = await sb(c.env, `grades?student_id=eq.${sid}&trimester=eq.${trimester}&select=id,subject_id,score,max_score,subjects(coefficient)`)
  const grades = gr.data || []
  if (!grades.length) return c.json({ error: 'Aucune note à signer pour ce trimestre' }, 400)
  const bySub: any = {}
  for (const g of grades) { const k = g.subject_id; if (!bySub[k]) bySub[k] = { coef: Number(g.subjects?.coefficient || 1), s: [] as number[] }; bySub[k].s.push(Number(g.score) * 20 / Number(g.max_score || 20)) }
  const subs: any[] = Object.values(bySub); const tc = subs.reduce((a, x) => a + x.coef, 0)
  const avg = tc ? subs.reduce((a, x) => a + (x.s.reduce((p: number, q: number) => p + q, 0) / x.s.length) * x.coef, 0) / tc : 0
  const fingerprint = await sha256Hex(bulletinFingerprintSource(grades, avg))
  const row = { student_id: sid, trimester, school_year: yr, signed_by: user.id, signer_name: user.name || null, signer_email: user.email || null, ip: clientIp(c), user_agent: (c.req.header('User-Agent') || '').slice(0, 250), general_average: Number(avg.toFixed(2)), grades_count: grades.length, fingerprint, comment: (body.comment || '').toString().slice(0, 500) || null }
  const r = await sb(c.env, 'bulletin_signatures', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: r.status === 409 ? 'Bulletin déjà signé' : (r.data?.message || 'Erreur') }, r.status === 409 ? 409 : 500)
  const sig = Array.isArray(r.data) ? r.data[0] : r.data
  await audit(c.env, c, user, 'sign_bulletin', 'bulletin_signatures', sig?.id, null, { student_id: sid, trimester, fingerprint })
  // Notification interne aux admins (feed) — non bloquante
  try {
    const st = await sb(c.env, `students?id=eq.${sid}&select=first_name,last_name,level`); const s0 = st.data?.[0]
    if (await targetedSupported(c.env)) await sb(c.env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: null, type: 'bulletin', title: `✍️ Bulletin T${trimester} signé`, message: `${user.name || 'Le parent'} a signé le bulletin du trimestre ${trimester} de ${s0?.first_name || ''} ${s0?.last_name || ''} (${s0?.level || ''}). Moyenne : ${avg.toFixed(2)}/20.`, recipient: 'Administration', sent_via: 'app', status: 'sent', audience: ['admin'], level: s0?.level || null, ref_table: 'bulletin_signatures', ref_id: Number(sig?.id || 0), link: '#grades', created_by: user.id }) })
  } catch {}
  return c.json({ ok: true, signature: sig })
})
// Admin : annuler une signature (erreur du parent, notes corrigées → nouvelle signature requise)
app.delete('/api/bulletin-signatures/:id', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const before = (await sb(c.env, `bulletin_signatures?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Signature introuvable' }, 404)
  const r = await sb(c.env, `bulletin_signatures?id=eq.${id}`, { method: 'DELETE' })
  if (!r.ok) return c.json({ error: 'Erreur' }, 500)
  await audit(c.env, c, user, 'revoke_bulletin_signature', 'bulletin_signatures', id, before, null)
  return c.json({ ok: true })
})
// Suivi admin/enseignant : état des signatures d'un trimestre (qui a signé / pas encore)
app.get('/api/bulletin-signatures', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await sigSupported(c.env))) return c.json({ supported: false, items: [] })
  const trimester = Number(c.req.query('trimester') || 1)
  const level = c.req.query('level')
  let q = `students?select=id,first_name,last_name,level,parent_name,parent_phone&status=eq.actif&order=level.asc,last_name.asc`
  if (level) q += `&level=eq.${encodeURIComponent(level)}`
  if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) q += `&id=in.(${aids.length ? aids.join(',') : 0})` }
  const [st, sg, gr] = await Promise.all([
    sb(c.env, q),
    sb(c.env, `bulletin_signatures?trimester=eq.${trimester}&select=id,student_id,signed_at,signer_name,general_average,comment`),
    sb(c.env, `grades?trimester=eq.${trimester}&select=student_id`)
  ])
  const sigBy: any = {}; (sg.data || []).forEach((x: any) => { sigBy[x.student_id] = x })
  const hasGrades = new Set((gr.data || []).map((g: any) => g.student_id))
  const items = (st.data || []).map((s: any) => ({ ...s, has_grades: hasGrades.has(s.id), signature: sigBy[s.id] || null }))
  return c.json({ supported: true, trimester, items })
})

// ---------- Page principale ----------
const mainPage = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rahma Academy - Plateforme de gestion scolaire</title>
  <meta name="description" content="Gestion scolaire complète : élèves, présence, notes, bulletins, frais, cours et notifications.">
  <meta name="theme-color" content="#000612">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Rahma Academy">
  <link rel="icon" type="image/png" href="/static/icons/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
</head>
<body class="bg-gray-100">
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="/static/app.js"></script>
  <script src="/static/public.js"></script>
  <script src="/static/views-core.js"></script>
  <script src="/static/pdf-fonts.js"></script>
  <script src="/static/views-academic.js"></script>
  <script src="/static/views-notebook.js"></script>
  <script src="/static/views-timetable.js"></script>
  <script src="/static/views-homework.js"></script>
  <script src="/static/views-certificates.js"></script>
  <script src="/static/views-import.js"></script>
  <script src="/static/views-progress.js"></script>
  <script src="/static/views-admin.js"></script>
  <script src="/static/views-chat.js"></script>
</body>
</html>`

app.get('/', (c) => c.html(mainPage))
// Accès rapide via QR Code : ouvre directement le formulaire d'inscription élève
app.get('/inscription', (c) => c.html(mainPage))

// ---------- Quittance publique (lien sécurisé par token, sans connexion) ----------
app.get('/api/public/receipt/:id', async (c) => {
  const id = c.req.param('id')
  const t = c.req.query('t') || ''
  if (!/^\d+$/.test(id) || t !== await receiptToken(c.env, id)) return c.json({ error: 'Lien invalide' }, 403)
  const r = await sb(c.env, `fees?id=eq.${id}&select=*,students(first_name,last_name,level,class_name,parent_name)`)
  const fee = r.data?.[0]
  if (!fee) return c.json({ error: 'Quittance introuvable' }, 404)
  if (fee.status !== 'paid') return c.json({ error: 'Ce frais n\'est pas encore payé' }, 400)
  const school = await getSettings(c.env, 'school')
  return c.json({ fee, school })
})

app.get('/quittance/:id', (c) => c.html(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quittance de paiement — Rahma Academy</title>
  <link rel="icon" type="image/png" href="/static/icons/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
  <main class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
    <img src="/static/logo-rahma.png" alt="Rahma Academy" class="w-28 h-28 mx-auto mb-4 object-contain">
    <h1 class="text-xl font-bold text-blue-800 mb-1">Rahma Academy</h1>
    <p class="text-gray-500 text-sm mb-6">Quittance de paiement</p>
    <div id="info" class="text-left text-sm bg-blue-50 rounded-lg p-4 mb-6 hidden"></div>
    <div id="status" class="text-gray-600 mb-4">Chargement…</div>
    <button id="dl-btn" onclick="genPDF()" class="hidden w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-6 rounded-xl transition">
      📄 Télécharger la quittance (PDF)
    </button>
  </main>
  <script src="/static/pdf-fonts.js"></script>
  <script src="/static/receipt-public.js"></script>
</body>
</html>`))

app.get('/verifier/:number', (c) => c.html(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vérification de document — Rahma Academy</title>
  <link rel="icon" type="image/png" href="/static/icons/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
  <main class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
    <img src="/static/logo-rahma.png" alt="Rahma Academy" class="w-24 h-24 mx-auto mb-3 object-contain">
    <h1 class="text-xl font-bold text-blue-800 mb-1">Rahma Academy</h1>
    <p class="text-gray-500 text-sm mb-5">Vérification d\u2019authenticité de document · التحقق من صحة الوثيقة</p>
    <div id="status" class="text-gray-600">Vérification en cours…</div>
  </main>
  <script>
    (async () => {
      const el = document.getElementById('status');
      const number = location.pathname.split('/').pop(); const t = new URLSearchParams(location.search).get('t') || '';
      try {
        const r = await fetch('/api/public/verify/' + encodeURIComponent(number) + '?t=' + encodeURIComponent(t)); const d = await r.json();
        const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        if (!r.ok) { el.innerHTML = '<div class="bg-red-50 border border-red-300 text-red-700 rounded-xl p-4"><i class="fas fa-circle-xmark text-3xl mb-2"></i><br><b>Document non reconnu</b><br><span class="text-sm">' + esc(d.error || '') + '</span></div>'; return; }
        const ok = d.valid;
        el.innerHTML = '<div class="' + (ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-800') + ' border rounded-xl p-4 mb-4"><i class="fas ' + (ok ? 'fa-circle-check' : 'fa-triangle-exclamation') + ' text-3xl mb-2"></i><br><b>' + (ok ? 'Document authentique' : 'Document révoqué') + '</b>' + (ok ? '' : '<br><span class="text-sm">' + esc(d.revoked_reason || '') + '</span>') + '</div>'
          + '<div class="text-left text-sm bg-blue-50 rounded-lg p-4 space-y-1">'
          + '<div><span class="text-gray-500">Document :</span> <b>' + esc(d.title) + '</b></div>'
          + '<div><span class="text-gray-500">N° :</span> <b>' + esc(d.number) + '</b></div>'
          + '<div><span class="text-gray-500">Élève :</span> <b>' + esc(d.student) + '</b> — ' + esc(d.level) + '</div>'
          + '<div><span class="text-gray-500">Année scolaire :</span> ' + esc(d.school_year) + '</div>'
          + '<div><span class="text-gray-500">Délivré le :</span> ' + new Date(d.issued_at).toLocaleDateString('fr-FR') + (d.issued_by ? ' par ' + esc(d.issued_by) : '') + '</div>'
          + '<div class="text-[10px] text-gray-400 break-all pt-1">Empreinte ' + esc(d.fingerprint) + '</div></div>'
          + '<p class="text-xs text-gray-400 mt-4">Comparez ces informations avec le document papier. En cas de doute, contactez l\u2019établissement.</p>';
      } catch (e) { el.innerHTML = '<span class="text-red-600">Erreur de vérification</span>'; }
    })();
  </script>
</body>
</html>`))

export default app
