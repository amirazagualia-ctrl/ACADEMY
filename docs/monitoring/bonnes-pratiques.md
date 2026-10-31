# 🎯 Bonnes pratiques

## Journalisation

- ✅ Un **message court et stable** (`'Paiement enregistré'`), les variables dans `data` : `logger.info('Paiement enregistré', { feeId, amount })` — jamais interpolées dans le message (agrégation impossible sinon).
- ✅ `logger.error(msg, err)` avec l'objet `Error` : la pile et le nom sont extraits, les secrets masqués.
- ✅ Logguer au **bon niveau** : un 404 métier attendu n'est pas une erreur ; une bascule vers le moteur IA alternatif est un `warn`.
- ❌ Ni e-mail, ni nom, ni mot de passe, ni jeton, ni corps de requête complet. Les identifiants numériques suffisent.
- ❌ Pas de `console.log` libre dans les handlers : passez par `createRouteLogger(c)` pour hériter du `requestId`.

## Métriques

- Nommez en `domaine.mesure` : `db.query_time`, `ai.generations`, `pdf.render_time`, `cache.hits`.
- Unités explicites (`ms`, `count`, `bytes`) ; pas de valeurs cumulées (le gestionnaire agrège).
- Mesurez ce qui a un **effet utilisateur** (latence d'un bulletin) ou un **coût** (appels IA), pas tout.
- Pour une opération asynchrone : `await timed('db.query_time', () => …, { table })`.

## Alertes

- Une alerte = **une action humaine** possible. Sinon, c'est un tableau de bord.
- Seuils fondés sur les **SLO** et sur ≥ 20 requêtes ; cooldown ≥ 15 min.
- Testez chaque canal après modification des secrets : `POST /api/admin/observability/evaluate {"force":true}`.
- Revoyez les faux positifs chaque mois ; un canal ignoré est un canal à supprimer.

## Déploiement

- [ ] `npm run test:monitoring` vert avant chaque mise en production.
- [ ] Secrets d'alerte présents dans l'environnement cible (`wrangler pages secret list`).
- [ ] Surveiller `/api/admin/observability?window=15m` pendant 15 min après un déploiement (`slo_status` tout vert, `recentErrors` vide).
- [ ] Incrémenter `CACHE` dans `public/sw.js` pour forcer la mise à jour des clients.
- [ ] Budget d'erreur ≥ 50 % restant avant une fonctionnalité risquée (page [SLO](/slo-sli)).

## Surveillance quotidienne (5 min)

| Vérification | Où | OK si |
|---|---|---|
| SLO | `/api/admin/observability → slo_status` ou Grafana ligne 1 | tout `true` / vert |
| Erreurs 5xx | `recentErrors` | vide ou expliquées |
| Alertes | `alerts.recent` | aucune `critical`/`high` non traitée |
| Bases des établissements | *Paramètres → Établissements → Tester* | toutes joignables |
| IA | `/api/ai/status` | `enabled: true`, usage < quota |
| Santé externe | moniteur UptimeRobot sur `/api/health` | 200 depuis 24 h |

## Sécurité du monitoring lui-même

- Les endpoints `/api/admin/*` exigent le rôle `admin` : utilisez un compte dédié pour Grafana/Prometheus et renouvelez son jeton.
- Le webhook d'alerte est signé (`X-Signature-256`) : **vérifiez la signature** côté récepteur.
- Les scripts d'analyse lisent des secrets depuis l'environnement : `.env.monitoring` est gitignoré ; ne le copiez jamais dans une image Docker publique.
- Les logs archivés contiennent des IP : chiffrement au repos (R2 par défaut) et purge à 90 jours.

## Ressources

- [Cloudflare Workers — Observability](https://developers.cloudflare.com/workers/observability/)
- [wrangler tail](https://developers.cloudflare.com/workers/wrangler/commands/#tail) · [Logpush](https://developers.cloudflare.com/workers/observability/logs/logpush/)
- [Sentry — Envelope API](https://develop.sentry.dev/sdk/envelopes/)
- [Google SRE Workbook — Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [Prometheus — Exposition formats](https://prometheus.io/docs/instrumenting/exposition_formats/)
- [Grafana Infinity datasource](https://grafana.com/grafana/plugins/yesoreyeram-infinity-datasource/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)

## Support

- Incidents : page [Procédures d'incident](/incidents) · canal Telegram des administrateurs.
- Questions sur cette documentation : ouvrir une *issue* dans le dépôt du projet avec le `X-Request-Id` concerné.
