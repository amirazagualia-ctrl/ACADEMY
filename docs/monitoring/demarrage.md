# 🚀 Démarrage rapide

## 1. Le middleware est déjà branché

```ts
// src/index.tsx
import { monitoringMiddleware } from './monitoring'
app.use('*', monitoringMiddleware({
  resolveTenant: () => tenantSlug(),                                   // F63 : établissement courant
  resolveUser: (c) => (c.get('monUser' as never) as any) || null       // posé par getUser() : { id, role } — jamais l'e-mail
}))
```

Chaque réponse porte désormais `X-Request-Id` et `Server-Timing: app;dur=<ms>`.

## 2. Utilisation dans une route

```ts
import { createRouteLogger, getMetrics, timed } from './monitoring'

app.get('/api/students', async (c) => {
  const logger = createRouteLogger(c)          // contexte : requestId, route, utilisateur, établissement
  const metrics = getMetrics(c)
  try {
    logger.info('Fetching students')
    const students = await timed('db.query_time', () => sb(c.env, 'students?select=*'), { table: 'students' })
    metrics.increment('students.listed', students.data.length)
    logger.info('Students fetched', { count: students.data.length })
    return c.json(students.data)
  } catch (error) {
    logger.error('Failed to fetch students', error)   // pile tronquée à 6 lignes, secrets masqués
    throw error                                        // le middleware enregistre le 500 + Sentry
  }
})
```

## 3. Consulter les métriques

```bash
TOKEN=<jwt admin>
curl -H "Authorization: Bearer $TOKEN" "https://<site>/api/admin/metrics?window=1h"
curl -H "Authorization: Bearer $TOKEN" "https://<site>/api/admin/metrics?format=prometheus"
curl -H "Authorization: Bearer $TOKEN" "https://<site>/api/admin/observability?window=24h&buckets=24"
```

## 4. Tester les alertes

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  https://<site>/api/admin/observability/evaluate -d '{"force":true}'
# → { "ok": true, "sent": 1 } et un message « Test des canaux d'alerte » sur Telegram / Slack / e-mail
```

## 5. Lancer les tests

```bash
npm run test:monitoring      # 23 tests Vitest : métriques, alertes, Sentry, middleware
```

## 6. Capturer les logs de production

```bash
export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=…
ANALYZE=1 npm run logs:tail                      # temps réel + détection d'anomalies
npm run logs:analyze -- --file logs/current.jsonl --report
```

::: warning Pile locale complète
`docker compose -f docker-compose.monitoring.yml up -d` démarre la capture, l'analyse horaire et **Grafana** (http://localhost:3001). Voir [Tableaux de bord Grafana](/grafana).
:::
