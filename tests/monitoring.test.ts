/* Tests unitaires — src/monitoring.ts (MetricsManager, AlertManager, utilitaires, Sentry, middleware)
   Lancer : npm run test:monitoring  (vitest) */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import {
  MetricsManager, AlertManager, DEFAULT_RULES, MONITORING_CONFIG,
  calculateP95, calculatePercentile, calculateErrorRate, calculateApdex, normalizeRoute, categorize, redact,
  initSentryForRahmaAcademy, monitoringMiddleware, resetMonitoringForTests, getMetricsManager, RouteLogger
} from '../src/monitoring'

const T0 = Date.parse('2026-10-31T10:00:00Z')
const H = 3600_000, D = 86_400_000

function fakeSnapshot(over: any = {}) {
  const m = new MetricsManager()
  return { ...m.snapshot({ windowMs: 60_000 }), ...over, requests: { total: 100, perMinute: 100, errors4xx: 0, errors5xx: 0, errorRate: 0, p50: 100, p95: 200, p99: 300, avg: 120, apdex: 0.95, ...(over.requests || {}) } }
}

describe('utilitaires statistiques', () => {
  it('calculateP95 / percentiles', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    expect(calculateP95(v)).toBe(95)
    expect(calculatePercentile(v, 50)).toBe(50)
    expect(calculatePercentile(v, 99)).toBe(99)
    expect(calculateP95([])).toBe(0)
    expect(calculateP95([42])).toBe(42)
    expect(calculateP95([5, 1, 3])).toBe(5)
  })
  it('calculateErrorRate ignore 401/404 par défaut, arrondi 0,1 %', () => {
    const s = [200, 200, 500, 404, 401, 400, 503, 200, 200, 200].map(status => ({ status }))
    expect(calculateErrorRate(s)).toBe(0.3)             // 500, 400, 503 sur 10
    expect(calculateErrorRate(s, { only5xx: true })).toBe(0.2)
    expect(calculateErrorRate(s, { ignore: [] })).toBe(0.5)
    expect(calculateErrorRate([])).toBe(0)
    expect(calculateErrorRate([{ status: 200 }, { status: 200 }, { status: 500 }])).toBe(0.333)
  })
  it('calculateApdex', () => {
    expect(calculateApdex([100, 200, 300], 500)).toBe(1)
    expect(calculateApdex([100, 1000, 5000], 500)).toBe(0.5) // 1 satisfait, 1 toléré (≤2000), 1 frustré
    expect(calculateApdex([], 500)).toBe(1)
  })
  it('normalizeRoute / categorize', () => {
    expect(normalizeRoute('/api/students/123')).toBe('/api/students/:id')
    expect(normalizeRoute('/api/x/3fa85f64-5717-4562-b3fc-2c963f66afa6/y/9')).toBe('/api/x/:uuid/y/:id')
    expect(normalizeRoute('/e/my-academy')).toBe('/e/:slug')
    expect(categorize('/api/auth/login')).toBe('auth')
    expect(categorize('/api/ai/tutor')).toBe('ai')
    expect(categorize('/api/tenants/x')).toBe('tenants')
    expect(categorize('/')).toBe('pages')
  })
  it('redact masque les secrets', () => {
    const r: any = redact({ password: 'x', nested: { api_key: 'k', ok: 1 }, token: 't', list: [{ secret: 's' }] })
    expect(r.password).toBe('***'); expect(r.nested.api_key).toBe('***'); expect(r.nested.ok).toBe(1); expect(r.list[0].secret).toBe('***')
  })
})

