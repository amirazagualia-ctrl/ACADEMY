# 🆘 Dépannage & FAQ

## Dépannage

### Je ne vois aucune métrique (`requests.total = 0`)
- Les métriques vivent **en mémoire par isolate**. Juste après un déploiement ou sur un établissement à faible trafic, l'isolate peut être neuf. Générez quelques requêtes puis réessayez.
- Vérifiez que `monitoringMiddleware` est bien monté sur `'*'` **avant** les routes dans `src/index.tsx`.
- Les chemins `/static/*`, `/sw.js`, `/manifest.json`, `/favicon*` sont volontairement ignorés.
- Pour une vue consolidée entre isolates, activez `MONITORING_KV` (BYOK) : la persistance fusionne les échantillons.

### Les alertes ne partent pas
1. `POST /api/admin/observability/evaluate` avec `{"force":true}` → si `sent: 0`, aucun canal n'est configuré : vérifiez les secrets (`TELEGRAM_BOT_TOKEN` **et** `TELEGRAM_ADMIN_CHAT_ID`, etc.).
2. `sent: 1` mais rien reçu : regardez `wrangler tail` — un `warn` `[monitoring] post-traitement` indique l'erreur HTTP du canal (jeton Telegram invalide, webhook Slack révoqué…).
3. Une règle ne se déclenche jamais : les règles de **taux** exigent ≥ 20 requêtes dans la fenêtre (`minRequestsForRate`) ; en test, abaissez-le ou utilisez `force`.
4. Alerte reçue une fois puis plus rien : c'est la **déduplication** (15 min par règle). `resetDedup()` via `force` réarme.

### Trop d'alertes (fatigue)
- Augmentez `alertCooldownMs` ou le `cooldownMs` de la règle bruyante.
- Relevez `minRequestsForRate` pour les petits établissements.
- Excluez les 401/404 du taux d'erreur (déjà fait par défaut) ; si vos clients génèrent des 400 légitimes, ajoutez `400` à `ignore`.

### `X-Request-Id` absent de la réponse
Le middleware clone la réponse après `next()`. Si un autre middleware remplace `c.res` **après** lui (monté avant `'*'`), les en-têtes sont perdus : montez `monitoringMiddleware` en premier.

### Sentry ne reçoit rien
- `SENTRY_DSN` est-il défini dans l'environnement déployé (secret Pages) ? `GET /api/admin/observability → sentry.enabled` doit être `true`.
- Les erreurs `Non authentifié`, `Accès refusé`, `Introuvable`, `Trop de tentatives`, `AbortError` sont **filtrées** volontairement.
- Les 404 ne génèrent pas d'événement.
- Quota dépassé côté Sentry : le projet passe en *rate limited* ; réduisez `SENTRY_TRACES_SAMPLE_RATE`.

### `wrangler tail` se déconnecte sans cesse
Normal après chaque déploiement ; `tail-logs.sh` se reconnecte (délai `RECONNECT_DELAY`). Si c'est permanent : jeton Cloudflare sans la permission *Workers Tail* / *Pages Read*, ou plus de 10 sessions de tail ouvertes sur le compte.

### Erreur `Unsupported Wrangler deployment field(s): kv_namespaces`
Vous déployez via l'hébergement Genspark avec `MONITORING_KV` déclaré. Retirez le binding (`wrangler.jsonc`) — il n'est valide qu'en BYOK. L'application fonctionne sans KV.

### Les latences affichées paraissent fausses (0 ms ou énormes)
- `0 ms` : réponses servies depuis le cache de Hono/Cloudflare ou handlers synchrones ; normal.
- Pics isolés > 10 s : démarrage à froid d'une base Supabase **gratuite en pause** (reprend après la première requête). Le probe des établissements (*Paramètres → Établissements → Tester*) réveille la base.

### La page Grafana est vide
- Source Infinity : *Allowed hosts* doit contenir exactement l'URL de l'API ; le jeton Bearer doit être un JWT **admin** valide (7 jours).
- Les requêtes utilisent `${RAHMA_API_URL}` : remplacez-la ou définissez la variable d'environnement avant `docker compose up`.
- CORS : Grafana appelle l'API **côté serveur** (mode *proxy*), aucun en-tête CORS requis.

## FAQ

**Le monitoring ralentit-il le site ?**
Non : ≈ 0,3 ms de CPU par requête ; Sentry, alertes et KV s'exécutent dans `waitUntil()` après l'envoi de la réponse.

**Les données personnelles sont-elles journalisées ?**
Jamais l'e-mail, le nom, le mot de passe ni les jetons (`redact()`). Les logs contiennent `userId`, `role`, `tenant` et l'IP (nécessaire à la détection de brute force) — purgez les archives après 90 jours.

**Pourquoi 7 jours de rétention ?**
Compromis mémoire/utilité pour l'alerting et les tendances hebdomadaires. L'historique long vit dans les exports R2/S3 et Grafana (ou Prometheus si vous scrapez `/api/admin/metrics`).

**Puis-je avoir des métriques par classe / enseignant ?**
Utilisez `metrics.recordMetric('grades.saved', 1, 'count', { level: '6AP' })` dans les routes concernées ; les tags sont conservés par point (agrégation par nom pour l'instant).

**Comment superviser plusieurs établissements ?**
Chaque échantillon porte le `tenant`. `?tenant=<slug>` filtre ; le tableau `tenants` donne volume, p95 et taux d'erreur par établissement ; Grafana affiche le tableau multi-tenant.

**Que surveiller en priorité chaque jour ?**
1) `slo_status` tout vert ; 2) `recentErrors` vide ; 3) aucune alerte `critical`/`high` dans `alerts.recent` ; 4) `by_category → ai` sous 5 % d'erreur ; 5) statut des bases (*Établissements → Tester*).

**Les alertes natives Cloudflare suffisent-elles ?**
Elles couvrent l'infrastructure (erreurs d'origine, usage facturé). L'`AlertManager` couvre le **métier** (latence par parcours, 5xx applicatifs, brute force, IA). Les deux sont complémentaires.

**Où est la documentation des endpoints ?**
[API d'administration](/api) et le `README.md` du projet (section « Points d'entrée API »).
