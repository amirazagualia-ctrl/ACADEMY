# Rahma École Française - Plateforme d'éducation complète

## Vue d'ensemble
- **Nom** : Rahma École Française — École Tunisienne
- **Objectif** : Gestion complète des élèves sur les 3 cycles tunisiens :
  - **Primaire** : 1ère → 6ème année (1AP → 6AP)
  - **Base (Collège)** : 7ème → 9ème année de base (7AB → 9AB)
  - **Secondaire (Lycée)** : 1ère → 4ème année secondaire (1AS → 4AS)

## Fonctionnalités complétées ✅
0. **QR Code inscription rapide** : route dédiée `/inscription` qui ouvre automatiquement le formulaire d'inscription élève (arabe par défaut, bascule FR/AR, frais d'inscription 40 DT affichés + créés automatiquement à l'approbation). Bouton "QR Code inscription" sur la page d'accueil et dans la vue admin Inscriptions → modal avec QR scannable, téléchargement PNG et affiche imprimable
0bis. **Application installable (PWA)** 🆕 : manifest + service worker + icônes → bannière "Installer Rahma École Française" sur mobile/desktop, icône sur l'écran d'accueil, cache hors-ligne des fichiers statiques, raccourci "Inscrire un élève"
0ter. **Coefficient saisissable** 🆕 : champ Coefficient dans la fenêtre "Nouvelle note", pré-rempli selon la matière ; toute modification met à jour la matière (répercutée sur bulletins et moyennes)
1. **Authentification** : inscription/connexion (JWT), 4 rôles : admin, enseignant, parent, élève
2. **CRUD complet** sur toutes les rubriques : élèves, enseignants, classes, matières, notes, présences, frais, cours, cours interactifs, événements, inscriptions, utilisateurs
3. **Élèves** : fiche complète avec **photo importable** (Supabase Storage), recherche, filtre par niveau, export Excel
4. **Présence** : pointage quotidien (Présent/Absent/Retard/Excusé), bouton "Tous présents", rapport mensuel Excel
5. **Calendrier scolaire** : vue mensuelle, événements (examens, vacances, réunions, activités) avec CRUD
6. **Notes & Bulletins** : saisie par trimestre/matière/coefficient, **bulletin PDF professionnel** (jsPDF + autotable) avec en-tête école, moyennes pondérées, mention et signatures, export Excel des notes
7. **Frais d'inscription** : suivi payé/en attente/en retard, méthodes de paiement, **relances automatiques des impayés**, rapport Excel
8. **Notifications automatiques aux tuteurs** : absence, retard, nouvelle note, frais impayés, engagement dans un cours — via app + email (Resend) + SMS (Twilio), avec toggles par type dans les Paramètres
9. **Cours & Documents** : upload PDF, Excel, Word, PowerPoint... par niveau/matière (Supabase Storage)
10. **Cours interactifs** : créateur de quiz QCM par niveau avec lecture interactive et score
11. **Inscriptions publiques** : formulaire public → validation admin → création automatique de l'élève
12. **Portail Parent** : tableau de bord personnalisé par enfant lié (présence du mois, dernières notes, frais à payer, notifications), gestion du profil et des enfants liés
13. **Gestion des utilisateurs (admin)** : activer/désactiver, changer rôle, supprimer, recherche/filtre par rôle
14. **Filtrage par rôle** : les parents/élèves ne voient QUE les données de leurs enfants liés (appliqué côté serveur)
15. **Paramètres** : infos école (bulletins), préférences notifications email/SMS

## URLs / Points d'entrée API
- `POST /api/auth/signup` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET|POST /api/db/:table` · `PUT|DELETE /api/db/:table/:id` (CRUD générique sécurisé, tables : students, teachers, classes, subjects, grades, attendance, fees, courses, interactive_courses, events, notifications, registrations, settings)
- `GET /api/stats` — statistiques dashboard (filtrées par rôle)
- `GET /api/bulletin/:studentId?trimester=N` — données bulletin
- `POST /api/registrations/:id/approve` — approbation inscription
- `POST /api/fees/check-overdue` — relance impayés
- `POST /api/notify` — notification manuelle au tuteur
- `POST /api/upload/:bucket` — upload photos/cours (buckets : photos, courses)
- `GET|PATCH|DELETE /api/admin/users` — gestion utilisateurs (admin)
- `PATCH /api/profile` — mise à jour de son profil

## Architecture des données
- **Base** : Supabase (PostgreSQL) — projet `nxtyizeoypolvrfhulpk`
- **Stockage fichiers** : Supabase Storage (buckets publics `photos` et `courses` — déjà créés ✅)
- **Tables** : students, teachers, classes, subjects, grades, attendance, fees, courses, interactive_courses, events, notifications, user_accounts, registrations, settings
- **Sécurité** : la clé service_role reste côté serveur (Hono/Cloudflare Worker), le frontend ne parle qu'à l'API `/api/*` avec JWT

## ⚠️ ÉTAPE OBLIGATOIRE : Configuration Supabase
Le projet Supabase semble actuellement **en pause** (plan gratuit : pause après ~7 jours d'inactivité).
1. Allez sur https://supabase.com/dashboard/project/nxtyizeoypolvrfhulpk
2. Cliquez sur **"Restore project"** / **"Resume"**
3. Ouvrez **SQL Editor** et exécutez tout le contenu du fichier **`schema.sql`** (à la racine du projet) — il crée les 14 tables + données de démonstration
4. C'est tout ! L'application fonctionne immédiatement.

## Guide utilisateur
1. **Compte admin par défaut** : créé par `schema.sql` — ⚠️ changez le mot de passe dès la première connexion (Paramètres → Mon compte)
2. Les parents/élèves créent leur compte via "Créer un compte" et sélectionnent l'élève lié
3. Les visiteurs peuvent envoyer une **demande d'inscription** d'élève depuis la page d'accueil
4. L'admin gère tout : élèves, présence (les absences notifient automatiquement les tuteurs), notes (notification auto), frais (relances auto), cours, quiz, utilisateurs

## Notifications Email/SMS réelles (optionnel)
Sans configuration, les notifications sont journalisées dans l'app. Pour l'envoi réel, ajoutez des secrets Cloudflare :
```bash
npx wrangler pages secret put RESEND_API_KEY --project-name webapp   # emails (resend.com)
npx wrangler pages secret put TWILIO_SID --project-name webapp        # SMS
npx wrangler pages secret put TWILIO_TOKEN --project-name webapp
npx wrangler pages secret put TWILIO_FROM --project-name webapp
```

## Déploiement
- **Plateforme** : Cloudflare Pages (Hono + Vite)
- **Stack** : Hono + TypeScript + TailwindCSS (CDN) + Chart.js + jsPDF + SheetJS + Supabase
- **Statut** : ✅ Développement local actif — en attente de réactivation Supabase
- **Dernière mise à jour** : 14/07/2026

## Développement local
```bash
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000
```
