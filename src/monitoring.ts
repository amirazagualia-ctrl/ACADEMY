/* ============================================================
   Rahma Academy — src/monitoring.ts
   Observabilité pour Cloudflare Workers / Pages (Hono) :
   - monitoringMiddleware() : mesure chaque requête (durée, statut, route, client, request-id)
   - RouteLogger            : logs JSON structurés (debug/info/warn/error) enrichis du contexte
   - MetricsManager         : compteurs / durées / taux d'erreur, fenêtre glissante 7 jours,
                              persistance optionnelle (KV ou table Supabase via callback)
   - AlertManager           : règles paramétrables, canaux Telegram / Slack / e-mail (Resend) /
                              webhook / console, déduplication (cooldown) anti-boucle
   - calculateP95 / calculatePercentile / calculateErrorRate / calculateApdex
   - initSentryForRahmaAcademy : Sentry via l'API HTTP « envelope » (aucune dépendance Node)
   Aucune API Node (fs, os, process…) : uniquement Web APIs (fetch, crypto, performance).
   ============================================================ */
import type { Context, MiddlewareHandler } from 'hono'

// ---------------- Types ----------------
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type MetricUnit = 'ms' | 'count' | 'bytes' | 'percent' | 'ratio'

export interface LogEntry {
  ts: string; level: LogLevel; msg: string
  requestId?: string; method?: string; path?: string; route?: string; status?: number; durationMs?: number
  userId?: number | string; role?: string; tenant?: string; ip?: string; ua?: string
  env?: string; service?: string
  error?: { name: string; message: string; stack?: string }
  [k: string]: unknown
}
export interface MetricPoint { ts: number; value: number; unit: MetricUnit; tags?: Record<string, string> }
export interface MetricSummary { count: number; sum: number; avg: number; min: number; max: number; p50: number; p95: number; p99: number; unit: MetricUnit }
export interface RequestSample { ts: number; route: string; method: string; status: number; durationMs: number; tenant?: string; category?: string }
export interface Alert { severity: Severity; title: string; message: string; timestamp?: string; metadata?: Record<string, unknown>; key?: string; rule?: string }
export interface AlertRule {
  id: string; description: string; severity: Severity
  /** Retourne true si l'alerte doit partir. `m` = instantané des métriques. */
  when: (m: ObservabilitySnapshot) => boolean
  /** Délai minimal entre deux envois de la même règle (ms). */
  cooldownMs?: number
  message?: (m: ObservabilitySnapshot) => string
}
export type AlertChannel = 'telegram' | 'slack' | 'email' | 'webhook' | 'console'
export interface AlertChannelConfig {
  telegram?: { botToken: string; chatId: string }
  slack?: { webhookUrl: string }
  email?: { resendApiKey: string; from: string; to: string[] }
  webhook?: { url: string; secret?: string }
  console?: boolean
}
export interface ObservabilitySnapshot {
  windowMs: number; from: string; to: string
  requests: { total: number; perMinute: number; errors4xx: number; errors5xx: number; errorRate: number; p50: number; p95: number; p99: number; avg: number; apdex: number }
  endpoints: Array<{ route: string; method: string; count: number; avg: number; p95: number; errorRate: number; last: string }>
  statuses: Record<string, number>
  metrics: Record<string, MetricSummary>
  tenants: Record<string, { count: number; errorRate: number; p95: number }>
  slowest: RequestSample[]
  recentErrors: RequestSample[]
  generatedAt: string
}

/** Sous-ensemble de KVNamespace utilisé ici (structurellement compatible, testable hors Workers). */
export interface KVLike {
  get<T = unknown>(key: string, type: 'json'): Promise<T | null>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
}

export interface MonitoringEnv {
  APP_ENV?: string
  LOG_LEVEL?: string
  MONITORING_KV?: KVLike                   // persistance optionnelle (BYOK uniquement)
  MONITORING_SAMPLE_RATE?: string          // 0..1 — échantillonnage des logs info (défaut 1)
  TELEGRAM_BOT_TOKEN?: string; TELEGRAM_ADMIN_CHAT_ID?: string
  SLACK_WEBHOOK_URL?: string
  RESEND_API_KEY?: string; ALERT_EMAIL_FROM?: string; ALERT_EMAIL_TO?: string
  ALERT_WEBHOOK_URL?: string; ALERT_WEBHOOK_SECRET?: string
  SENTRY_DSN?: string; SENTRY_TRACES_SAMPLE_RATE?: string; SENTRY_RELEASE?: string
  LOGS_WEBHOOK_URL?: string                // service de logs externe (Logtail, Axiom, Datadog…) — JSON lines
}

// ---------------- Configuration ----------------
export const MONITORING_CONFIG = {
  service: 'rahma-academy',
  retentionMs: 7 * 24 * 3600_000,          // fenêtre glissante : 7 jours
  maxSamples: 20_000,                      // plafond mémoire par isolate (≈ 1,5 Mo)
  maxPointsPerMetric: 5_000,
  apdexTargetMs: 500,                      // seuil Apdex « satisfait » (tolérant = 4×)
  thresholds: {
    responseTimeP95Ms: 3000,               // alerte si p95 > 3 s
    errorRate: 0.05,                       // alerte si > 5 % d'erreurs 5xx+4xx(hors 401/404)
    error5xxRate: 0.02,                    // alerte si > 2 % de 5xx
    dbQueryTimeMs: 1000,
    minRequestsForRate: 20                 // pas d'alerte de taux sous 20 requêtes
  },
  alertCooldownMs: 15 * 60_000,            // dédup : 15 min par règle/clé
  slowRequestMs: 1500,                     // log warn si requête > 1,5 s
  persistEveryMs: 60_000,                  // flush KV au plus toutes les 60 s
  headerRequestId: 'X-Request-Id'
}

