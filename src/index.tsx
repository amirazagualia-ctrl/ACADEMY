// Rahma Academy — point d'entrée Hono (Palier 2 : index allégé, domaines dans src/routes/*, helpers dans src/lib/*)
// L'ordre de montage des sous-apps reproduit l'ordre d'enregistrement d'origine (routes qui se recouvrent).
import { Hono } from 'hono'
import { monitoringMiddleware } from './monitoring'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { AsyncLocalStorage } from 'node:async_hooks'
import { _health, healthReport, refreshAdminChatsCache } from './lib/notify'
import { currentYear, requestedYear, yearCtx } from './lib/supabase'
import { TC, cfg, defaultTenant, resolveTenant, tenantCtx, tenantSlug } from './lib/tenant'
import { getEdition } from './lib/edition'
import { DEMO_READ_ONLY_ERROR, editionWriteBlocked, isWriteMethod } from './lib/edition-rules'
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, csrfExempt, csrfMatches } from './lib/session-rules'
import { apiGateDecision, isPublicApi } from './lib/route-guard'
import { securityHeaders } from './lib/security-headers'
import { getUser } from './lib/auth'
import { parseCookie, publicOrigin } from './lib/utils'
import type { Bindings } from './types/bindings'
import notificationsRoutes from './routes/notifications'
import authRoutes from './routes/auth'
import brandRoutes from './routes/brand'
import tenantsRoutes from './routes/tenants'
import studentsRoutes from './routes/students'
import adminRoutes from './routes/admin'
import dbRoutes from './routes/db'
import examsRoutes from './routes/exams'
import schoolYearsRoutes from './routes/school-years'
import feesRoutes from './routes/fees'
import telegramRoutes from './routes/telegram'
import observabilityRoutes from './routes/observability'
import chatRoutes from './routes/chat'
import homeworksRoutes from './routes/homeworks'
import documentsRoutes from './routes/documents'
import reportsRoutes from './routes/reports'
import paymentsRoutes from './routes/payments'
import progressRoutes from './routes/progress'
import aiRoutes from './routes/ai'
import evaluationsRoutes from './routes/evaluations'
import bankRoutes from './routes/bank'
import curriculumRoutes from './routes/curriculum'
import importsRoutes from './routes/imports'
import certificatesRoutes from './routes/certificates'
import editionsRoutes from './routes/editions'
import pagesRoutes from './routes/pages'

// SÉCURITÉ : aucun secret dans le code. Tout vient des variables d'environnement
// (.dev.vars en local, secrets Cloudflare en production). Voir .dev.vars.example.
const app = new Hono<{ Bindings: Bindings }>()

