# 📝 Logs structurés — `RouteLogger`

## Niveaux

| Niveau | Usage | Sortie |
|---|---|---|
| `debug` | détails de développement (masqués en production sauf `LOG_LEVEL=debug`) | `console.debug` |
| `info` | événements normaux (requête servie, action métier) | `console.log` |
| `warn` | anomalies non bloquantes (requête lente, 4xx métier, repli) | `console.warn` |
| `error` | échecs (exception, 5xx, service externe injoignable) | `console.error` |

## Format

Une ligne JSON par événement — directement exploitable par `wrangler tail`, Cloudflare Logpush, Axiom, Datadog…

```json
{
  "ts": "2026-10-31T09:24:42.000Z",
  "level": "info",
  "msg": "request",
  "service": "rahma-academy",
  "requestId": "e37218105178457b99f7",
  "method": "GET",
  "path": "/api/students/42",
  "route": "/api/students/:id",
  "status": 200,
  "durationMs": 38,
  "tenant": "my-academy",
  "userId": 2,
  "role": "admin",
  "ip": "41.x.x.x",
  "ua": "Mozilla/5.0 …",
  "env": "production",
  "cfRay": "8d1…-TUN",
  "colo": "TUN"
}
```

- **Routes normalisées** : `/api/students/42` → `/api/students/:id` (identifiants, UUID, slugs, fichiers) pour agréger proprement.
- **Masquage automatique** (`redact()`) : toute clé contenant `password`, `token`, `secret`, `authorization`, `cookie`, `api_key`, `db_key` est remplacée par `***`.
- **Erreurs** : `{ "error": { "name", "message", "stack" } }` (pile tronquée à 6 lignes).

## API

```ts
const logger = createRouteLogger(c)
logger.info('Paiement enregistré', { feeId: 12, amount: 350 })
logger.warn('Quota IA proche', { used: 38, limit: 40 })
logger.error('Supabase indisponible', err, { table: 'fees' })
const child = logger.child({ job: 'monthly-fees' })   // hérite du contexte
child.debug('itération', { i })
```

## Ce que le middleware logge seul

| Cas | Niveau | `msg` |
|---|---|---|
| requête OK (échantillonnée par `MONITORING_SAMPLE_RATE`) | info | `request` |
| requête > 1,5 s | warn | `slow request` |
| 4xx (hors 401 / 404) | warn | `request client error` |
| 5xx renvoyé par un handler | error | `request error` |
| exception non interceptée | error | `request failed` (+ `error`) |

## Rechercher dans les logs

```bash
# Temps réel (production)
npx wrangler pages deployment tail --project-name webapp --format json | jq -c 'select(.logs[]?.message[]? | tostring | test("error"))'

# Archives locales (après tail-logs.sh)
zcat logs/logs-*.jsonl.gz | node scripts/monitoring/analyze-logs.mjs --stdin --level warn --route /api/ai
node scripts/monitoring/analyze-logs.mjs --file logs/current.jsonl --tenant my-academy --report
```

::: tip Retrouver une requête utilisateur
Demandez l'en-tête `X-Request-Id` affiché dans la console du navigateur (ou l'identifiant du message d'erreur) et filtrez : `grep e37218105178457b99f7 logs/current.jsonl`.
:::
