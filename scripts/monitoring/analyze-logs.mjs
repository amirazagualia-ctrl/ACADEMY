#!/usr/bin/env node
/* ============================================================
   Rahma Academy — analyse des logs Cloudflare Workers (wrangler tail / fichiers .jsonl)
   - Entrée : --stdin (flux temps réel de tail-logs.sh) ou --file <chemin[.gz]> (archives)
   - Décode le format `wrangler tail --format json` ET les lignes JSON émises par RouteLogger
   - Filtre par sévérité (--level warn), par route (--route /api/ai), par tenant
   - Détection d'anomalies sur fenêtre glissante : pic d'erreurs 5xx, taux d'erreur, latence p95,
     pic de trafic (× médiane), rafale d'échecs d'authentification (brute force)
   - Alertes : Telegram / Slack / e-mail (Resend) / webhook, avec déduplication (cooldown)
   - Export : fichiers traités (JSON lines normalisés) vers Cloudflare R2 ou S3 (--export r2|s3)
   - Rapport : --report affiche un résumé (top routes, p95, erreurs) en fin de lecture
   Aucune dépendance npm : Node ≥ 18 (fetch, crypto, zlib natifs). AWS SigV4 implémenté en 40 lignes.

   Exemples :
     node scripts/monitoring/analyze-logs.mjs --file logs/current.jsonl --report
     node scripts/monitoring/analyze-logs.mjs --file logs/logs-20261031-100000.jsonl.gz --level error
     ANALYZE=1 scripts/monitoring/tail-logs.sh         # temps réel
     node scripts/monitoring/analyze-logs.mjs --file logs/current.jsonl --export r2
   Variables d'environnement (alertes)   : TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, SLACK_WEBHOOK_URL,
                                           RESEND_API_KEY, ALERT_EMAIL_FROM, ALERT_EMAIL_TO, ALERT_WEBHOOK_URL
   Variables d'environnement (export R2) : R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
   Variables d'environnement (export S3) : S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (S3_ENDPOINT optionnel)
   ============================================================ */
import fs from 'node:fs'
import readline from 'node:readline'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import path from 'node:path'

// ---------------- arguments ----------------
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(x => x.length))
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const CFG = {
  level: args.level || process.env.LOG_MIN_LEVEL || 'info',
  routeFilter: args.route || null,
  tenantFilter: args.tenant || null,
  windowMs: Number(args.window || process.env.ANOMALY_WINDOW_MS || 5 * 60_000),  // fenêtre d'analyse 5 min
  thresholds: {
    errors5xx: Number(process.env.T_ERRORS_5XX || 5),          // ≥ 5 erreurs 5xx dans la fenêtre
    errorRate: Number(process.env.T_ERROR_RATE || 0.05),       // > 5 %
    p95Ms: Number(process.env.T_P95_MS || 3000),               // p95 > 3 s
    trafficSpike: Number(process.env.T_TRAFFIC_X || 4),        // trafic > 4 × médiane des fenêtres précédentes
    authFailures: Number(process.env.T_AUTH_FAIL || 20),       // ≥ 20 échecs de connexion / fenêtre
    minRequests: Number(process.env.T_MIN_REQ || 20)
  },
  cooldownMs: Number(process.env.ALERT_COOLDOWN_MS || 15 * 60_000),
  outDir: args.out || process.env.PROCESSED_DIR || './logs/processed',
  export: args.export || process.env.LOG_EXPORT || null,       // r2 | s3
  report: !!args.report,
  quiet: !!args.quiet
}
const say = (...a) => { if (!CFG.quiet) console.error(`[analyze] ${new Date().toISOString()}`, ...a) }

