# ⚙️ Configuration

Toutes les variables sont **facultatives** : sans aucune d'elles, le monitoring fonctionne en mémoire avec les logs `console.*` (visibles dans `wrangler tail` et le tableau de bord Cloudflare) et des alertes en console.

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `APP_ENV` | `development` → logs `debug`, Sentry 100 % | `production` |
| `LOG_LEVEL` | `debug` · `info` · `warn` · `error` | `info` (`debug` en dev) |
| `MONITORING_SAMPLE_RATE` | part des requêtes **réussies** journalisées (0..1) — erreurs et lenteurs toujours loggées | `1` |
| `MONITORING_KV` | binding KV : persistance des métriques entre isolates (**BYOK uniquement**) | — |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` | canal Telegram (déjà utilisés par les alertes santé) | — |
| `SLACK_WEBHOOK_URL` | canal Slack (Incoming Webhook) | — |
| `RESEND_API_KEY` + `ALERT_EMAIL_TO` (+ `ALERT_EMAIL_FROM`) | canal e-mail (liste séparée par des virgules) | — |
| `ALERT_WEBHOOK_URL` (+ `ALERT_WEBHOOK_SECRET`) | webhook JSON, signature `X-Signature-256: sha256=<hmac>` | — |
| `SENTRY_DSN` | active Sentry | — |
| `SENTRY_TRACES_SAMPLE_RATE` | échantillonnage des transactions | `0.1` prod · `1` dev |
| `SENTRY_RELEASE` | version déployée | — |
| `LOGS_WEBHOOK_URL` | service de logs externe (Axiom, Logtail, Datadog…) — reçoit erreurs et requêtes lentes en JSON | — |

## Où les définir

::: code-group
```bash [Local (.dev.vars)]
LOG_LEVEL=debug
SENTRY_DSN=https://…@o….ingest.sentry.io/…
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/…
```
```bash [Production BYOK (secrets)]
npx wrangler pages secret put SENTRY_DSN --project-name webapp
npx wrangler pages secret put SLACK_WEBHOOK_URL --project-name webapp
npx wrangler pages secret put RESEND_API_KEY --project-name webapp
```
```toml [wrangler.toml.example]
[vars]
LOG_LEVEL = "info"
MONITORING_SAMPLE_RATE = "0.2"
[[kv_namespaces]]
binding = "MONITORING_KV"
id = "<id>"
```
:::

::: danger Déploiement hébergé Genspark
Le déploiement hébergé **refuse** `kv_namespaces` et `triggers`. N'ajoutez `MONITORING_KV` que pour un déploiement sur votre propre compte Cloudflare (BYOK). Sans KV, les métriques vivent en mémoire dans chaque isolate (suffisant pour l'alerting et le tableau de bord ; remises à zéro au redéploiement).
:::

## Seuils (`MONITORING_CONFIG`)

```ts
// src/monitoring.ts
export const MONITORING_CONFIG = {
  retentionMs: 7 * 24 * 3600_000,   // fenêtre glissante
  maxSamples: 20_000,
  apdexTargetMs: 500,
  thresholds: {
    responseTimeP95Ms: 3000,        // alerte si p95 > 3 s
    errorRate: 0.05,                // > 5 % d'erreurs (4xx hors 401/404 + 5xx)
    error5xxRate: 0.02,             // > 2 % de 5xx
    dbQueryTimeMs: 1000,            // db.query_time p95 > 1 s
    minRequestsForRate: 20          // pas d'alerte de taux sous 20 requêtes
  },
  alertCooldownMs: 15 * 60_000,     // déduplication
  slowRequestMs: 1500               // log « slow request »
}
```
