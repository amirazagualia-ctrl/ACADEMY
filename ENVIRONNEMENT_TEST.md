# Environnement de test séparé (recommandé)

Objectif : tester sans toucher aux vraies données des élèves.

## 1. Créer un second projet Supabase
1. https://supabase.com/dashboard → **New project** → nom `rahma-academy-test` (même région).
2. **SQL Editor** → exécuter dans l'ordre : `schema.sql`, puis `migrations/0009_school_years.sql` … `migrations/0013_online_payments.sql`.
3. **Storage** → créer les buckets publics `photos`, `courses`, `homeworks`.
4. **Project Settings → API** : copier l'URL du projet et la clé `service_role`.

## 2. Alimenter avec des données fictives (optionnel)
- *Paramètres → Sauvegardes* de la production → **Export JSON**, puis dans l'environnement de test **Restaurer** table par table (mode *remplacer*). Les mots de passe ne sont jamais exportés : réinitialisez-les dans l'environnement de test.
- Ou importez le modèle Excel d'élèves fictifs (*Élèves → Importer Excel*).

## 3. Configurer l'environnement de test
Local (sandbox) : créer `.dev.vars.test` avec :
```
SUPABASE_URL=https://<projet-test>.supabase.co
SUPABASE_SERVICE_KEY=<service_role du projet test>
JWT_SECRET=<un autre secret>
APP_ENV=test
```
Puis : `cp .dev.vars .dev.vars.prod && cp .dev.vars.test .dev.vars && pm2 restart webapp` (et inversement pour revenir).

Cloudflare Pages : créer un **second projet** (ex. `rahma-academy-test`) avec les mêmes secrets pointant vers le projet Supabase de test et `APP_ENV=test`. Le bandeau orange **« ENVIRONNEMENT DE TEST »** s'affiche automatiquement et `/api/health` renvoie `"env":"test"`.

## 4. Règles
- Ne jamais copier la clé `service_role` de production dans l'environnement de test.
- Tester les migrations SQL **d'abord** sur le projet test, puis sur la production.
- Notifications Telegram/Email : laisser `TELEGRAM_BOT_TOKEN` vide en test (ou utiliser un bot de test) pour ne pas écrire aux vrais parents.