// ---------------- Utilitaires statistiques ----------------
export function calculatePercentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank]
}
/** 95e percentile des temps de réponse : 95 % des utilisateurs ont une latence ≤ p95. */
export function calculateP95(values: number[]): number { return calculatePercentile(values, 95) }
/**
 * Taux d'erreur = requêtes 4xx/5xx ÷ total, arrondi au 0,1 % près (3 décimales en ratio).
 * `ignore` : statuts exclus du numérateur (par défaut 401 et 404 : bruit non imputable au service).
 */
export function calculateErrorRate(samples: Array<{ status: number }>, opts: { ignore?: number[]; only5xx?: boolean } = {}): number {
  if (!samples.length) return 0
  const ignore = new Set(opts.ignore ?? [401, 404])
  const errors = samples.filter(s => opts.only5xx ? s.status >= 500 : (s.status >= 400 && !ignore.has(s.status))).length
  return Math.round((errors / samples.length) * 1000) / 1000
}
/** Apdex = (satisfaits + tolérés/2) ÷ total, seuil T (toléré ≤ 4T). */
export function calculateApdex(durations: number[], targetMs = MONITORING_CONFIG.apdexTargetMs): number {
  if (!durations.length) return 1
  let sat = 0, tol = 0
  for (const d of durations) { if (d <= targetMs) sat++; else if (d <= 4 * targetMs) tol++ }
  return Math.round(((sat + tol / 2) / durations.length) * 1000) / 1000
}
export function summarize(values: number[], unit: MetricUnit): MetricSummary {
  if (!values.length) return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, unit }
  const sum = values.reduce((a, b) => a + b, 0)
  return { count: values.length, sum, avg: Math.round((sum / values.length) * 100) / 100, min: Math.min(...values), max: Math.max(...values), p50: calculatePercentile(values, 50), p95: calculatePercentile(values, 95), p99: calculatePercentile(values, 99), unit }
}
/** Normalise un chemin en « route » : /api/students/123 → /api/students/:id ; uuid, slugs longs → :param */
export function normalizeRoute(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:uuid')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/(photos|courses|homeworks|branding)\/[^/]+$/, '/$1/:file')
    .replace(/\/e\/[^/]+/, '/e/:slug')
    .replace(/\/verifier\/[^/]+/, '/verifier/:code')
    .replace(/\/recu\/[^/]+/, '/recu/:code')
}
export function categorize(route: string): string {
  if (route.startsWith('/api/auth')) return 'auth'
  if (route.startsWith('/api/ai') || route.startsWith('/api/evaluations/ai') || route.startsWith('/api/bank/ai')) return 'ai'
  if (route.startsWith('/api/tenants')) return 'tenants'
  if (route.startsWith('/api/db/') || route.startsWith('/api/admin')) return 'data'
  if (route.startsWith('/api/payments') || route.startsWith('/api/fees')) return 'payments'
  if (route.startsWith('/api/upload') || route.startsWith('/api/files')) return 'files'
  if (route.startsWith('/api/')) return 'api'
  if (route.startsWith('/static/')) return 'static'
  return 'pages'
}
const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
export function genRequestId(): string {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 20) } catch { return Math.random().toString(36).slice(2, 14) + Date.now().toString(36) }
}

