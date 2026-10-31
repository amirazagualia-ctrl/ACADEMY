# ⚡ Métriques — `MetricsManager`

## Collecte automatique

Pour chaque requête : `route`, `method`, `status`, `durationMs`, `tenant`, `category` (`auth`, `ai`, `data`, `payments`, `files`, `tenants`, `api`, `pages` ; `static` ignoré).

## Métriques personnalisées

```ts
const metrics = getMetrics(c)
metrics.recordMetric('cache.hits', 1, 'count', { cacheType: 'brand' })
metrics.increment('ai.tokens', 420)
metrics.startTimer('pdf-12'); /* … */ metrics.endTimer('pdf-12', 'pdf.render_time')
await timed('db.query_time', () => sb(env, 'grades?…'), { table: 'grades' })   // helper
metrics.getAggregatedMetrics()
// { "db.query_time": { count: 100, avg: 145, min: 50, max: 300, p50: 120, p95: 280, p99: 300, unit: "ms" } }
```

## Fenêtre glissante de 7 jours

- `prune()` supprime les échantillons et points plus vieux que `retentionMs` (7 j) ; appelé à chaque évaluation d'alerte et à chaque lecture des endpoints.
- Plafonds mémoire : 20 000 requêtes, 5 000 points par métrique (≈ 1,5 Mo).
- **Persistance** (optionnelle) : `MONITORING_KV` — écriture au plus toutes les 60 s (`monitoring:state`, TTL 7 j), relecture au démarrage de l'isolate, fusion sans doublon.

## Indicateurs calculés

| Fonction | Définition |
|---|---|
| `calculatePercentile(v, p)` | rang `ceil(p/100 × n)` sur la liste triée (méthode « nearest-rank ») |
| `calculateP95(v)` | 95 % des utilisateurs ont une latence ≤ p95 |
| `calculateErrorRate(s, { ignore: [401, 404] })` | `(#4xx hors ignore + #5xx) / n`, arrondi au **0,1 %** (3 décimales) ; `only5xx: true` pour la disponibilité |
| `calculateApdex(d, T = 500)` | `(satisfaits + tolérés / 2) / n` avec satisfait ≤ T, toléré ≤ 4T |

```ts
calculateP95([1..100])                                        // 95
calculateErrorRate([200,200,500,404,401,400,503,200,200,200]) // 0.3  (500, 400, 503)
calculateApdex([100, 1000, 5000], 500)                        // 0.5
```

## Instantané (`snapshot`)

```ts
getMetricsManager().snapshot({ windowMs: 3600_000, category: 'ai', tenant: 'my-academy' })
```

Retourne `requests` (total, perMinute, errors4xx/5xx, errorRate, p50/p95/p99, avg, apdex), `endpoints[]` (count, avg, p95, errorRate, last), `statuses`, `metrics`, `tenants`, `slowest[10]`, `recentErrors[20]`.

## Export Prometheus

`GET /api/admin/metrics?format=prometheus` — format d'exposition 0.0.4 :

```text
# TYPE rahma_http_requests_total gauge
rahma_http_requests_total{method="GET",route="/api/students/:id"} 128
rahma_http_request_duration_ms{method="GET",route="/api/students/:id",quantile="0.95"} 240
rahma_http_error_rate{method="GET",route="/api/students/:id"} 0.008
rahma_http_status_total{class="2xx"} 1180
rahma_http_global{indicator="apdex"} 0.93
rahma_custom_metric{name="db.query_time",stat="p95",unit="ms"} 180
rahma_tenant_requests_total{tenant="my-academy"} 310
```

::: info Pourquoi des *gauges* ?
Les valeurs sont recalculées sur la fenêtre demandée (pas de compteur monotone entre isolates). Pour Prometheus, scrapez avec `?window=5m` à intervalle de 1 min et utilisez `max_over_time` / `avg_over_time` plutôt que `rate()`.
:::