// ---------------- normalisation des événements ----------------
/** Transforme une ligne brute en événement normalisé { ts, level, msg, route, status, durationMs, tenant, userId, requestId, raw } */
export function normalize(line) {
  let j; try { j = JSON.parse(line) } catch { return { ts: Date.now(), level: 'info', msg: line.slice(0, 500), raw: line } }
  // Format wrangler tail : { outcome, scriptName, event:{ request:{url,method} , response:{status}}, logs:[{level,message:[...]}], exceptions:[], eventTimestamp }
  if (j && (j.outcome !== undefined || j.eventTimestamp !== undefined)) {
    const req = j.event?.request || {}; const url = req.url ? new URL(req.url) : null
    const events = []
    const base = { ts: j.eventTimestamp || Date.now(), route: url ? normalizeRoute(url.pathname) : undefined, method: req.method, status: j.event?.response?.status, outcome: j.outcome, requestId: j.event?.response?.headers?.['x-request-id'] }
    for (const l of (j.logs || [])) {
      const msg = (l.message || []).map(m => typeof m === 'string' ? m : JSON.stringify(m)).join(' ')
      // RouteLogger émet déjà du JSON dans console.* → on le déplie
      let inner = null; try { inner = msg.startsWith('{') ? JSON.parse(msg) : null } catch {}
      if (inner && inner.level) events.push({ ...base, ...inner, ts: Date.parse(inner.ts) || base.ts, raw: line })
      else events.push({ ...base, level: (l.level || 'log').replace('log', 'info'), msg, raw: line })
    }
    for (const ex of (j.exceptions || [])) events.push({ ...base, level: 'error', msg: `${ex.name}: ${ex.message}`, status: base.status || 500, raw: line })
    if (!events.length) events.push({ ...base, level: j.outcome && j.outcome !== 'ok' ? 'error' : 'info', msg: `${req.method || ''} ${url?.pathname || ''} → ${base.status ?? j.outcome}`, raw: line })
    return events
  }
  // Ligne RouteLogger directe (fichier local / pm2)
  if (j && j.level && j.msg) return { ...j, ts: Date.parse(j.ts) || Date.now(), raw: line }
  return { ts: Date.now(), level: 'info', msg: JSON.stringify(j).slice(0, 500), raw: line }
}
export function normalizeRoute(p) { return p.replace(/\/[0-9a-f-]{36}(?=\/|$)/gi, '/:uuid').replace(/\/\d+(?=\/|$)/g, '/:id') }
export const percentile = (vals, p) => { if (!vals.length) return 0; const s = vals.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))] }
export const errorRate = (evs) => { const req = evs.filter(e => e.status); if (!req.length) return 0; return Math.round(req.filter(e => e.status >= 400 && e.status !== 401 && e.status !== 404).length / req.length * 1000) / 1000 }

