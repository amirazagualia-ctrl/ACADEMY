// Routes observability
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { MONITORING_CONFIG, calculateErrorRate, calculateP95, getAlertManager, getMetricsManager, getSentry } from '../monitoring'
import { getUser } from '../lib/auth'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// Vérifier un canal auprès de Telegram : existe, n'est pas le bot, le bot en est administrateur (peut poster)
// ---------- Observabilité (admin) : métriques Prometheus / JSON et tableau de bord ----------
// Filtres communs : ?window=15m|1h|6h|24h|7d (défaut 1h) · ?from=ISO&to=ISO · ?category=auth|ai|data|payments|files|api|pages|tenants · ?tenant=<slug>
function monWindow(c: any) {
  const W: Record<string, number> = { '5m': 300_000, '15m': 900_000, '1h': 3600_000, '6h': 6 * 3600_000, '24h': 86_400_000, '7d': 7 * 86_400_000 }
  const from = c.req.query('from') ? Date.parse(c.req.query('from')!) : NaN, to = c.req.query('to') ? Date.parse(c.req.query('to')!) : NaN
  if (!isNaN(from)) { const end = isNaN(to) ? Date.now() : to; return { windowMs: Math.max(60_000, end - from), to: end } }
  return { windowMs: W[c.req.query('window') || '1h'] || 3600_000, to: Date.now() }
}
app.get('/api/admin/metrics', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const m = getMetricsManager(); m.prune()
  const { windowMs, to } = monWindow(c); const category = c.req.query('category') || undefined; const tenant = c.req.query('tenant') || undefined
  const wantsProm = c.req.query('format') === 'prometheus' || /text\/plain|openmetrics/.test(c.req.header('Accept') || '') && c.req.query('format') !== 'json'
  if (wantsProm) { c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8'); return c.body(m.toPrometheus({ windowMs, category })) }
  const snap = m.snapshot({ windowMs, to, category, tenant })
  return c.json({ period: c.req.query('window') || `${Math.round(windowMs / 60000)}m`, from: snap.from, to: snap.to, filters: { category: category || null, tenant: tenant || null }, requests: snap.requests, statuses: snap.statuses, metrics: snap.metrics, endpoints: snap.endpoints.slice(0, 50), timestamp: snap.generatedAt, retention_days: MONITORING_CONFIG.retentionMs / 86_400_000, samples_in_memory: m.size })
})
app.get('/api/admin/observability', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const m = getMetricsManager(); m.prune()
  const { windowMs, to } = monWindow(c)
  const snap = m.snapshot({ windowMs, to, category: c.req.query('category') || undefined, tenant: c.req.query('tenant') || undefined })
  // Série temporelle (buckets) pour les graphiques : requêtes / erreurs / p95 par tranche
  const buckets = Math.min(60, Math.max(6, Number(c.req.query('buckets')) || 12)); const step = windowMs / buckets
  const sel = m.select({ from: to - windowMs, to })
  const series = Array.from({ length: buckets }, (_, i) => { const a = to - windowMs + i * step, b = a + step; const part = sel.filter(s => s.ts >= a && s.ts < b); return { t: new Date(a).toISOString(), count: part.length, errors: part.filter(s => s.status >= 500).length, p95: calculateP95(part.map(s => s.durationMs)), errorRate: calculateErrorRate(part) } })
  const alerts = getAlertManager(c.env)
  const slo = { availability: { target: 0.995, actual: snap.requests.total ? Math.round((1 - snap.requests.errors5xx / snap.requests.total) * 10000) / 10000 : 1 }, latency_p95_ms: { target: MONITORING_CONFIG.thresholds.responseTimeP95Ms, actual: snap.requests.p95 }, error_rate: { target: MONITORING_CONFIG.thresholds.errorRate, actual: snap.requests.errorRate }, apdex: { target: 0.85, actual: snap.requests.apdex } }
  const sloStatus = Object.fromEntries(Object.entries(slo).map(([k, v]: any) => [k, k === 'latency_p95_ms' || k === 'error_rate' ? v.actual <= v.target : v.actual >= v.target]))
  const errorBudget = { target: 0.995, consumed: snap.requests.total ? Math.min(1, (snap.requests.errors5xx / snap.requests.total) / 0.005) : 0 }
  return c.json({ ...snap, series, slo, slo_status: sloStatus, error_budget: errorBudget, alerts: { rules: alerts.rules.map(r => ({ id: r.id, description: r.description, severity: r.severity, cooldownMs: r.cooldownMs })), recent: alerts.getHistory().slice(0, 20), thresholds: MONITORING_CONFIG.thresholds }, sentry: { enabled: getSentry(c.env).enabled }, by_category: ['auth', 'ai', 'data', 'payments', 'files', 'tenants', 'api', 'pages'].map(cat => { const part = sel.filter(s => s.category === cat); return { category: cat, count: part.length, p95: calculateP95(part.map(s => s.durationMs)), errorRate: calculateErrorRate(part) } }).filter(x => x.count) })
})
// Déclenche l'évaluation des règles maintenant (utile pour tester les canaux) : { "force": true } envoie une alerte de test
app.post('/api/admin/observability/evaluate', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const alerts = getAlertManager(c.env)
  if (b.force) { alerts.resetDedup(); const ok = await alerts.sendAlert({ severity: 'low', title: 'Test des canaux d\u2019alerte', message: `Déclenché par ${user.email}`, key: `test:${Date.now()}` }); return c.json({ ok, sent: ok ? 1 : 0 }) }
  const sent = await alerts.evaluate(getMetricsManager().snapshot({ windowMs: 15 * 60_000 }))
  return c.json({ ok: true, sent: sent.length, alerts: sent })
})

export default app
