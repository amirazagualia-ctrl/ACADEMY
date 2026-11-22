# Configurer un compte Cloudflare neuf pour Rahma Academy

Guide pas à pas, de la création du compte au premier déploiement, avec les valeurs exactes du projet.
Tout ce qui est demandé ici se fait **dans le tableau de bord Cloudflare** : le jeton API n'a pas besoin
de droits SSH, DNS, ni R2 — seulement *Cloudflare Pages*.

> **Ce que coûte ce montage** : l'offre **gratuite** de Cloudflare Pages + Workers suffit
> (100 000 requêtes/jour, 500 déploiements/mois). Aucune carte bancaire n'est nécessaire.

---

## 1. Créer le compte

1. Allez sur **https://dash.cloudflare.com/sign-up**
2. E-mail + mot de passe, puis validez l'e-mail de confirmation.
3. Dans **Account Home**, notez l'**ID de compte** (32 caractères hexadécimaux) :
   il s'affiche dans l'URL `dash.cloudflare.com/<ACCOUNT_ID>` ou dans *Workers & Pages → vue d'ensemble*.

   Exemple de la forme attendue : `5ffe804fb2130f438d740e363a630c1a`

> Pas besoin d'acheter un domaine. Le site sortira sur `rahma-academy.pages.dev`.
> Un domaine personnalisé (ex. `ecole-rahma.tn`) pourra être ajouté plus tard, à l'étape 7.

---

## 2. Créer le jeton API (l'étape la plus importante)

Le jeton est ce qui autorise le déploiement depuis cet atelier. Il se crée **une seule fois**.

1. **Mon profil → API Tokens → Create Token**
2. Choisissez **Create Custom Token** (ne prenez *pas* un modèle « Edit Cloudflare Workers » :
   il accorde plus de droits que nécessaire).
3. Renseignez exactement :

| Champ | Valeur |
|---|---|
| **Token name** | `rahma-academy-deploy` |
| **Permissions** | `Account` → **Cloudflare Pages** → **Edit** |
| **Account Resources** | `Include` → votre compte |
| **Zone Resources** | laisser vide (aucune zone nécessaire) |
| **Client IP Address Filtering** | laisser vide (l'atelier change d'IP) |
| **TTL** | date d'expiration souhaitée, ou *No expiration* |

4. **Continue to summary → Create Token**, puis **copiez le jeton immédiatement** :
   il ne sera plus jamais affiché (`cfut_…` ou `cfat_…`).

### Règles de sécurité du jeton

- ❌ Ne le mettez **jamais** dans un fichier du dépôt, ni dans `wrangler.jsonc`, ni dans un message.
- ✅ Il se saisit **uniquement** dans l'onglet **Deploy** de ce projet (il est stocké côté plateforme).
- 🔄 S'il a fuité : *API Tokens → … → **Roll*** (le remplace), ou **Delete** puis recréez-en un.
- 📅 Un TTL de 90 jours est un bon compromis ; notez la date de renouvellement.

### Permissions à NE PAS donner

Ce projet **n'utilise ni D1, ni KV, ni R2, ni crons**. Les droits *Workers KV Storage*,
*Workers R2 Storage*, *D1*, *Zone.DNS* sont inutiles ici : un jeton trop large est un risque
pour rien. Le seul droit nécessaire est **Cloudflare Pages: Edit**.

---

## 3. Renseigner le jeton dans l'atelier

1. Ouvrez ce projet → onglet **Deploy**.
2. Collez le jeton dans le champ prévu, validez.
3. C'est tout : à partir de là, je peux déployer pour vous à chaque lot terminé.

Si le champ est vide, le déploiement échoue avec *« No Cloudflare API key is configured »* —
c'est le seul blocage possible à cette étape.

---

## 4. Créer le projet Pages

Une seule fois. Le nom doit être **`rahma-academy`** pour conserver l'adresse
`https://rahma-academy.pages.dev`.

Deux façons :

**A. Je le fais pour vous** (recommandé) — dites-moi simplement « le jeton est en place ».
J'exécute alors :
```bash
npx wrangler pages project create rahma-academy --production-branch main --compatibility-date 2024-01-01
```