describe('MetricsManager', () => {
  let m: MetricsManager
  beforeEach(() => { m = new MetricsManager(); vi.spyOn(m, 'now').mockReturnValue(T0) })

  it('enregistre les requêtes et produit un instantané cohérent', () => {
    for (let i = 0; i < 10; i++) m.recordRequest({ route: '/api/students', method: 'GET', status: i === 9 ? 500 : 200, durationMs: 100 + i * 10, tenant: 'rahma' })
    m.recordRequest({ route: '/api/auth/login', method: 'POST', status: 401, durationMs: 20 })
    const s = m.snapshot({ windowMs: H })
    expect(s.requests.total).toBe(11)
    expect(s.requests.errors5xx).toBe(1)
    expect(s.requests.errors4xx).toBe(1)
    expect(s.requests.errorRate).toBe(0.091)  // 401 ignoré → 1/11
    expect(s.statuses).toEqual({ '2xx': 9, '5xx': 1, '4xx': 1 })
    expect(s.endpoints[0].route).toBe('/api/students'); expect(s.endpoints[0].count).toBe(10); expect(s.endpoints[0].p95).toBe(190)
    expect(s.tenants.rahma.count).toBe(10)
    expect(s.recentErrors[0].status).toBe(500)
    expect(s.slowest[0].durationMs).toBe(190)
  })

  it('fenêtre glissante de 7 jours : prune() supprime les anciens échantillons et points', () => {
    m.recordRequest({ ts: T0 - 8 * D, route: '/old', method: 'GET', status: 200, durationMs: 10 })
    m.recordRequest({ ts: T0 - 6 * D, route: '/keep', method: 'GET', status: 200, durationMs: 10 })
    m.recordRequest({ route: '/now', method: 'GET', status: 200, durationMs: 10 })
    m.recordMetric('db.query_time', 50, 'ms'); (m as any).metrics['db.query_time'][0].ts = T0 - 10 * D
    m.recordMetric('db.query_time', 70, 'ms')
    expect(m.size.samples).toBe(3)
    const removed = m.prune()
    expect(removed).toBe(1)
    expect(m.select().map(s => s.route)).toEqual(['/keep', '/now'])
    expect(m.getAggregatedMetrics()['db.query_time'].count).toBe(1)
    expect(MONITORING_CONFIG.retentionMs).toBe(7 * D)
  })

  it('filtre par plage temporelle, catégorie et tenant', () => {
    m.recordRequest({ ts: T0 - 2 * H, route: '/api/ai/tutor', method: 'POST', status: 200, durationMs: 900, tenant: 'a' })
    m.recordRequest({ ts: T0 - 10 * 60_000, route: '/api/db/students', method: 'GET', status: 200, durationMs: 50, tenant: 'b' })
    m.recordRequest({ ts: T0 - 5 * 60_000, route: '/api/db/fees', method: 'GET', status: 200, durationMs: 60, tenant: 'b' })
    expect(m.snapshot({ windowMs: H }).requests.total).toBe(2)
    expect(m.snapshot({ windowMs: 3 * H }).requests.total).toBe(3)
    expect(m.snapshot({ windowMs: 3 * H, category: 'ai' }).requests.total).toBe(1)
    expect(m.snapshot({ windowMs: 3 * H, tenant: 'b' }).requests.total).toBe(2)
    expect(m.select({ from: T0 - 3 * H, to: T0 - H }).length).toBe(1)
  })

  it('métriques personnalisées : recordMetric, timers, agrégation', () => {
    m.recordMetric('cache.hits', 1); m.recordMetric('cache.hits', 1); m.increment('cache.hits', 3)
    m.startTimer('op'); (m.now as any).mockReturnValue(T0 + 250); const d = m.endTimer('op', 'custom.op_time')
    expect(d).toBe(250)
    const agg = m.getAggregatedMetrics()
    expect(agg['cache.hits']).toMatchObject({ count: 3, sum: 5, unit: 'count' })
    expect(agg['custom.op_time']).toMatchObject({ count: 1, avg: 250, p95: 250, unit: 'ms' })
  })

  it('plafonne la mémoire (maxSamples)', () => {
    const small = new MetricsManager({ ...MONITORING_CONFIG, maxSamples: 5 })
    for (let i = 0; i < 20; i++) small.recordRequest({ route: '/x', method: 'GET', status: 200, durationMs: i })
    expect(small.size.samples).toBe(5)
    expect(small.select()[0].durationMs).toBe(15)
  })

  it('export Prometheus valide', () => {
    m.recordRequest({ route: '/api/students', method: 'GET', status: 200, durationMs: 120 })
    m.recordRequest({ route: '/api/students', method: 'GET', status: 500, durationMs: 800 })
    m.recordMetric('db.query_time', 40, 'ms')
    const txt = m.toPrometheus({ windowMs: H })
    expect(txt).toContain('# TYPE rahma_http_requests_total gauge')
    expect(txt).toContain('rahma_http_requests_total{method="GET",route="/api/students"} 2')
    expect(txt).toContain('rahma_http_request_duration_ms{method="GET",route="/api/students",quantile="0.95"} 800')
    expect(txt).toContain('rahma_http_error_rate{method="GET",route="/api/students"} 0.5')
    expect(txt).toContain('rahma_http_status_total{class="5xx"} 1')
    expect(txt).toContain('rahma_custom_metric{name="db.query_time",stat="p95",unit="ms"} 40')
    expect(txt.endsWith('\n')).toBe(true)
  })

  it('export / import (persistance) fusionne sans doublon et purge', () => {
    m.recordRequest({ route: '/a', method: 'GET', status: 200, durationMs: 10 })
    const state = m.export()
    const m2 = new MetricsManager(); vi.spyOn(m2, 'now').mockReturnValue(T0)
    m2.recordRequest({ route: '/b', method: 'GET', status: 200, durationMs: 20 })
    m2.import(state); m2.import(state)
    expect(m2.size.samples).toBe(2)
    expect(m2.select().map(s => s.route)).toEqual(['/a', '/b'])
  })

  it('persist() vers KV respecte l\u2019intervalle et le flag dirty', async () => {
    const put = vi.fn().mockResolvedValue(undefined); const kv = { put, get: vi.fn() } as any
    expect(await m.persist(kv)).toBe(false)                     // rien à écrire
    m.recordRequest({ route: '/a', method: 'GET', status: 200, durationMs: 1 })
    expect(await m.persist(kv)).toBe(true); expect(put).toHaveBeenCalledTimes(1)
    m.recordRequest({ route: '/a', method: 'GET', status: 200, durationMs: 1 })
    expect(await m.persist(kv)).toBe(false)                     // < persistEveryMs
    ;(m.now as any).mockReturnValue(T0 + 61_000)
    expect(await m.persist(kv)).toBe(true); expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[0][0]).toBe('monitoring:state')
    expect(put.mock.calls[0][2].expirationTtl).toBe(7 * D / 1000)
  })
})

