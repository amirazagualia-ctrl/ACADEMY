# 📈 Tableaux de bord Grafana

Un tableau de bord prêt à l'emploi consomme `/api/admin/metrics` et `/api/admin/observability` via le plugin **Infinity** (JSON over HTTP). Aucun Prometheus requis.

## Démarrage

```bash
cp .env.monitoring.example .env.monitoring
# renseigner RAHMA_API_URL (https://<site>) et RAHMA_ADMIN_TOKEN (JWT d'un compte admin dédié)
docker compose -f docker-compose.monitoring.yml up -d grafana
open http://localhost:3001        # admin / rahma-admin (à changer : GRAFANA_PASSWORD)
```

Le provisioning (`grafana/provisioning/`) crée automatiquement :
- la source de données **Rahma API** (Infinity, authentification *Bearer* avec `RAHMA_ADMIN_TOKEN`) ;
- le dossier **Rahma Academy** avec le tableau de bord **Observabilité** (`grafana/dashboards/rahma-observability.json`).

## Contenu du tableau de bord

| Ligne | Panneaux |
|---|---|
| 🎯 **SLO / SLI** | Disponibilité, Latence p95, Taux d'erreur, Apdex, Requêtes, Budget d'erreur consommé — colorés selon les seuils |
| 📈 **Trafic & latence** | Requêtes et erreurs 5xx par tranche · p95 et taux d'erreur (axe secondaire) |
| 🧭 **Endpoints** | Top endpoints (volume, moyenne, **jauge p95**, taux d'erreur coloré, dernière requête) · camembert par classe de statut · p95 par catégorie de service |
| 🏫 **Établissements & alertes** | Tableau multi-tenant (requêtes, p95, erreurs) · Alertes récentes (gravité, canaux) · Requêtes les plus lentes · Dernières erreurs 5xx |

Variables : **Fenêtre** (`15m`, `1h`, `6h`, `24h`, `7d`) et **Catégorie** (`auth`, `ai`, `data`, …). Rafraîchissement automatique : 1 min.

## Import manuel (Grafana Cloud ou instance existante)

1. *Connections → Add new connection → Infinity* (installer le plugin `yesoreyeram-infinity-datasource`).
2. Authentification **Bearer Token** = JWT admin ; *Allowed hosts* = `https://<site>`.
3. *Dashboards → New → Import* → coller `grafana/dashboards/rahma-observability.json` → choisir la source **Rahma API**.
4. Remplacer `${RAHMA_API_URL}` dans les requêtes par l'URL réelle (ou définir une variable de tableau de bord `RAHMA_API_URL` de type *constant*).

## Alertes Grafana (optionnel)

Créez une règle d'alerte sur le panneau *Latence p95* (`> 3000` pendant 10 min) ou *Disponibilité* (`< 0.995`) et routez-la vers un *contact point* Telegram/Slack. Pour éviter les doublons avec l'`AlertManager` applicatif, choisissez **un seul** émetteur par règle : Grafana pour les tendances longues (24 h / 7 j), l'application pour le temps réel (15 min).

## Exporter les données

- *Panel → Inspect → Data → Download CSV* pour un rapport ponctuel.
- *Dashboard → Share → Export → Save to file* pour versionner vos modifications dans `grafana/dashboards/`.

::: warning Jeton
Le JWT expire selon la politique de l'application (7 jours pour les connexions standards). Créez un compte admin `monitoring@…` et planifiez le renouvellement du jeton (`POST /api/auth/login`) dans votre gestionnaire de secrets, ou utilisez un jeton longue durée si vous l'avez activé.
:::
