# 💰 Monitoring des coûts Cloudflare

## Ce qui coûte (et ce qui ne coûte pas)

| Ressource | Offre gratuite | Au-delà (Workers Paid, 5 $/mois) | Rahma Academy |
|---|---|---|---|
| **Pages / Workers requêtes** | 100 000 / jour | 10 M incluses puis 0,30 $/M | ≈ 3 000–15 000 / jour par établissement |
| **CPU** | 10 ms / requête | 30 M ms-CPU inclus puis 0,02 $/M ms | middleware ≈ 0,3 ms ; IA/PDF < 10 ms (appels réseau non comptés) |
| **KV** (`MONITORING_KV`, BYOK) | 100 k lectures · 1 k écritures / jour | 0,50 $/M lectures · 5 $/M écritures | 1 écriture/min max → 1 440/jour : **dépasse le gratuit**, ≈ 0,20 $/mois en Paid |
| **R2** (archives de logs) | 10 Go · 1 M écritures | 0,015 $/Go-mois, pas d'egress | ≈ 50 Mo/jour compressés → 1,5 Go/mois |
| **Logpush** | — | Enterprise ou Workers Paid (Logpush Workers Trace Events) | optionnel |
| **Supabase** (hors Cloudflare) | 500 Mo · 2 Go egress | Pro 25 $/mois par projet | **1 projet par établissement** (F63) |
| **IA** (OpenAI / Groq…) | selon fournisseur | à l'usage | quota 40 générations/jour, jetons par utilisateur |

::: tip Règle d'or
Le monitoring applicatif (logs `console.*`, métriques en mémoire, alertes) **ne coûte rien** : il n'ajoute ni requête facturable ni stockage. Seuls KV, R2 et Sentry (au-delà de 5 k événements/mois) ont un prix.
:::

## Suivre la consommation

### 1. Tableau de bord Cloudflare
*Workers & Pages → webapp → Metrics* : requêtes, erreurs, CPU p50/p99, *subrequests*. Comparez avec `/api/admin/observability?window=24h → requests.total` : un écart > 20 % signale du trafic non applicatif (bots, scans) à bloquer via *WAF → Rate limiting*.

### 2. API GraphQL Cloudflare (automatisable)

```bash
curl -s https://api.cloudflare.com/client/v4/graphql -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' -d '{
 "query": "{ viewer { accounts(filter:{accountTag:\"'$CF_ACCOUNT'\"}) { workersInvocationsAdaptive(limit:1000, filter:{datetime_geq:\"'$(date -u -d '-1 day' +%FT%TZ)'\"}) { sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 } dimensions { scriptName } } } } }"
}' | jq '.data.viewer.accounts[0].workersInvocationsAdaptive'
```

### 3. Alertes de budget (natives)
*Notifications → Add → Billing → Usage Based Billing* : seuil en requêtes Workers / stockage R2 → e-mail/webhook. Recommandé : **80 %** et **100 %** du budget mensuel.

### 4. Alerte applicative sur le volume
Règle personnalisée : si `requests.perMinute` sur 1 h dépasse la médiane habituelle × 5, alerte `medium` « Trafic anormal — vérifier la facturation ». Le script `analyze-logs.mjs` détecte déjà `traffic_spike`.

## Budget mensuel de référence (par établissement, trafic moyen)

| Poste | Estimation |
|---|---|
| Cloudflare Pages/Workers | 0 $ (gratuit) → 5 $ si KV/CPU Paid |
| R2 logs (1,5 Go, 90 j rétention = 4,5 Go) | ≈ 0,07 $ |
| Supabase | 0 $ (Free) → 25 $ (Pro, recommandé en production) |
| Sentry | 0 $ (Developer, 5 k événements) |
| IA | 2–10 $ selon usage (Groq gratuit en alternatif) |
| **Total** | **≈ 0–45 $/mois** |

## Réduire la facture

1. `MONITORING_SAMPLE_RATE=0.2` à fort trafic : 80 % de lignes `info` en moins dans les logs (erreurs et lenteurs toujours loggées).
2. Pas de KV si un seul isolate suffit (petit établissement) : les métriques en mémoire couvrent l'alerting.
3. Règle de cycle de vie R2 : suppression automatique après 90 jours.
4. Cache `Cache-Control` sur `/api/brand`, `/api/public/stats` (déjà 300 s) et les fichiers `/static/*` (immutables).
5. Bloquer les bots : *WAF → Bot Fight Mode* (gratuit) et rate-limit `/api/auth/login` (déjà 5/15 min côté application).
6. Surveiller `/api/ai/*` : le quota quotidien (40) et le portefeuille de jetons évitent l'emballement des coûts IA.