// ---------------- détection d'anomalies ----------------
export class AnomalyDetector {
  constructor(cfg = CFG) { this.cfg = cfg; this.window = []; this.history = []; this.lastWindowStart = null }
  push(ev) {
    this.window.push(ev)
    const cutoff = ev.ts - this.cfg.windowMs
    while (this.window.length && this.window[0].ts < cutoff) this.window.shift()
  }
  /** Évalue la fenêtre courante ; renvoie une liste d'anomalies { id, severity, title, message, metadata } */
  evaluate(now = Date.now()) {
    const w = this.window.filter(e => e.ts >= now - this.cfg.windowMs)
    const reqs = w.filter(e => e.status)
    const out = []
    const T = this.cfg.thresholds
    const e5 = reqs.filter(e => e.status >= 500)
    if (e5.length >= T.errors5xx) out.push({ id: 'spike_5xx', severity: 'critical', title: 'Pic d\u2019erreurs serveur (5xx)', message: `${e5.length} erreurs 5xx en ${this.cfg.windowMs / 60000} min — routes : ${top(e5.map(e => `${e.method || ''} ${e.route || '?'}`), 3)}`, metadata: { count: e5.length, sample: e5.slice(-3).map(e => e.msg) } })
    const er = errorRate(reqs)
    if (reqs.length >= T.minRequests && er > T.errorRate) out.push({ id: 'error_rate', severity: 'high', title: 'Taux d\u2019erreur élevé', message: `${(er * 100).toFixed(1)} % d\u2019erreurs sur ${reqs.length} requêtes (seuil ${T.errorRate * 100} %)`, metadata: { errorRate: er, requests: reqs.length } })
    const durs = reqs.map(e => e.durationMs).filter(x => typeof x === 'number')
    const p95 = percentile(durs, 95)
    if (durs.length >= T.minRequests && p95 > T.p95Ms) out.push({ id: 'latency_p95', severity: 'high', title: 'Latence p95 anormale', message: `p95 = ${p95} ms (seuil ${T.p95Ms} ms) — plus lentes : ${top(reqs.filter(e => e.durationMs > T.p95Ms).map(e => e.route || '?'), 3)}`, metadata: { p95, requests: durs.length } })
    // pic de trafic : comparer au médian des fenêtres précédentes
    const winStart = Math.floor(now / this.cfg.windowMs) * this.cfg.windowMs
    if (this.lastWindowStart !== null && winStart !== this.lastWindowStart) { this.history.push(this.lastCount || 0); if (this.history.length > 24) this.history.shift() }
    this.lastWindowStart = winStart; this.lastCount = reqs.length
    const med = percentile(this.history, 50)
    if (this.history.length >= 3 && med >= 5 && reqs.length > med * T.trafficSpike) out.push({ id: 'traffic_spike', severity: 'medium', title: 'Pic de trafic', message: `${reqs.length} requêtes / fenêtre contre une médiane de ${med} (× ${(reqs.length / med).toFixed(1)})`, metadata: { current: reqs.length, median: med } })
    const authFail = w.filter(e => /login_failed|login_blocked|Identifiants incorrects|Trop de tentatives/i.test(e.msg || '') || (e.route === '/api/auth/login' && e.status === 401)).length
    if (authFail >= T.authFailures) out.push({ id: 'auth_bruteforce', severity: 'high', title: 'Rafale d\u2019échecs de connexion', message: `${authFail} échecs d\u2019authentification en ${this.cfg.windowMs / 60000} min — possible attaque par force brute`, metadata: { failures: authFail, ips: top(w.filter(e => e.route === '/api/auth/login').map(e => e.ip || '?'), 3) } })
    return out
  }
}
const top = (arr, n) => { const c = {}; arr.forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v})`).join(', ') || '—' }

// ---------------- alertes (mêmes canaux que src/monitoring.ts) ----------------
export class Alerter {
  constructor(env = process.env, cooldownMs = CFG.cooldownMs, fetchImpl = globalThis.fetch) { this.env = env; this.cooldownMs = cooldownMs; this.last = {}; this.fetch = fetchImpl; this.sent = [] }
  dedup(key) { const now = Date.now(); if (now - (this.last[key] || 0) < this.cooldownMs) return false; this.last[key] = now; return true }
  async send(a) {
    if (!this.dedup(a.id)) return false
    const E = this.env; const emoji = { low: 'ℹ️', medium: '⚠️', high: '🔥', critical: '🚨' }[a.severity] || '⚠️'
    const text = `${emoji} [rahma-academy · logs] ${a.title}\n${a.message}\n${new Date().toISOString()}`
    const tasks = []
    if (E.TELEGRAM_BOT_TOKEN && E.TELEGRAM_ADMIN_CHAT_ID) tasks.push(this.fetch(`https://api.telegram.org/bot${E.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: E.TELEGRAM_ADMIN_CHAT_ID, text }) }))
    if (E.SLACK_WEBHOOK_URL) tasks.push(this.fetch(E.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }))
    if (E.RESEND_API_KEY && E.ALERT_EMAIL_TO) tasks.push(this.fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${E.RESEND_API_KEY}` }, body: JSON.stringify({ from: E.ALERT_EMAIL_FROM || 'alerts@rahma-academy.tn', to: E.ALERT_EMAIL_TO.split(','), subject: `[${a.severity.toUpperCase()}] ${a.title}`, text }) }))
    if (E.ALERT_WEBHOOK_URL) tasks.push(this.fetch(E.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'analyze-logs', alert: a }) }))
    if (!tasks.length) console.error(text)
    await Promise.allSettled(tasks)
    this.sent.push({ ...a, at: new Date().toISOString() }); return true
  }
}

// ---------------- export R2 / S3 (SigV4 natif) ----------------
function hmac(key, data, enc) { return crypto.createHmac('sha256', key).update(data).digest(enc) }
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex') }
export async function putObjectS3({ endpoint, region, bucket, key, body, accessKeyId, secretAccessKey, contentType = 'application/x-ndjson', fetchImpl = globalThis.fetch }) {
  const host = new URL(endpoint).host; const url = `${endpoint.replace(/\/$/, '')}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  const now = new Date(); const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); const date = amzDate.slice(0, 8)
  const payloadHash = sha256(body)
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'content-type': contentType }
  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonical = ['PUT', new URL(url).pathname, '', ...Object.keys(headers).sort().map(h => `${h}:${headers[h]}`), '', signedHeaders, payloadHash].join('\n')
  const scope = `${date}/${region}/s3/aws4_request`
  const sts = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')
  const kDate = hmac('AWS4' + secretAccessKey, date); const kRegion = hmac(kDate, region); const kService = hmac(kRegion, 's3'); const kSigning = hmac(kService, 'aws4_request')
  const signature = hmac(kSigning, sts, 'hex')
  const auth = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const res = await fetchImpl(url, { method: 'PUT', headers: { ...headers, Authorization: auth }, body })
  if (!res.ok) throw new Error(`export ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300))
  return url
}
export async function exportProcessed(filePath, target = CFG.export, env = process.env) {
  const body = fs.readFileSync(filePath)
  const key = `rahma-logs/${new Date().toISOString().slice(0, 10)}/${path.basename(filePath)}`
  if (target === 'r2') {
    if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new Error('R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY requis')
    return putObjectS3({ endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region: 'auto', bucket: env.R2_BUCKET, key, body, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY })
  }
  if (target === 's3') {
    if (!env.S3_BUCKET || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) throw new Error('S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY requis')
    const region = env.S3_REGION || 'eu-west-3'
    return putObjectS3({ endpoint: env.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`, region, bucket: env.S3_BUCKET, key, body, accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY })
  }
  throw new Error(`cible d\u2019export inconnue : ${target}`)
}

