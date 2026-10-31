# 🔍 Sentry sur Cloudflare Workers

## Pourquoi pas le SDK Node ?

Le runtime Workers n'offre ni `process`, ni `fs`, ni `os`, ni état global durable ; le CPU par requête est limité (10–30 ms). Le SDK `@sentry/node` ne fonctionne pas, et `@sentry/cloudflare` alourdit le bundle. Rahma Academy utilise donc un **client minimal** (`initSentryForRahmaAcademy`) qui parle directement à l'[API envelope](https://develop.sentry.dev/sdk/envelopes/) avec `fetch` — **zéro dépendance**.

## Activation

```bash
npx wrangler pages secret put SENTRY_DSN --project-name webapp      # https://<clé>@o<org>.ingest.sentry.io/<projet>
# facultatif
SENTRY_TRACES_SAMPLE_RATE=0.1      # 10 % des transactions en production (1 = toutes en développement)
SENTRY_RELEASE=webapp@1.4.0
```

Sans `SENTRY_DSN`, le client est un *no-op* (`enabled: false`).

## Ce qui est envoyé

| Événement | Quand | Contenu |
|---|---|---|
| `exception` | exception non interceptée (`request failed`) | type, message, **pile parsée en frames**, route, statut, `requestId`, `tenant`, utilisateur `{ id, role }`, `cf.colo` / `cf.country`, user-agent |
| `message` (error) | handler renvoyant un 5xx sans exception | `HTTP 500 GET /api/x`, durée |
| `transaction` | échantillon `SENTRY_TRACES_SAMPLE_RATE` | nom `GET /api/students/:id`, `op=http.server`, début/fin, statut (`ok`, `invalid_argument`, `internal_error`), tenant |

Tout part dans `executionCtx.waitUntil()` avec un **délai maximal de 3 s** : jamais de latence ajoutée pour l'utilisateur.

## Filtrage (économie de quota)

Les erreurs correspondant à ces motifs ne sont **pas** envoyées : `Non authentifié`, `Accès refusé`, `Introuvable`, `Trop de tentatives`, `AbortError`, `ECONNRESET`. Ajoutez vos propres motifs :

```ts
initSentryForRahmaAcademy(env, { ignore: [/quota IA/i] })
```

Les 401/404 ne génèrent ni événement ni transaction d'erreur.

## Utilisation manuelle

```ts
import { getSentry } from './monitoring'
const sentry = getSentry(c.env)
try { await riskyOperation() }
catch (e) { await sentry.captureException(e, { requestId: getRequestId(c), tenant: tenantSlug(), tags: { job: 'monthly-fees' } }); throw e }
await sentry.captureMessage('Rollover terminé', 'info', { year: '2026-2027' })
```

## Vérifier l'intégration

1. En développement (`APP_ENV=development`, `SENTRY_TRACES_SAMPLE_RATE=1`), déclenchez une erreur volontaire : `curl https://<site>/api/admin/does-not-exist -H "Authorization: Bearer <admin>"` ne suffit pas (404 filtré) — ajoutez temporairement une route qui lève `throw new Error('test sentry')`.
2. Dans Sentry → *Issues*, l'événement apparaît avec les tags `service=rahma-academy`, `tenant`, `route`.
3. *Performance* → transactions `GET /api/...` avec la durée mesurée par le middleware.

## Limites connues

- Pas de *breadcrumbs* automatiques ni de *source maps* : le build Vite minifie `_worker.js` ; les frames pointent vers le bundle. Pour des piles lisibles, téléversez les source maps (`wrangler pages deploy --upload-source-maps`, plan payant) ou lisez `requestId` dans les logs.
- Un isolate = un client ; aucune file persistante : si l'envoi échoue, l'événement est perdu (journalisé en `warn`).