// ---------------- RouteLogger ----------------
export class RouteLogger {
  private ctx: Partial<LogEntry>
  private minLevel: LogLevel
  private sink?: (e: LogEntry) => void
  constructor(ctx: Partial<LogEntry> = {}, opts: { minLevel?: LogLevel; sink?: (e: LogEntry) => void } = {}) {
    this.ctx = { service: MONITORING_CONFIG.service, ...ctx }
    this.minLevel = opts.minLevel || 'info'
    this.sink = opts.sink
  }
  /** Nouveau logger héritant du contexte (ex. logger.child({ table: 'students' })). */
  child(extra: Partial<LogEntry>): RouteLogger { return new RouteLogger({ ...this.ctx, ...extra }, { minLevel: this.minLevel, sink: this.sink }) }
  with(extra: Partial<LogEntry>) { Object.assign(this.ctx, extra); return this }
  debug(msg: string, data?: Record<string, unknown>) { this.log('debug', msg, data) }
  info(msg: string, data?: Record<string, unknown>) { this.log('info', msg, data) }
  warn(msg: string, data?: Record<string, unknown>) { this.log('warn', msg, data) }
  error(msg: string, err?: unknown, data?: Record<string, unknown>) {
    const e = err instanceof Error ? { name: err.name, message: err.message, stack: (err.stack || '').split('\n').slice(0, 6).join('\n') } : err !== undefined ? { name: 'Error', message: String(err) } : undefined
    this.log('error', msg, { ...(data || {}), ...(e ? { error: e } : {}) })
  }
  log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return
    const entry: LogEntry = { ts: new Date().toISOString(), level, msg, ...this.ctx, ...(data || {}) } as LogEntry
    const line = JSON.stringify(redact(entry))
    // console.* est capté par `wrangler tail` et Cloudflare Logs
    if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else if (level === 'debug') console.debug(line); else console.log(line)
    try { this.sink?.(entry) } catch {}
  }
}
const SECRET_KEYS = /pass(word)?|token|secret|authorization|cookie|api[_-]?key|db_key/i
export function redact<T>(obj: T, depth = 0): T {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj
  if (Array.isArray(obj)) return obj.map(x => redact(x, depth + 1)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = SECRET_KEYS.test(k) ? '***' : (typeof v === 'object' ? redact(v, depth + 1) : v)
  return out as T
}

// ---------------- MetricsManager ----------------
export interface PersistedState { samples: RequestSample[]; metrics: Record<string, MetricPoint[]>; savedAt: number }
export class MetricsManager {
  private samples: RequestSample[] = []
  private metrics: Record<string, MetricPoint[]> = {}
  private timers: Record<string, number> = {}
  private lastPersist = 0
  private dirty = false
  constructor(private cfg = MONITORING_CONFIG) {}

  now() { return Date.now() }
  /** Enregistre une requête HTTP terminée. */
  recordRequest(s: Omit<RequestSample, 'ts' | 'category'> & { ts?: number }) {
    const sample: RequestSample = { ts: s.ts ?? this.now(), route: s.route, method: s.method, status: s.status, durationMs: Math.max(0, Math.round(s.durationMs)), tenant: s.tenant, category: categorize(s.route) }
    this.samples.push(sample); this.dirty = true
    if (this.samples.length > this.cfg.maxSamples) this.samples.splice(0, this.samples.length - this.cfg.maxSamples)
    return sample
  }
  /** Métrique personnalisée (ex. db.query_time, cache.hits). */
  recordMetric(name: string, value: number, unit: MetricUnit = 'count', tags?: Record<string, string>) {
    const arr = (this.metrics[name] = this.metrics[name] || [])
    arr.push({ ts: this.now(), value, unit, tags }); this.dirty = true
    if (arr.length > this.cfg.maxPointsPerMetric) arr.splice(0, arr.length - this.cfg.maxPointsPerMetric)
  }
  increment(name: string, by = 1, tags?: Record<string, string>) { this.recordMetric(name, by, 'count', tags) }
  startTimer(id: string) { this.timers[id] = this.now() }
  endTimer(id: string, metricName: string, tags?: Record<string, string>): number {
    const t0 = this.timers[id]; delete this.timers[id]
    const d = t0 ? this.now() - t0 : 0
    this.recordMetric(metricName, d, 'ms', tags); return d
  }
  /** Purge tout ce qui dépasse la fenêtre glissante (7 jours). */
  prune(nowTs = this.now()) {
    const cutoff = nowTs - this.cfg.retentionMs
    const before = this.samples.length
    this.samples = this.samples.filter(s => s.ts >= cutoff)
    for (const k of Object.keys(this.metrics)) { this.metrics[k] = this.metrics[k].filter(p => p.ts >= cutoff); if (!this.metrics[k].length) delete this.metrics[k] }
    return before - this.samples.length
  }
  /** Échantillons dans [from, to] (ms epoch), filtre optionnel par catégorie / tenant. */
  select(opts: { from?: number; to?: number; category?: string; tenant?: string; route?: string } = {}): RequestSample[] {
    const from = opts.from ?? 0, to = opts.to ?? Number.MAX_SAFE_INTEGER
    return this.samples.filter(s => s.ts >= from && s.ts <= to && (!opts.category || s.category === opts.category) && (!opts.tenant || s.tenant === opts.tenant) && (!opts.route || s.route === opts.route))
  }
  getAggregatedMetrics(opts: { from?: number; to?: number } = {}): Record<string, MetricSummary> {
    const from = opts.from ?? 0, to = opts.to ?? Number.MAX_SAFE_INTEGER
    const out: Record<string, MetricSummary> = {}
    for (const [k, pts] of Object.entries(this.metrics)) { const sel = pts.filter(p => p.ts >= from && p.ts <= to); if (sel.length) out[k] = summarize(sel.map(p => p.value), sel[0].unit) }
    return out
  }
  /** Instantané complet pour le tableau de bord. */
  snapshot(opts: { windowMs?: number; category?: string; tenant?: string; to?: number } = {}): ObservabilitySnapshot {
    const to = opts.to ?? this.now(); const windowMs = opts.windowMs ?? 3600_000; const from = to - windowMs
    const sel = this.select({ from, to, category: opts.category, tenant: opts.tenant })
    const durs = sel.map(s => s.durationMs)
    const byRoute: Record<string, RequestSample[]> = {}
    const statuses: Record<string, number> = {}
    const byTenant: Record<string, RequestSample[]> = {}
    for (const s of sel) { const k = `${s.method} ${s.route}`; (byRoute[k] = byRoute[k] || []).push(s); const sc = `${Math.floor(s.status / 100)}xx`; statuses[sc] = (statuses[sc] || 0) + 1; if (s.tenant) (byTenant[s.tenant] = byTenant[s.tenant] || []).push(s) }
    const endpoints = Object.entries(byRoute).map(([k, arr]) => { const [method, route] = k.split(' ', 2); const d = arr.map(a => a.durationMs); return { route, method, count: arr.length, avg: Math.round(d.reduce((a, b) => a + b, 0) / arr.length), p95: calculateP95(d), errorRate: calculateErrorRate(arr), last: new Date(Math.max(...arr.map(a => a.ts))).toISOString() } }).sort((a, b) => b.count - a.count)
    const tenants: ObservabilitySnapshot['tenants'] = {}
    for (const [t, arr] of Object.entries(byTenant)) tenants[t] = { count: arr.length, errorRate: calculateErrorRate(arr), p95: calculateP95(arr.map(a => a.durationMs)) }
    return {
      windowMs, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
      requests: { total: sel.length, perMinute: Math.round((sel.length / (windowMs / 60_000)) * 100) / 100, errors4xx: sel.filter(s => s.status >= 400 && s.status < 500).length, errors5xx: sel.filter(s => s.status >= 500).length, errorRate: calculateErrorRate(sel), p50: calculatePercentile(durs, 50), p95: calculateP95(durs), p99: calculatePercentile(durs, 99), avg: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0, apdex: calculateApdex(durs, this.cfg.apdexTargetMs) },
      endpoints, statuses, metrics: this.getAggregatedMetrics({ from, to }), tenants,
      slowest: sel.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
      recentErrors: sel.filter(s => s.status >= 500).slice(-20).reverse(),
      generatedAt: new Date().toISOString()
    }
  }
  /** Export Prometheus (text exposition format 0.0.4). */
  toPrometheus(opts: { windowMs?: number; category?: string } = {}): string {
    const snap = this.snapshot(opts); const L: string[] = []
    const lbl = (o: Record<string, string | number>) => '{' + Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(',') + '}'
    L.push('# HELP rahma_http_requests_total Nombre de requêtes HTTP dans la fenêtre', '# TYPE rahma_http_requests_total gauge')
    for (const e of snap.endpoints) L.push(`rahma_http_requests_total${lbl({ method: e.method, route: e.route })} ${e.count}`)
    L.push('# HELP rahma_http_request_duration_ms Latence des requêtes (quantiles) en ms', '# TYPE rahma_http_request_duration_ms summary')
    for (const e of snap.endpoints) { L.push(`rahma_http_request_duration_ms${lbl({ method: e.method, route: e.route, quantile: '0.95' })} ${e.p95}`); L.push(`rahma_http_request_duration_ms_avg${lbl({ method: e.method, route: e.route })} ${e.avg}`) }
    L.push('# HELP rahma_http_error_rate Taux d\'erreur (4xx hors 401/404 + 5xx) par endpoint', '# TYPE rahma_http_error_rate gauge')
    for (const e of snap.endpoints) L.push(`rahma_http_error_rate${lbl({ method: e.method, route: e.route })} ${e.errorRate}`)
    L.push('# HELP rahma_http_status_total Requêtes par classe de statut', '# TYPE rahma_http_status_total gauge')
    for (const [c, n] of Object.entries(snap.statuses)) L.push(`rahma_http_status_total${lbl({ class: c })} ${n}`)
    L.push('# HELP rahma_http_global Indicateurs globaux de la fenêtre', '# TYPE rahma_http_global gauge')
    for (const [k, v] of Object.entries(snap.requests)) L.push(`rahma_http_global${lbl({ indicator: k })} ${v}`)
    L.push('# HELP rahma_custom_metric Métriques personnalisées agrégées', '# TYPE rahma_custom_metric gauge')
    for (const [name, m] of Object.entries(snap.metrics)) for (const stat of ['avg', 'p95', 'max', 'count'] as const) L.push(`rahma_custom_metric${lbl({ name, stat, unit: m.unit })} ${m[stat]}`)
    L.push('# HELP rahma_tenant_requests_total Requêtes par établissement', '# TYPE rahma_tenant_requests_total gauge')
    for (const [t, v] of Object.entries(snap.tenants)) L.push(`rahma_tenant_requests_total${lbl({ tenant: t })} ${v.count}`, `rahma_tenant_p95_ms${lbl({ tenant: t })} ${v.p95}`)
    return L.join('\n') + '\n'
  }
  // --- persistance (KV facultatif ; un seul isolate à la fois, fusion naïve à la relecture) ---
  export(): PersistedState { return { samples: this.samples, metrics: this.metrics, savedAt: this.now() } }
  import(state: PersistedState | null | undefined) {
    if (!state) return
    const seen = new Set(this.samples.map(s => `${s.ts}|${s.route}|${s.durationMs}`))
    for (const s of state.samples || []) { const k = `${s.ts}|${s.route}|${s.durationMs}`; if (!seen.has(k)) this.samples.push(s) }
    this.samples.sort((a, b) => a.ts - b.ts || a.route.localeCompare(b.route))
    for (const [k, pts] of Object.entries(state.metrics || {})) this.metrics[k] = [...(this.metrics[k] || []), ...pts].sort((a, b) => a.ts - b.ts)
    this.prune()
  }
  async persist(kv?: KVLike, force = false) {
    if (!kv || (!this.dirty && !force) || (!force && this.now() - this.lastPersist < this.cfg.persistEveryMs)) return false
    this.prune(); this.lastPersist = this.now(); this.dirty = false
    try { await kv.put('monitoring:state', JSON.stringify(this.export()), { expirationTtl: Math.ceil(this.cfg.retentionMs / 1000) }); return true } catch { return false }
  }
  async restore(kv?: KVLike) { if (!kv) return; try { const s = await kv.get<PersistedState>('monitoring:state', 'json'); this.import(s) } catch {} }
  reset() { this.samples = []; this.metrics = {}; this.timers = {} }
  get size() { return { samples: this.samples.length, metrics: Object.keys(this.metrics).length } }
}

/* --- suite : AlertManager, Sentry, middleware, helpers Hono (voir plus bas) --- */

// ---------------- AlertManager ----------------
export const DEFAULT_RULES: AlertRule[] = [
  { id: 'p95_latency', description: 'Latence p95 > seuil', severity: 'high', cooldownMs: MONITORING_CONFIG.alertCooldownMs,
    when: m => m.requests.total >= MONITORING_CONFIG.thresholds.minRequestsForRate && m.requests.p95 > MONITORING_CONFIG.thresholds.responseTimeP95Ms,
    message: m => `p95 = ${m.requests.p95} ms (seuil ${MONITORING_CONFIG.thresholds.responseTimeP95Ms} ms) sur ${m.requests.total} requêtes` },
  { id: 'error_rate', description: 'Taux d\u2019erreur global > seuil', severity: 'high', cooldownMs: MONITORING_CONFIG.alertCooldownMs,
    when: m => m.requests.total >= MONITORING_CONFIG.thresholds.minRequestsForRate && m.requests.errorRate > MONITORING_CONFIG.thresholds.errorRate,
    message: m => `Taux d\u2019erreur ${(m.requests.errorRate * 100).toFixed(1)} % (seuil ${MONITORING_CONFIG.thresholds.errorRate * 100} %) — 5xx : ${m.requests.errors5xx}, 4xx : ${m.requests.errors4xx}` },
  { id: 'error_5xx', description: 'Erreurs serveur 5xx', severity: 'critical', cooldownMs: 10 * 60_000,
    when: m => m.requests.total >= MONITORING_CONFIG.thresholds.minRequestsForRate && m.requests.errors5xx / Math.max(1, m.requests.total) > MONITORING_CONFIG.thresholds.error5xxRate,
    message: m => `${m.requests.errors5xx} erreurs 5xx sur ${m.requests.total} requêtes — dernières : ${m.recentErrors.slice(0, 3).map(e => `${e.method} ${e.route} (${e.status})`).join(', ')}` },
  { id: 'db_slow', description: 'Requêtes base de données lentes', severity: 'medium', cooldownMs: MONITORING_CONFIG.alertCooldownMs,
    when: m => !!m.metrics['db.query_time'] && m.metrics['db.query_time'].p95 > MONITORING_CONFIG.thresholds.dbQueryTimeMs,
    message: m => `db.query_time p95 = ${m.metrics['db.query_time'].p95} ms (seuil ${MONITORING_CONFIG.thresholds.dbQueryTimeMs} ms)` },
  { id: 'apdex_low', description: 'Apdex dégradé', severity: 'medium', cooldownMs: 30 * 60_000,
    when: m => m.requests.total >= 50 && m.requests.apdex < 0.8,
    message: m => `Apdex = ${m.requests.apdex} (cible ≥ 0,8) — ${m.requests.total} requêtes` }
]
const SEV_EMOJI: Record<Severity, string> = { low: 'ℹ️', medium: '⚠️', high: '🔥', critical: '🚨' }
const SEV_COLOR: Record<Severity, string> = { low: '#2563eb', medium: '#f59e0b', high: '#ea580c', critical: '#dc2626' }

export interface AlertManagerOptions { rules?: AlertRule[]; cooldownMs?: number; service?: string; env?: string; fetchImpl?: typeof fetch; now?: () => number }

export class AlertManager {
  private lastSent: Record<string, number> = {}
  private history: Array<Alert & { sentAt: string; channels: AlertChannel[] }> = []
  public rules: AlertRule[]
  constructor(private channels: AlertChannelConfig, opts: AlertManagerOptions = {}) {
    this.rules = opts.rules || DEFAULT_RULES
    this.cooldownMs = opts.cooldownMs ?? MONITORING_CONFIG.alertCooldownMs
    this.service = opts.service || MONITORING_CONFIG.service; this.env = opts.env || 'production'
    this.fetchImpl = opts.fetchImpl || ((...a: Parameters<typeof fetch>) => fetch(...a)); this.nowFn = opts.now || (() => Date.now())
  }
  private cooldownMs: number; private service: string; private env: string; private fetchImpl: typeof fetch; private nowFn: () => number
  static fromEnv(env: MonitoringEnv, opts: AlertManagerOptions = {}) {
    const ch: AlertChannelConfig = { console: true }
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID) ch.telegram = { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_ADMIN_CHAT_ID }
    if (env.SLACK_WEBHOOK_URL) ch.slack = { webhookUrl: env.SLACK_WEBHOOK_URL }
    if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO) ch.email = { resendApiKey: env.RESEND_API_KEY, from: env.ALERT_EMAIL_FROM || 'alerts@rahma-academy.tn', to: env.ALERT_EMAIL_TO.split(',').map(s => s.trim()).filter(Boolean) }
    if (env.ALERT_WEBHOOK_URL) ch.webhook = { url: env.ALERT_WEBHOOK_URL, secret: env.ALERT_WEBHOOK_SECRET }
    return new AlertManager(ch, { env: env.APP_ENV || 'production', ...opts })
  }
  /** Déduplication : même clé (règle + titre) → au plus une alerte par `cooldownMs`. */
  shouldSend(key: string, cooldownMs = this.cooldownMs): boolean {
    const last = this.lastSent[key] || 0; const now = this.nowFn()
    if (now - last < cooldownMs) return false
    this.lastSent[key] = now; return true
  }
  /** Évalue toutes les règles sur un instantané ; renvoie les alertes envoyées. */
  async evaluate(snap: ObservabilitySnapshot): Promise<Alert[]> {
    const sent: Alert[] = []
    for (const r of this.rules) {
      let hit = false; try { hit = r.when(snap) } catch { hit = false }
      if (!hit) continue
      const alert: Alert = { severity: r.severity, title: r.description, message: r.message ? r.message(snap) : r.description, rule: r.id, key: `rule:${r.id}`, timestamp: new Date().toISOString(), metadata: { window: snap.windowMs, total: snap.requests.total, p95: snap.requests.p95, errorRate: snap.requests.errorRate } }
      if (await this.sendAlert(alert, r.cooldownMs)) sent.push(alert)
    }
    return sent
  }
  /** Envoi (dédupliqué) sur tous les canaux configurés. Renvoie false si supprimé par la déduplication. */
  async sendAlert(alert: Alert, cooldownMs?: number): Promise<boolean> {
    const key = alert.key || `${alert.severity}:${alert.title}`
    if (!this.shouldSend(key, cooldownMs)) return false
    const a: Alert = { ...alert, timestamp: alert.timestamp || new Date().toISOString() }
    const used: AlertChannel[] = []
    const tasks: Promise<unknown>[] = []
    if (this.channels.telegram) { used.push('telegram'); tasks.push(this.sendTelegram(a)) }
    if (this.channels.slack) { used.push('slack'); tasks.push(this.sendSlack(a)) }
    if (this.channels.email) { used.push('email'); tasks.push(this.sendEmail(a)) }
    if (this.channels.webhook) { used.push('webhook'); tasks.push(this.sendWebhook(a)) }
    if (this.channels.console || !used.length) { used.push('console'); console.warn(JSON.stringify({ ts: a.timestamp, level: 'warn', msg: 'ALERT', alert: a, service: this.service })) }
    await Promise.allSettled(tasks)
    this.history.push({ ...a, sentAt: a.timestamp!, channels: used }); if (this.history.length > 200) this.history.shift()
    return true
  }
  getHistory() { return this.history.slice().reverse() }
  resetDedup() { this.lastSent = {} }
  private text(a: Alert) { return `${SEV_EMOJI[a.severity]} [${this.service} · ${this.env}] ${a.title}\n${a.message}\n${a.timestamp}${a.metadata ? '\n' + Object.entries(a.metadata).map(([k, v]) => `• ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n') : ''}` }
  private esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  private async sendTelegram(a: Alert) {
    const { botToken, chatId } = this.channels.telegram!
    const html = `${SEV_EMOJI[a.severity]} <b>${this.esc(a.title)}</b> <i>(${this.esc(this.service)} · ${this.esc(this.env)})</i>\n${this.esc(a.message)}\n<code>${this.esc(a.timestamp!)}</code>${a.metadata ? '\n' + Object.entries(a.metadata).map(([k, v]) => `• ${this.esc(k)} : <code>${this.esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</code>`).join('\n') : ''}`
    return this.fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }) })
  }
  private async sendSlack(a: Alert) {
    return this.fetchImpl(this.channels.slack!.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${SEV_EMOJI[a.severity]} ${a.title}`, attachments: [{ color: SEV_COLOR[a.severity], title: a.title, text: a.message, footer: `${this.service} · ${this.env}`, ts: Math.floor(Date.parse(a.timestamp!) / 1000), fields: Object.entries(a.metadata || {}).map(([k, v]) => ({ title: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v), short: true })) }] }) })
  }
  private async sendEmail(a: Alert) {
    const { resendApiKey, from, to } = this.channels.email!
    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:600px"><div style="background:${SEV_COLOR[a.severity]};color:#fff;padding:12px 16px;border-radius:8px 8px 0 0"><b>${SEV_EMOJI[a.severity]} ${this.esc(a.title)}</b> — ${this.esc(this.service)} · ${this.esc(this.env)}</div><div style="border:1px solid #e5e7eb;border-top:0;padding:16px;border-radius:0 0 8px 8px"><p>${this.esc(a.message).replace(/\n/g, '<br>')}</p><p style="color:#6b7280;font-size:12px">${this.esc(a.timestamp!)}</p>${a.metadata ? `<pre style="background:#f3f4f6;padding:8px;border-radius:6px;font-size:12px">${this.esc(JSON.stringify(a.metadata, null, 2))}</pre>` : ''}</div></div>`
    return this.fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` }, body: JSON.stringify({ from, to, subject: `[${a.severity.toUpperCase()}] ${a.title} — ${this.service}`, html }) })
  }
  private async sendWebhook(a: Alert) {
    const { url, secret } = this.channels.webhook!
    const body = JSON.stringify({ service: this.service, env: this.env, alert: a })
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (secret) { try { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)); headers['X-Signature-256'] = 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('') } catch {} }
    return this.fetchImpl(url, { method: 'POST', headers, body })
  }
}

// ---------------- Sentry pour Cloudflare Workers (sans SDK Node : API « envelope » via fetch) ----------------
// Contraintes Workers : pas de fs/os/process, pas d'état global durable, CPU limité → envoi asynchrone via waitUntil,
// échantillonnage des transactions par environnement, filtrage des erreurs non pertinentes (401/404, abort, rate-limit).
export interface SentryClient {
  enabled: boolean
  captureException(err: unknown, ctx?: { request?: Request; user?: { id?: string | number; role?: string }; tags?: Record<string, string>; extra?: Record<string, unknown>; requestId?: string; tenant?: string }): Promise<void>
  captureMessage(msg: string, level?: 'info' | 'warning' | 'error', ctx?: Record<string, unknown>): Promise<void>
  captureTransaction(t: { name: string; op?: string; startMs: number; endMs: number; status?: string; tags?: Record<string, string>; requestId?: string }): Promise<void>
  shouldSampleTransaction(): boolean
}
const SENTRY_IGNORE = [/Non authentifié/i, /AbortError/i, /Trop de tentatives/i, /Accès refusé/i, /Introuvable/i, /ECONNRESET/i]
export function initSentryForRahmaAcademy(env: MonitoringEnv, opts: { fetchImpl?: typeof fetch; release?: string; ignore?: RegExp[] } = {}): SentryClient {
  const dsn = env.SENTRY_DSN
  const noop: SentryClient = { enabled: false, captureException: async () => {}, captureMessage: async () => {}, captureTransaction: async () => {}, shouldSampleTransaction: () => false }
  if (!dsn) return noop
  let parsed: { key: string; host: string; projectId: string; protocol: string }
  try { const u = new URL(dsn); parsed = { key: u.username, host: u.host, projectId: u.pathname.replace(/^\//, ''), protocol: u.protocol } } catch { console.warn('[sentry] DSN invalide'); return noop }
  const endpoint = `${parsed.protocol}//${parsed.host}/api/${parsed.projectId}/envelope/`
  const environment = env.APP_ENV || 'production'
  const release = opts.release || env.SENTRY_RELEASE || undefined
  const sampleRate = env.SENTRY_TRACES_SAMPLE_RATE !== undefined ? Math.max(0, Math.min(1, Number(env.SENTRY_TRACES_SAMPLE_RATE))) : (environment === 'production' ? 0.1 : 1)
  const ignore = [...SENTRY_IGNORE, ...(opts.ignore || [])]
  const fetchImpl = opts.fetchImpl || ((...a: Parameters<typeof fetch>) => fetch(...a))
  const uuid = () => crypto.randomUUID().replace(/-/g, '')
  const send = async (type: string, payload: Record<string, unknown>) => {
    const eventId = uuid(); const sentAt = new Date().toISOString()
    const item = { ...payload, event_id: eventId, timestamp: sentAt, platform: 'javascript', environment, release, sdk: { name: 'rahma.workers.minimal', version: '1.0.0' }, server_name: 'cloudflare-workers' }
    const envelope = JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn }) + '\n' + JSON.stringify({ type }) + '\n' + JSON.stringify(item) + '\n'
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 3000)
      await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=rahma.workers.minimal/1.0.0, sentry_key=${parsed.key}` }, body: envelope, signal: ctrl.signal })
      clearTimeout(to)
    } catch (e) { console.warn('[sentry] envoi impossible', (e as Error)?.message) }
  }
  const frames = (stack?: string) => (stack || '').split('\n').slice(1, 12).map(l => { const m = l.match(/at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)/) || l.match(/at\s+(.*?):(\d+):(\d+)/); return m ? (m.length === 5 ? { function: m[1], filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) } : { function: '?', filename: m[1], lineno: Number(m[2]), colno: Number(m[3]) }) : { function: l.trim() } }).reverse()
  return {
    enabled: true,
    shouldSampleTransaction: () => Math.random() < sampleRate,
    async captureException(err, ctx = {}) {
      const e = err instanceof Error ? err : new Error(String(err))
      if (ignore.some(r => r.test(e.message) || r.test(e.name))) return
      const req = ctx.request
      await send('event', {
        level: 'error',
        exception: { values: [{ type: e.name, value: e.message, stacktrace: e.stack ? { frames: frames(e.stack) } : undefined, mechanism: { type: 'generic', handled: true } }] },
        tags: { service: MONITORING_CONFIG.service, tenant: ctx.tenant || 'rahma', ...(ctx.tags || {}) },
        user: ctx.user ? { id: String(ctx.user.id ?? ''), role: ctx.user.role } : undefined,
        request: req ? { url: req.url.split('?')[0], method: req.method, headers: { 'user-agent': req.headers.get('user-agent') || '', 'cf-ray': req.headers.get('cf-ray') || '' } } : undefined,
        extra: { requestId: ctx.requestId, ...(ctx.extra || {}) },
        contexts: { runtime: { name: 'cloudflare-workers' }, ...(req ? { cloudflare: { colo: (req as any).cf?.colo, country: (req as any).cf?.country } } : {}) }
      })
    },
    async captureMessage(message, level = 'info', ctx = {}) { await send('event', { level, message: { formatted: message }, tags: { service: MONITORING_CONFIG.service }, extra: ctx }) },
    async captureTransaction(t) {
      await send('transaction', { type: 'transaction', transaction: t.name, start_timestamp: t.startMs / 1000, timestamp: t.endMs / 1000, contexts: { trace: { trace_id: uuid(), span_id: uuid().slice(0, 16), op: t.op || 'http.server', status: t.status || 'ok' } }, tags: { service: MONITORING_CONFIG.service, ...(t.tags || {}) }, extra: { requestId: t.requestId } })
    }
  }
}

// ---------------- Singletons par isolate + helpers Hono ----------------
// Un isolate Workers peut servir des milliers de requêtes : l'état en mémoire est partagé (métriques, dédup des alertes).
let _metrics: MetricsManager | null = null
let _alerts: AlertManager | null = null
let _sentry: SentryClient | null = null
let _restored = false
export function getMetricsManager(): MetricsManager { return (_metrics = _metrics || new MetricsManager()) }
export function getAlertManager(env: MonitoringEnv): AlertManager { return (_alerts = _alerts || AlertManager.fromEnv(env)) }
export function getSentry(env: MonitoringEnv): SentryClient { return (_sentry = _sentry || initSentryForRahmaAcademy(env)) }
export function resetMonitoringForTests() { _metrics = null; _alerts = null; _sentry = null; _restored = false }

type MonVars = { requestId: string; logger: RouteLogger; metrics: MetricsManager; startedAt: number }
export function createRouteLogger(c: Context): RouteLogger { return (c.get('logger' as never) as RouteLogger) || new RouteLogger({ path: new URL(c.req.url).pathname, method: c.req.method }) }
export function getMetrics(_c?: Context): MetricsManager { return getMetricsManager() }
export function createAlertManager(c: Context): AlertManager { return getAlertManager((c.env || {}) as MonitoringEnv) }
export function getRequestId(c: Context): string { return (c.get('requestId' as never) as string) || '' }

export interface MiddlewareOptions {
  /** Extraction optionnelle de l'utilisateur (id, rôle) — appelée après la réponse, jamais bloquante. */
  resolveUser?: (c: Context) => { id?: number | string; role?: string } | null | undefined
  /** Extraction du tenant courant. */
  resolveTenant?: (c: Context) => string | undefined
  /** Évaluer les règles d'alerte toutes les N requêtes (défaut 25). */
  evaluateEvery?: number
  /** Fenêtre d'évaluation des alertes (défaut 15 min). */
  alertWindowMs?: number
  /** Ignorer certains chemins (défaut : /static, /sw.js, /manifest.json, /favicon). */
  ignore?: (path: string) => boolean
}
let _reqCounter = 0
/**
 * Middleware Hono : request-id, chrono, log structuré, métriques, alertes périodiques, Sentry (erreurs + transactions échantillonnées),
 * persistance KV différée. Tout le post-traitement passe par `executionCtx.waitUntil` quand il est disponible.
 */
export function monitoringMiddleware(opts: MiddlewareOptions = {}): MiddlewareHandler {
  const ignore = opts.ignore || ((p: string) => p.startsWith('/static/') || p === '/sw.js' || p === '/manifest.json' || p.startsWith('/favicon'))
  const every = opts.evaluateEvery ?? 25
  return async (c, next) => {
    const env = (c.env || {}) as MonitoringEnv // c.env absent en test (app.request) ou hors Workers
    const url = new URL(c.req.url); const path = url.pathname
    if (ignore(path)) return next()
    const metrics = getMetricsManager()
    if (!_restored) { _restored = true; if (env.MONITORING_KV) await metrics.restore(env.MONITORING_KV) }
    const requestId = c.req.header(MONITORING_CONFIG.headerRequestId) || genRequestId()
    const minLevel = ((env.LOG_LEVEL || (env.APP_ENV === 'development' ? 'debug' : 'info')) as LogLevel)
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0].trim() || ''
    const logger = new RouteLogger({ requestId, method: c.req.method, path, env: env.APP_ENV || 'production', ip, ua: (c.req.header('User-Agent') || '').slice(0, 120) }, { minLevel })
    c.set('requestId' as never, requestId as never); c.set('logger' as never, logger as never); c.set('metrics' as never, metrics as never)
    const t0 = Date.now(); let thrown: unknown = null
    try { await next() } catch (e) { thrown = e; throw e } finally {
      const durationMs = Date.now() - t0
      // Avec app.onError(), Hono transforme l'exception en réponse 500 et la dépose dans c.error (rien n'est relancé ici)
      if (!thrown && (c as any).error) thrown = (c as any).error
      const status = c.res?.status || (thrown ? 500 : 200)
      const route = normalizeRoute(path)
      const tenant = opts.resolveTenant?.(c)
      const user = (() => { try { return opts.resolveUser?.(c) || undefined } catch { return undefined } })()
      try {
        // Après next(), la réponse existe déjà : on la clone avec les en-têtes d'observabilité
        if (c.res) { const h = new Headers(c.res.headers); h.set(MONITORING_CONFIG.headerRequestId, requestId); h.set('Server-Timing', `app;dur=${durationMs}`); c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers: h }) }
      } catch {}
      metrics.recordRequest({ route, method: c.req.method, status, durationMs, tenant })
      const data: Record<string, unknown> = { route, status, durationMs, tenant, userId: user?.id, role: user?.role, cfRay: c.req.header('CF-Ray') || undefined, colo: (c.req.raw as any).cf?.colo }
      const sample = Number(env.MONITORING_SAMPLE_RATE ?? 1)
      if (thrown) logger.error('request failed', thrown, data)
      else if (status >= 500) logger.error('request error', undefined, data)
      else if (status >= 400 && status !== 401 && status !== 404) logger.warn('request client error', data)
      else if (durationMs > MONITORING_CONFIG.slowRequestMs) logger.warn('slow request', data)
      else if (Math.random() < sample) logger.info('request', data)
      const post = (async () => {
        try {
          const sentry = getSentry(env)
          if (sentry.enabled) {
            if (thrown) await sentry.captureException(thrown, { request: c.req.raw, user, requestId, tenant, tags: { route, status: String(status) } })
            else if (status >= 500) await sentry.captureMessage(`HTTP ${status} ${c.req.method} ${route}`, 'error', { requestId, durationMs })
            if (sentry.shouldSampleTransaction()) await sentry.captureTransaction({ name: `${c.req.method} ${route}`, startMs: t0, endMs: t0 + durationMs, status: status >= 500 ? 'internal_error' : status >= 400 ? 'invalid_argument' : 'ok', tags: { tenant: tenant || 'rahma' }, requestId })
          }
          if (++_reqCounter % every === 0) { metrics.prune(); const snap = metrics.snapshot({ windowMs: opts.alertWindowMs ?? 15 * 60_000 }); await getAlertManager(env).evaluate(snap) }
          if (env.MONITORING_KV) await metrics.persist(env.MONITORING_KV)
          if (env.LOGS_WEBHOOK_URL && (status >= 400 || durationMs > MONITORING_CONFIG.slowRequestMs)) await fetch(env.LOGS_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ts: new Date().toISOString(), requestId, ...data }) }).catch(() => {})
        } catch (e) { console.warn('[monitoring] post-traitement', (e as Error)?.message) }
      })()
      try { c.executionCtx.waitUntil(post) } catch { await post }
    }
  }
}

/** Mesure une opération asynchrone et enregistre sa durée (ex. requêtes Supabase). */
export async function timed<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
  const t0 = Date.now()
  try { return await fn() } finally { getMetricsManager().recordMetric(name, Date.now() - t0, 'ms', tags) }
}