// ---------------- rapport ----------------
export function report(evs) {
  const reqs = evs.filter(e => e.status); const durs = reqs.map(e => e.durationMs).filter(x => typeof x === 'number')
  const byRoute = {}; reqs.forEach(e => { const k = `${e.method || ''} ${e.route || '?'}`; (byRoute[k] = byRoute[k] || []).push(e) })
  const rows = Object.entries(byRoute).map(([k, a]) => ({ route: k, n: a.length, p95: percentile(a.map(x => x.durationMs || 0), 95), err: a.filter(x => x.status >= 500).length })).sort((a, b) => b.n - a.n).slice(0, 15)
  const byLevel = {}; evs.forEach(e => byLevel[e.level] = (byLevel[e.level] || 0) + 1)
  return { events: evs.length, requests: reqs.length, byLevel, errorRate: errorRate(reqs), p50: percentile(durs, 50), p95: percentile(durs, 95), p99: percentile(durs, 99), errors5xx: reqs.filter(e => e.status >= 500).length, topRoutes: rows, from: evs.length ? new Date(Math.min(...evs.map(e => e.ts))).toISOString() : null, to: evs.length ? new Date(Math.max(...evs.map(e => e.ts))).toISOString() : null }
}

// ---------------- programme principal ----------------
async function main() {
  const detector = new AnomalyDetector(); const alerter = new Alerter()
  fs.mkdirSync(CFG.outDir, { recursive: true })
  const outFile = path.join(CFG.outDir, `processed-${new Date().toISOString().slice(0, 13).replace(/[:T]/g, '-')}.jsonl`)
  const out = fs.createWriteStream(outFile, { flags: 'a' })
  const all = []; let lastEval = 0; const minRank = LEVELS[CFG.level] || 20
  const input = args.stdin ? process.stdin : args.file ? (args.file.endsWith('.gz') ? fs.createReadStream(args.file).pipe(zlib.createGunzip()) : fs.createReadStream(args.file)) : null
  if (!input) { console.error('Usage : analyze-logs.mjs --stdin | --file <chemin.jsonl[.gz]> [--level warn] [--route /api/ai] [--tenant slug] [--report] [--export r2|s3]'); process.exit(2) }
  const rl = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    const evs = [].concat(normalize(line))
    for (const ev of evs) {
      if (CFG.routeFilter && !(ev.route || '').startsWith(CFG.routeFilter)) continue
      if (CFG.tenantFilter && ev.tenant !== CFG.tenantFilter) continue
      detector.push(ev)
      if ((LEVELS[ev.level] || 20) >= minRank) { const { raw, ...clean } = ev; out.write(JSON.stringify(clean) + '\n'); if (CFG.report) all.push(ev); if (args.stdin && !CFG.quiet && ev.level !== 'info') console.log(`${new Date(ev.ts).toISOString()} ${ev.level.toUpperCase().padEnd(5)} ${ev.status || ''} ${ev.route || ''} ${ev.durationMs ? ev.durationMs + 'ms' : ''} ${ev.msg || ''}`.trim()) }
      if (ev.ts - lastEval > 10_000) { lastEval = ev.ts; for (const a of detector.evaluate(ev.ts)) if (await alerter.send(a)) say(`ALERTE ${a.severity} : ${a.title}`) }
    }
  }
  for (const a of detector.evaluate(Date.now())) if (await alerter.send(a)) say(`ALERTE ${a.severity} : ${a.title}`)
  await new Promise(r => out.end(r))
  if (CFG.report) console.log(JSON.stringify(report(all), null, 2))
  if (CFG.export) { try { const url = await exportProcessed(outFile); say(`export OK → ${url}`) } catch (e) { say(`export ÉCHEC : ${e.message}`); process.exitCode = 1 } }
  say(`terminé — ${outFile}${alerter.sent.length ? ` · ${alerter.sent.length} alerte(s)` : ''}`)
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1) })
