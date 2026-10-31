---
title: Vue d'ensemble
---

# 📊 Observabilité — Rahma Academy

Le système de monitoring de Rahma Academy fournit une visibilité complète sur la plateforme (Hono sur Cloudflare Pages/Workers, bases Supabase par établissement) :

- 📝 **Logs structurés** JSON (`RouteLogger`) avec niveau configurable, identifiant de requête et contexte (utilisateur, établissement, route, durée) ;
- ⚡ **Métriques** (`MetricsManager`) : volume, latence p50/p95/p99, taux d'erreur, Apdex, métriques personnalisées, **fenêtre glissante de 7 jours** ;
- 🚨 **Alertes** (`AlertManager`) : règles paramétrables, canaux Telegram / Slack / e-mail / webhook, **déduplication** anti-boucle ;
- 🔍 **Sentry** adapté aux Workers (API envelope, échantillonnage par environnement) ;
- 📈 **Endpoints d'administration** (`/api/admin/metrics` Prometheus & JSON, `/api/admin/observability`) et **tableau de bord Grafana** ;
- 🛠️ **Scripts d'exploitation** : capture `wrangler tail` avec rotation, détection d'anomalies, export R2/S3.

::: tip Fichiers concernés
`src/monitoring.ts` · `scripts/monitoring/tail-logs.sh` · `scripts/monitoring/analyze-logs.mjs` · `tests/monitoring.test.ts` · `grafana/` · `docker-compose.monitoring.yml` · `wrangler.toml.example`
:::

## Architecture

```mermaid
flowchart LR
  subgraph CF["Cloudflare Workers (isolate)"]
    MW["monitoringMiddleware()<br/>X-Request-Id · chrono"]
    RL["RouteLogger<br/>JSON → console.*"]
    MM["MetricsManager<br/>fenêtre 7 j · p95 · Apdex"]
    AM["AlertManager<br/>règles · dédup 15 min"]
    SE["Sentry client<br/>envelope API"]
    API["/api/admin/metrics<br/>/api/admin/observability"]
    MW --> RL
    MW --> MM
    MM -->|toutes les 25 req.| AM
    MW -->|erreurs · 10 % transactions| SE
    MM --> API
  end
  KV[("KV MONITORING_KV<br/>(BYOK, optionnel)")]
  MM <-.-> KV
  RL --> TAIL["wrangler tail<br/>Cloudflare Logs"]
  TAIL --> SH["tail-logs.sh<br/>rotation gzip"]
  SH --> AN["analyze-logs.mjs<br/>anomalies · rapport"]
  AN --> R2[("R2 / S3<br/>archives")]
  AM --> TG["Telegram"] & SL["Slack"] & EM["E-mail (Resend)"] & WH["Webhook HMAC"]
  AN --> TG
  API --> GF["Grafana<br/>(plugin Infinity)"]
  SE --> SENTRY["sentry.io"]
```

## Flux d'une requête

```mermaid
sequenceDiagram
  participant C as Client
  participant M as Middleware
  participant H as Handler Hono
  participant L as RouteLogger
  participant X as MetricsManager
  participant A as AlertManager
  C->>M: GET /api/students/42 (X-Request-Id ?)
  M->>M: requestId = en-tête ou généré · t0
  M->>H: next()
  H-->>M: Response 200
  M->>X: recordRequest(route=/api/students/:id, 200, 38 ms, tenant)
  M->>L: info "request" {requestId, route, status, durationMs, userId}
  M-->>C: Response + X-Request-Id + Server-Timing
  Note over M,A: waitUntil() — hors du chemin critique
  M->>A: evaluate(snapshot 15 min) toutes les 25 requêtes
  A-->>A: règle déclenchée ? cooldown ? → envoi multi-canaux
```

## Principes

| Principe | Mise en œuvre |
|---|---|
| **Zéro API Node** | uniquement `fetch`, `crypto.subtle`, `Headers` — compatible Workers |
| **Hors chemin critique** | Sentry, alertes, KV passent par `executionCtx.waitUntil()` |
| **Pas de données sensibles** | `redact()` masque `password`, `token`, `secret`, `api_key`… ; l'e-mail n'est jamais loggé |
| **Multi-établissement** | chaque échantillon porte le `tenant` ; filtres `?tenant=` sur l'API |
| **Mémoire bornée** | 20 000 échantillons / 5 000 points par métrique, purge 7 jours |
| **Testé** | 23 tests Vitest (`npm run test:monitoring`) |