describe('AlertManager', () => {
  const mkFetch = () => vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

  it('déduplication : une seule alerte par clé pendant le cooldown, puis à nouveau', async () => {
    let now = T0; const fetchImpl = mkFetch()
    const am = new AlertManager({ telegram: { botToken: 'T', chatId: 'C' }, console: false }, { fetchImpl, now: () => now, cooldownMs: 60_000 })
    expect(await am.sendAlert({ severity: 'high', title: 'DB lente', message: 'p95 1200 ms' })).toBe(true)
    expect(await am.sendAlert({ severity: 'high', title: 'DB lente', message: 'p95 1300 ms' })).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    now += 61_000
    expect(await am.sendAlert({ severity: 'high', title: 'DB lente', message: 'p95 1400 ms' })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(am.getHistory()).toHaveLength(2)
    expect(am.getHistory()[0].channels).toEqual(['telegram'])
  })

  it('envoie sur tous les canaux configurés avec les bons formats', async () => {
    const fetchImpl = mkFetch()
    const am = new AlertManager({ telegram: { botToken: 'T', chatId: 'C' }, slack: { webhookUrl: 'https://hooks.slack/x' }, email: { resendApiKey: 'R', from: 'a@b.tn', to: ['c@d.tn'] }, webhook: { url: 'https://hook/x', secret: 's3cret' }, console: false }, { fetchImpl, env: 'test' })
    await am.sendAlert({ severity: 'critical', title: 'Panne <DB>', message: 'down', metadata: { connections: 125 } })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    const urls = fetchImpl.mock.calls.map((c: any) => c[0])
    expect(urls).toContain('https://api.telegram.org/botT/sendMessage'); expect(urls).toContain('https://hooks.slack/x'); expect(urls).toContain('https://api.resend.com/emails'); expect(urls).toContain('https://hook/x')
    const tg = JSON.parse(fetchImpl.mock.calls.find((c: any) => c[0].includes('telegram'))![1].body)
    expect(tg.parse_mode).toBe('HTML'); expect(tg.text).toContain('&lt;DB&gt;'); expect(tg.text).toContain('🚨')
    const slack = JSON.parse(fetchImpl.mock.calls.find((c: any) => c[0].includes('slack'))![1].body)
    expect(slack.attachments[0].color).toBe('#dc2626'); expect(slack.attachments[0].fields[0]).toMatchObject({ title: 'connections', value: '125' })
    const mail = fetchImpl.mock.calls.find((c: any) => c[0].includes('resend'))![1]
    expect(mail.headers.Authorization).toBe('Bearer R'); expect(JSON.parse(mail.body).subject).toContain('[CRITICAL]')
    const wh = fetchImpl.mock.calls.find((c: any) => c[0] === 'https://hook/x')![1]
    expect(wh.headers['X-Signature-256']).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('tolère l\u2019échec d\u2019un canal sans bloquer les autres', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => url.includes('slack') ? Promise.reject(new Error('down')) : Promise.resolve(new Response('{}')))
    const am = new AlertManager({ slack: { webhookUrl: 'https://slack/x' }, webhook: { url: 'https://hook/x' }, console: false }, { fetchImpl })
    expect(await am.sendAlert({ severity: 'low', title: 't', message: 'm' })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('evaluate() applique les règles par défaut sur un instantané', async () => {
    const fetchImpl = mkFetch()
    const am = new AlertManager({ webhook: { url: 'https://hook/x' }, console: false }, { fetchImpl })
    expect(await am.evaluate(fakeSnapshot())).toHaveLength(0)                                          // tout va bien
    const sent = await am.evaluate(fakeSnapshot({ requests: { p95: 5000, errorRate: 0.1, errors5xx: 10 }, recentErrors: [{ method: 'GET', route: '/x', status: 500 }] }))
    expect(sent.map(a => a.rule).sort()).toEqual(['error_5xx', 'error_rate', 'p95_latency'])
    expect(sent.find(a => a.rule === 'p95_latency')!.message).toContain('5000 ms')
    expect(await am.evaluate(fakeSnapshot({ requests: { p95: 5000 } }))).toHaveLength(0)                // dédupliqué (cooldown)
    expect(await am.evaluate(fakeSnapshot({ requests: { total: 5, p95: 9000 } }))).toHaveLength(0)       // sous minRequestsForRate
  })

  it('règle db_slow et règles personnalisées', async () => {
    const fetchImpl = mkFetch()
    const am = new AlertManager({ webhook: { url: 'https://hook/x' }, console: false }, { fetchImpl, rules: [...DEFAULT_RULES, { id: 'custom', description: 'Trop de tenants', severity: 'low', when: m => Object.keys(m.tenants).length > 2 }] })
    const snap = fakeSnapshot({ metrics: { 'db.query_time': { count: 10, sum: 0, avg: 900, min: 10, max: 3000, p50: 800, p95: 2500, p99: 3000, unit: 'ms' } }, tenants: { a: {}, b: {}, c: {} } })
    const sent = await am.evaluate(snap)
    expect(sent.map(a => a.rule).sort()).toEqual(['custom', 'db_slow'])
  })

  it('fromEnv() construit les canaux depuis les variables d\u2019environnement', async () => {
    const fetchImpl = mkFetch()
    const am = AlertManager.fromEnv({ TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_ADMIN_CHAT_ID: 'C', ALERT_EMAIL_TO: 'a@x.tn, b@x.tn', RESEND_API_KEY: 'R', APP_ENV: 'development' }, { fetchImpl })
    await am.sendAlert({ severity: 'medium', title: 'x', message: 'y' })
    expect(am.getHistory()[0].channels.sort()).toEqual(['console', 'email', 'telegram'])
    const mail = JSON.parse(fetchImpl.mock.calls.find((c: any) => c[0].includes('resend'))![1].body)
    expect(mail.to).toEqual(['a@x.tn', 'b@x.tn'])
  })
})

describe('Sentry (Workers, API envelope)', () => {
  it('désactivé sans DSN ; actif avec DSN ; filtre les erreurs ignorées ; envoie une enveloppe valide', async () => {
    expect(initSentryForRahmaAcademy({}).enabled).toBe(false)
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}'))
    const s = initSentryForRahmaAcademy({ SENTRY_DSN: 'https://abc123@o1.ingest.sentry.io/42', APP_ENV: 'production', SENTRY_RELEASE: 'v1' }, { fetchImpl })
    expect(s.enabled).toBe(true)
    await s.captureException(new Error('Non authentifié'))
    expect(fetchImpl).not.toHaveBeenCalled()
    await s.captureException(new Error('Boom'), { requestId: 'r1', tenant: 'my-academy', user: { id: 7, role: 'admin' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://o1.ingest.sentry.io/api/42/envelope/')
    expect(init.headers['X-Sentry-Auth']).toContain('sentry_key=abc123')
    const lines = init.body.trim().split('\n'); expect(lines).toHaveLength(3)
    const item = JSON.parse(lines[2])
    expect(item.exception.values[0].value).toBe('Boom'); expect(item.tags.tenant).toBe('my-academy'); expect(item.user.id).toBe('7'); expect(item.release).toBe('v1'); expect(item.environment).toBe('production')
  })
  it('échantillonnage des transactions par environnement', () => {
    expect(initSentryForRahmaAcademy({ SENTRY_DSN: 'https://k@h/1', SENTRY_TRACES_SAMPLE_RATE: '0' }).shouldSampleTransaction()).toBe(false)
    expect(initSentryForRahmaAcademy({ SENTRY_DSN: 'https://k@h/1', SENTRY_TRACES_SAMPLE_RATE: '1' }).shouldSampleTransaction()).toBe(true)
  })
})

describe('monitoringMiddleware (Hono)', () => {
  beforeEach(() => resetMonitoringForTests())
  it('ajoute X-Request-Id, mesure et enregistre les requêtes, ignore /static', async () => {
    const app = new Hono()
    app.use('*', monitoringMiddleware({ resolveTenant: () => 'rahma' }))
    app.get('/api/students/:id', c => c.json({ ok: true }))
    app.get('/boom', () => { throw new Error('crash') })
    app.get('/static/x.js', c => c.text('js'))
    app.onError((_e, c) => c.json({ error: 'x' }, 500))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r1 = await app.request('/api/students/42', { headers: { 'X-Request-Id': 'abc' } })
    expect(r1.headers.get('X-Request-Id')).toBe('abc'); expect(r1.headers.get('Server-Timing')).toMatch(/^app;dur=\d+$/)
    const r2 = await app.request('/boom'); expect(r2.status).toBe(500)
    await app.request('/static/x.js')
    const snap = getMetricsManager().snapshot({ windowMs: 60_000 })
    expect(snap.requests.total).toBe(2)
    expect(snap.endpoints.find(e => e.route === '/api/students/:id')!.count).toBe(1)
    expect(snap.requests.errors5xx).toBe(1)
    expect(snap.tenants.rahma.count).toBe(2)
    const logged = JSON.parse(logSpy.mock.calls[0][0]); expect(logged).toMatchObject({ level: 'info', msg: 'request', requestId: 'abc', route: '/api/students/:id', status: 200, tenant: 'rahma' })
    const errLog = JSON.parse(errSpy.mock.calls[0][0]); expect(errLog.level).toBe('error'); expect(errLog.error.message).toBe('crash')
    logSpy.mockRestore(); errSpy.mockRestore()
  })
  it('RouteLogger : niveaux, contexte hérité, redaction', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {}); const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const l = new RouteLogger({ requestId: 'r' }, { minLevel: 'info' }).child({ table: 'students' })
    l.debug('hidden'); l.info('hello', { password: 'p' }); l.warn('careful')
    expect(dbg).not.toHaveBeenCalled(); expect(warn).toHaveBeenCalledTimes(1)
    const e = JSON.parse(spy.mock.calls[0][0]); expect(e).toMatchObject({ requestId: 'r', table: 'students', msg: 'hello', password: '***', service: 'rahma-academy' })
    spy.mockRestore(); warn.mockRestore(); dbg.mockRestore()
  })
})