**B. Vous le faites à la main** — *Workers & Pages → Create → Pages → Upload assets*,
nom du projet **`rahma-academy`**, branche de production **`main`**.

> ⚠️ Le nom `rahma-academy` est déjà pris sur votre compte actuel ?
> Le guide de migration (section 8) explique comment récupérer l'adresse.

---

## 5. Poser les secrets (variables d'environnement)

**Aucun secret ne doit être écrit dans le dépôt.** Ils se posent une fois dans Cloudflare, et
se mettent à jour par une seule commande.

### Liste exacte pour ce projet

**Obligatoires — sans eux l'API répond 503 :**

| Secret | Rôle |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase de l'établissement |
| `SUPABASE_SERVICE_KEY` | clé **service_role** (jamais la clé anon) |
| `JWT_SECRET` | signature des sessions — 32 caractères aléatoires minimum |

**Fortement recommandés :**

| Secret | Rôle |
|---|---|
| `TENANT_SECRET` | chiffrement des accès des autres établissements (32+ car.) |
| `APP_ENV` | `production` |
| `OPENAI_API_KEY` | tuteur IA (sinon fonction IA désactivée) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` | alertes d'incident |

**Optionnels** (fonction absente si non renseigné) :
`RESEND_API_KEY` (e-mails), `TWILIO_SID`/`TWILIO_TOKEN`/`TWILIO_FROM` (SMS),
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (connexion Google),
`KONNECT_API_KEY`/`KONNECT_WALLET_ID`/`KONNECT_ENV` (paiements),
`AI_ALT_API_KEY`/`AI_ALT_BASE_URL`/`AI_ALT_MODEL` (moteur IA de secours),
`OPENAI_BASE_URL`/`OPENAI_MODEL`.

### Les poser

```bash
# Un par un (la valeur est lue sur l'entrée standard, jamais dans l'historique du shell)
echo "https://xxxx.supabase.co" | npx wrangler pages secret put SUPABASE_URL --project-name rahma-academy
echo "<cle service_role>"       | npx wrangler pages secret put SUPABASE_SERVICE_KEY --project-name rahma-academy
echo "<32 caracteres aleatoires>" | npx wrangler pages secret put JWT_SECRET --project-name rahma-academy

# Vérifier la liste (les valeurs ne sont jamais réaffichées)
npx wrangler pages secret list --project-name rahma-academy
```

> **`JWT_SECRET` doit être stable.** Le changer déconnecte tout le monde (toutes les sessions
> deviennent invalides). Générez-le une fois, conservez-le : `openssl rand -hex 32`.

---

## 6. Préparer la base Supabase

Le code ne crée pas les tables tout seul : les migrations doivent être exécutées.

1. Supabase → **SQL Editor**
2. Collez et exécutez, **dans cet ordre** :
   - `migrations/0020_editions.sql` — catalogue des éditions `demo`/`test`/`complete`
   - `migrations/0021_sessions.sql` — table `sessions` (révocation immédiate des connexions)
3. Vérifiez que la table existe : `select count(*) from sessions;`

> Sans `0021`, l'application fonctionne mais **sans révocation de session** (« Sessions actives »
> affiche l'instruction d'installation). Sans `0020`, tout retombe sur l'édition `complete`.

Pour un **nouvel établissement**, c'est le script complet qui s'exécute :
`GET /api/tenants/install.sql` (téléchargeable depuis *Paramètres → Établissements*).

> ⚠️ Supabase met les projets gratuits **en pause** après ~7 jours sans activité.
> Si l'API répond 503 avec *« projet probablement en pause »*, réactivez-le sur
> supabase.com/dashboard — c'est la panne la plus fréquente, et la plus facile à confondre
> avec un bug applicatif.

---

## 7. Premier déploiement

Quand les secrets sont posés :

```bash
npm run build
npx wrangler pages deploy dist --project-name rahma-academy --branch main
```

Le script `npm run deploy` fait déjà exactement cela (`deploy:prod` est un alias).

Le premier déploiement renvoie deux adresses :
- **production** : `https://rahma-academy.pages.dev`
- **branche** : `https://main.rahma-academy.pages.dev`