// Observabilité : request-id, logs JSON, métriques (fenêtre 7 j), alertes, Sentry — voir src/monitoring.ts et docs/monitoring
app.use('*', monitoringMiddleware({ resolveTenant: () => tenantSlug(), resolveUser: (c) => (c.get('monUser' as never) as any) || null }))
// L3 : en-têtes de sécurité sur TOUTES les réponses (y compris les refus précoces).
// CSP volontairement permissive sur les scripts : ~874 gestionnaires `onclick` en ligne et
// Tailwind CDN (eval) rendraient `script-src 'self'` destructeur. Les directives fermées
// (object-src, base-uri, form-action, frame-ancestors) ne dépendent pas des scripts.
app.use('*', async (c, next) => {
  await next()
  const h = securityHeaders({ secure: publicOrigin(c).startsWith('https') })
  for (const [k, v] of Object.entries(h)) {
    try { c.header(k, v) } catch { /* réponse déjà scellée (ex. redirection) */ }
  }
})
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
    if (db === 'ok' && (!TC._adminChatsCache || Date.now() - TC._adminChatsCache.at > 3600_000)) refreshAdminChatsCache(env).catch(() => {})
  }
  const status = db === 'ok' ? 'ok' : 'degraded'
  return c.json({
    status, env: env.APP_ENV || 'production', time: new Date().toISOString(), db, db_latency_ms: dbMs, db_error: dbError || undefined,
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
  // F63 : établissement de la requête (base dédiée) — les routes /api/tenants/* et /api/health tournent sur la base maître
  const path = new URL(c.req.url).pathname
  // L2 : protection CSRF par double-submit sur les écritures authentifiées par COOKIE.
  // Placé AVANT la branche /api/tenants pour couvrir aussi la gestion des établissements.
  // Les requêtes Bearer (scripts, API) n'envoient pas de cookie de session : elles ne sont pas concernées.
  // Connexion / inscription / retour Google / rafraîchissement sont exemptés (pas encore de session).
  // Mode dégradé : cookie CSRF absent (session héritée) -> on ne bloque pas, sinon l'utilisateur
  // ne pourrait même plus se déconnecter.
  if (isWriteMethod(c.req.method) && !csrfExempt(c.req.method, path) && parseCookie(c, SESSION_COOKIE)) {
    const csrfCookie = parseCookie(c, CSRF_COOKIE)
    if (csrfCookie && !csrfMatches(c.req.header(CSRF_HEADER), csrfCookie)) {
      return c.json({ error: 'Jeton de sécurité (CSRF) absent ou invalide. Rechargez la page puis réessayez.', code: 'csrf' }, 403)
    }
  }
  // L3 : la branche /api/tenants (base maître) passe elle aussi par la garde — sinon
  // /api/tenants/admin/* ne serait protégé que par le contrôle interne de chaque route.
  if (path.startsWith('/api/tenants') || path === '/api/health') return tenantCtx.run(defaultTenant(c.env), async () => {
    if (!isPublicApi(c.req.method, path)) {
      const monUser = await getUser(c)
      const deny = apiGateDecision(c.req.method, path, !!monUser)
      if (deny) return c.json({ error: deny.error }, deny.status)
    }
    return next()
  })
  const tenant = await resolveTenant(c)
  if (tenant.status === 'suspended') return c.json({ error: `L'établissement « ${tenant.name} » est suspendu. Contactez l'administrateur de la plateforme.` }, 403)
  if (tenant.status === 'pending' && !path.startsWith('/api/auth/') && !path.startsWith('/api/brand') && !path.startsWith('/api/public/')) return c.json({ error: `L'établissement « ${tenant.name} » est en attente de validation par l'administrateur de la plateforme.` }, 403)
  return tenantCtx.run(tenant, async () => {
    // L3 : garde d'autorisation par défaut. Toute route /api/* non listée comme publique exige
    // une session — une future route qui oublierait son contrôle est donc fermée, pas ouverte.
    // On n'interroge la session que si la route n'est pas publique (aucun coût sur /api/brand,
    // /api/public/*, webhooks…). getUser() est mémoïsé : les routes le rappellent gratuitement.
    // Ne change AUCUNE autorisation métier : les rôles restent vérifiés dans chaque route.
    if (!isPublicApi(c.req.method, path)) {
      const monUser = await getUser(c)
      const deny = apiGateDecision(c.req.method, path, !!monUser)
      if (deny) return c.json({ error: deny.error }, deny.status)
    }
    let year: string | null = null
    try { const cy = await currentYear(c.env); if (cy) year = requestedYear(c) || cy } catch {}
    // F71 : lecture seule de l'édition démo — imposée CÔTÉ SERVEUR, jamais côté client.
    // On n'interroge l'édition que sur les méthodes d'écriture (aucun surcoût sur les GET).
    if (isWriteMethod(c.req.method)) {
      let readOnly = false
      try { readOnly = (await getEdition(c.env)).read_only } catch { /* base indisponible : on laisse passer */ }
      if (editionWriteBlocked(c.req.method, path, readOnly)) {
        return c.json({ error: DEMO_READ_ONLY_ERROR, edition: 'demo', read_only: true }, 403)
      }
    }
    await yearCtx.run(year, () => next())
  })
})

// ---- Montage des domaines (ordre significatif) ----
app.route('/', notificationsRoutes)
app.route('/', authRoutes)
app.route('/', brandRoutes)
app.route('/', tenantsRoutes)
app.route('/', studentsRoutes)
app.route('/', adminRoutes)
app.route('/', dbRoutes)
app.route('/', examsRoutes)
app.route('/', schoolYearsRoutes)
app.route('/', feesRoutes)
app.route('/', telegramRoutes)
app.route('/', observabilityRoutes)
app.route('/', chatRoutes)
app.route('/', homeworksRoutes)
app.route('/', documentsRoutes)
app.route('/', reportsRoutes)
app.route('/', paymentsRoutes)
app.route('/', progressRoutes)
app.route('/', aiRoutes)
app.route('/', evaluationsRoutes)
app.route('/', bankRoutes)
app.route('/', curriculumRoutes)
app.route('/', importsRoutes)
app.route('/', certificatesRoutes)
app.route('/', editionsRoutes)
app.route('/', pagesRoutes)

export default app
