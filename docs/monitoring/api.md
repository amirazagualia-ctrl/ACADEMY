# 🔌 API d'administration

Toutes les routes exigent un **JWT de rôle `admin`** (`Authorization: Bearer …`) et renvoient `403` sinon. Elles sont isolées par établissement (en-tête `X-Tenant` ou cookie) comme le reste de l'API.

## `GET /api/admin/metrics`

Métriques agrégées sur une fenêtre.

| Paramètre | Valeurs | Défaut |
|---|---|---|
| `window` | `5m` · `15m` · `1h` · `6h` · `24h` · `7d` | `1h` |
| `from` / `to` | ISO 8601 (prioritaire sur `window`) | — |
| `category` | `auth` · `ai` · `data` · `payments` · `files` · `tenants` · `api` · `pages` | toutes |
| `tenant` | slug d'établissement | tous |
| `format` | `json` · `prometheus` (ou `Accept: text/plain`) | `json` |

::: code-group
```json [JSON]
{
  "period": "1h", "from": "…", "to": "…",
  "filters": { "category": null, "tenant": null },
  "requests": { "total": 1240, "perMinute": 20.7, "errors4xx": 31, "errors5xx": 2, "errorRate": 0.011, "p50": 42, "p95": 310, "p99": 980, "avg": 88, "apdex": 0.94 },
  "statuses": { "2xx": 1207, "4xx": 31, "5xx": 2 },
  "metrics": { "db.query_time": { "count": 900, "avg": 61, "p95": 180, "max": 1200, "unit": "ms" } },
  "endpoints": [ { "route": "/api/db/students", "method": "GET", "count": 210, "avg": 95, "p95": 260, "errorRate": 0, "last": "…" } ],
  "retention_days": 7, "samples_in_memory": { "samples": 1240, "metrics": 3 }, "timestamp": "…"
}
```
```text [Prometheus]
# TYPE rahma_http_requests_total gauge
rahma_http_requests_total{method="GET",route="/api/db/students"} 210
rahma_http_request_duration_ms{method="GET",route="/api/db/students",quantile="0.95"} 260
rahma_http_error_rate{method="GET",route="/api/db/students"} 0
rahma_http_global{indicator="p95"} 310
```
:::

## `GET /api/admin/observability`

Tableau de bord synthétique : tout `snapshot` + séries temporelles + SLO + alertes.

| Paramètre | Rôle |
|---|---|
| `window`, `from`/`to`, `category`, `tenant` | comme ci-dessus |
| `buckets` | nombre de tranches de la série (6–60, défaut 12) |

```json
{
  "requests": { … }, "endpoints": [ … ], "statuses": { … }, "metrics": { … }, "tenants": { "my-academy": { "count": 310, "errorRate": 0, "p95": 240 } },
  "slowest": [ … 10 ], "recentErrors": [ … 20 ],
  "series": [ { "t": "…", "count": 98, "errors": 0, "p95": 220, "errorRate": 0 } ],
  "slo": { "availability": { "target": 0.995, "actual": 0.998 }, "latency_p95_ms": { "target": 3000, "actual": 310 }, "error_rate": { "target": 0.05, "actual": 0.011 }, "apdex": { "target": 0.85, "actual": 0.94 } },
  "slo_status": { "availability": true, "latency_p95_ms": true, "error_rate": true, "apdex": true },
  "error_budget": { "target": 0.995, "consumed": 0.32 },
  "alerts": { "rules": [ … ], "recent": [ … ], "thresholds": { … } },
  "sentry": { "enabled": true },
  "by_category": [ { "category": "data", "count": 700, "p95": 260, "errorRate": 0.004 } ]
}
```

## `POST /api/admin/observability/evaluate`

- Corps vide → évalue les règles sur les 15 dernières minutes, renvoie `{ ok, sent, alerts[] }`.
- `{ "force": true }` → réarme la déduplication et envoie une alerte **de test** (`low`) sur tous les canaux configurés.

## `GET /api/health` (public, existant)

Santé minimale pour un moniteur externe (UptimeRobot, cron-job.org) : configuration présente, latence Supabase. Ne divulgue aucune donnée.

## Exemples

```bash
# Dernières 24 h, uniquement l'IA, pour l'établissement my-academy
curl -H "Authorization: Bearer $T" -H "X-Tenant: my-academy" \
  "https://<site>/api/admin/metrics?window=24h&category=ai"

# Plage personnalisée
curl -H "Authorization: Bearer $T" \
  "https://<site>/api/admin/observability?from=2026-10-30T08:00:00Z&to=2026-10-30T18:00:00Z&buckets=20"

# Scrape Prometheus (job statique, intervalle 1 min)
# prometheus.yml :
#   - job_name: rahma
#     metrics_path: /api/admin/metrics
#     params: { format: [prometheus], window: [5m] }
#     authorization: { credentials: "<jwt admin>" }
#     static_configs: [{ targets: ["<site>"] }]
#     scheme: https
```

::: warning Jeton Grafana / Prometheus
Créez un compte `admin` dédié (ex. `monitoring@…`) et utilisez son JWT ; renouvelez-le à chaque rotation de `JWT_SECRET`.
:::