### Vérifier que le déploiement est sain

```bash
curl https://rahma-academy.pages.dev/api/health
```

Réponse attendue : `{"status":"ok","db":"ok",...}` — si `db` vaut `down` ou `unconfigured`,
le problème est du côté Supabase (pause / mauvaise clé), pas du déploiement.

Puis, dans le navigateur :
1. `https://rahma-academy.pages.dev` → page de connexion
2. connexion avec le compte administrateur → tableau de bord
3. `https://rahma-academy.pages.dev/manifest-rafiq.json` → doit répondre **200** (et non 404)
4. Paramètres → Mon compte → **Sessions actives** → votre appareil doit apparaître

### Domaine personnalisé (facultatif)

1. Ajoutez le domaine dans Cloudflare (*Websites → Add a site*), changez les serveurs de noms
   chez le registrar.
2. Puis : `npx wrangler pages domain add ecole-rahma.tn --project-name rahma-academy`
3. Cloudflare émet le certificat TLS automatiquement (quelques minutes).

---

## 8. Migrer l'ancien compte vers le nouveau

Si l'ancien compte contenait déjà `rahma-academy` et que vous voulez **garder l'adresse** :

1. Sur l'**ancien** compte : *Workers & Pages → rahma-academy → Settings → Delete project*.
2. Sur le **nouveau** : créez le projet `rahma-academy` (étape 4).
3. Redéployez (étape 7). L'adresse `rahma-academy.pages.dev` est libérée puis réattachée.

Le nom `*.pages.dev` est global : tant que l'ancien projet existe, le nouveau ne peut pas le prendre
(l'erreur est *« name already taken »*).

---

## 9. Checklist finale

- [ ] Compte Cloudflare créé, e-mail validé
- [ ] Tokens API `rahma-academy-deploy` créé avec **Pages: Edit** uniquement, copié
- [ ] Jeton saisi dans l'onglet **Deploy**
- [ ] Projet Pages `rahma-academy` créé, branche `main`
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` posés
- [ ] `npm run build` passe
- [ ] Déploiement réussi, `/api/health` renvoie `db: ok`
- [ ] `/manifest-rafiq.json` renvoie 200
- [ ] Connexion + « Sessions actives » visibles
- [ ] `migrations/0020` et `0021` exécutées sur Supabase
- [ ] Ancien jeton Cloudflare révoqué (s'il a été exposé)

---

## 10. Pannes fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| *No Cloudflare API key is configured* | jeton non saisi | onglet **Deploy** de l'atelier |
| *Authentication error* / 403 sur `pages deploy` | jeton sans **Pages: Edit** | régénérer le jeton avec le bon droit |
| *A project with this name already exists* | nom pris sur le compte | changer de nom, ou supprimer l'ancien projet |
| *name already taken* sur `*.pages.dev` | nom pris par un autre compte | libérer le nom (section 8) |
| `/api/health` → `db: down` | Supabase en pause | réactiver le projet |
| `/api/health` → `unconfigured` | secrets manquants | `npx wrangler pages secret list` |
| API répond 503 au démarrage | `SUPABASE_URL`/`KEY`/`JWT_SECRET` absents | poser les 3 secrets, redéployer |
| Tout le monde est déconnecté | `JWT_SECRET` modifié | normal : remettre l'ancienne valeur ou prévenir les utilisateurs |
| Écran blanc | ancien service worker en cache | vider le cache / *Réinstaller* l'application |

---

## Ce qu'il ne faut jamais faire

- `wrangler login` / connexion OAuth dans cet atelier : **ne fonctionne pas** (aucun navigateur).
- Commiter `.dev.vars`, `.env`, ou le jeton dans le dépôt : ces fichiers sont dans `.gitignore`,
  et un secret poussé sur GitHub doit être considéré comme compromis.
- Créer un jeton « All accounts / All zones » pour aller plus vite.
- Utiliser la clé Supabase **anon** à la place de la clé **service_role** : l'application ne
  verra aucune table.
