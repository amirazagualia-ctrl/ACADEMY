# Rahma Cours de Français - Plateforme d'éducation complète

## Vue d'ensemble
- **Nom** : Rahma Cours de Français — École Tunisienne
- **Objectif** : Gestion complète des élèves sur les 3 cycles tunisiens :
  - **Primaire** : 1ère → 6ème année (1AP → 6AP)
  - **Base (Collège)** : 7ème → 9ème année de base (7AB → 9AB)
  - **Secondaire (Lycée)** : 1ère → 4ème année secondaire (1AS → 4AS)

## Fonctionnalités complétées ✅
0. **QR Code inscription rapide** : route dédiée `/inscription` qui ouvre automatiquement le formulaire d'inscription élève (arabe par défaut, bascule FR/AR, frais d'inscription 40 DT affichés + créés automatiquement à l'approbation). Bouton "QR Code inscription" sur la page d'accueil et dans la vue admin Inscriptions → modal avec QR scannable, téléchargement PNG et affiche imprimable
0bis. **Application installable (PWA)** 🆕 : manifest + service worker + icônes → bannière "Installer Rahma Cours de Français" sur mobile/desktop, icône sur l'écran d'accueil, cache hors-ligne des fichiers statiques, raccourci "Inscrire un élève"
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
15. **Paramètres** : infos école (bulletins), préférences notifications email/SMS/Telegram
16. **Quittances de paiement PDF** 🆕 : générées automatiquement à la validation d'un paiement (A5 paysage, numérotées Q-ANNÉE-00000, montant en lettres, filigrane + cachet officiel) ; **lien de téléchargement sécurisé envoyé au tuteur via Telegram** (page publique `/quittance/:id?t=token`, sans connexion)
17. **Discussions (messagerie interne)** 🆕 : fils de conversation par élève entre parents et administration, badges non-lus, marquage lu automatique, notification Telegram au parent quand l'administration répond
18. **Canal d'annonces Telegram** 🆕 : configuration du canal dans Paramètres → Notifications, publication d'annonces vers tous les abonnés, bandeau « Rejoindre le canal » pour les parents dans Discussions
19. **Code élève & liaison sécurisée** 🆕 : chaque élève a un code unique infalsifiable `RCF-<id>-XXXX` (dérivé cryptographiquement). La liaison parent↔élève exige ce code (à l'inscription du compte ou via « Lier un élève » dans le profil). Le code est visible par le staff (fiche élève + bouton copier, ID dans la liste), envoyé automatiquement au tuteur à l'approbation d'une inscription (Telegram/email), et affiché à l'admin dans une fenêtre après approbation. Les parents ne peuvent plus choisir librement un élève ni modifier leurs liaisons ; la liste des élèves n'est plus publique.
20. **Identifiant national de l'élève (12 chiffres) & anti-doublon** 🆕 : champ obligatoire `national_id` (exactement 12 chiffres) dans le formulaire « Ajouter un élève » et dans le formulaire d'inscription publique (bilingue AR/FR). Un élève déjà enregistré avec le même identifiant est refusé (erreur 409 explicite) — vérifié à la création d'élève, à la modification, à l'inscription publique (y compris demande pending en double) et à l'approbation d'une inscription. Affiché dans la fiche élève, la liste (staff) et l'export Excel. ⚠️ Nécessite l'exécution de `migrations/0002_national_id.sql` dans Supabase SQL Editor.
21. **Matière obligatoire par enseignant + affectation élèves ↔ enseignants** 🆕 : la matière enseignée est obligatoire à la création d'un compte enseignant (inscription publique) ET à l'ajout/modification par l'admin (validée côté client et serveur). À l'inscription d'un compte enseignant, sa fiche `teachers` est créée/liée automatiquement (par email) avec la matière. L'admin affecte les élèves à chaque enseignant (bouton « Affecter des élèves » dans la liste Enseignants — cases à cocher avec recherche ; un élève peut avoir plusieurs enseignants). **Un enseignant ne voit que ses élèves affectés** : liste élèves, notes, présences, frais, bulletins, discussions, statistiques du tableau de bord et codes élèves sont tous filtrés. Tant que la migration 0003 n'est pas appliquée, le comportement historique est conservé (pas de filtrage). ⚠️ Nécessite l'exécution de `migrations/0003_teacher_assignments.sql` dans Supabase SQL Editor.
22. **Matière de l'enseignant visible partout + cours interactifs enrichis** 🆕 :
    - **Discussions** : chaque message envoyé par un enseignant porte désormais sa matière (`staff:Nom|Matière`) — les parents voient un badge violet 📖 « Matière » à côté du nom de l'enseignant dans le fil.
    - **Notes** : nouvelle colonne « Enseignant » (nom + badge matière) dans le relevé de notes visible par les parents ; les notes créées par un enseignant enregistrent automatiquement son `teacher_id` ; l'admin peut choisir l'enseignant dans le formulaire de note.
    - **Cours interactifs enrichis — 4 types** : 🎮 Quiz (QCM existant), 🃏 Cartes mémoire (recto/verso cliquables avec navigation), ✏️ Texte à trous (syntaxe `[mot]`, correction avec normalisation accents/casse et score), 🔗 Application externe (lien d'une application déjà créée — GeoGebra, Wordwall, LearningApps, etc. — intégrée en iframe dans l'application ou ouverte dans un nouvel onglet). Vue avec filtres par type (pastilles), badges type/matière/enseignant sur chaque carte.
    - Repli automatique : l'application fonctionne avant ET après la migration (avant, les cours sont sauvés en mode simple). ✅ Migration `migrations/0004_teacher_subject_display_and_rich_courses.sql` exécutée en base.
23bis. **Feuilles de travail Maths 6AP (أوراق عمل الرياضيات)** 🆕 : 2 pages HTML autonomes hébergées dans `/static/cours/` et référencées comme cours interactifs de type « Application externe » (iframe intégrée) pour le niveau 6AP, matière Mathématiques, avec filigrane logo Rahma sur chaque page A4 imprimable :
    - **#64 — الثلاثي الأول** : قياسات الكتلة والطول والحجم (3 pages, `/static/cours/math6ap-tri1-mesures`)
    - **#65 — الثلاثي الثاني** : البيئة، الصحة، الرياضة والتكنولوجيا (4 pages, `/static/cours/math6ap-tri2-themes`)
    - **#66 — وضعيات مسائل (دَد)** : المعادلات، التوزيع، الأعمار والكسور — 20 وضعيّة avec bouton « الحلّ » (correction détaillée dépliable) (4 pages, `/static/cours/math6ap-tri3-situations`)

23. **Bibliothèque de cours interactifs « Cahier de vacances »** 🆕 : 32 cours de français prêts à l'emploi créés en base (niveaux primaire) à partir du cahier de vacances fourni — 17 quiz de lecture/grammaire (avec écran de lecture du texte avant le quiz quand une lecture est associée), 7 jeux de cartes mémoire (vocabulaire, conjugaison) et 8 textes à trous. Script : `scripts/seed_interactive_cahier.mjs`.
24. **Quiz maths « أتدرب على الرسم البياني » + partage des cours par les enseignants** 🆕 :
    - **5 quiz de mathématiques en arabe** (niveau 5ème année, matière Mathématiques) couvrant les 18 وضعيات du support « أتدرب على الرسم البياني » avec toutes les réponses calculées (49 questions au total). Script : `scripts/seed_math_graphique.mjs`.
    - **Bouton « Partager » sur chaque cours (staff)** : fenêtre avec lien direct copiable `https://…/#ic-<id>`, boutons de partage WhatsApp et Telegram, et bouton « Notifier les élèves du niveau » qui envoie une notification (+ Telegram parent si lié) à tous les élèves actifs du niveau du cours (filtrés par affectation pour un enseignant) — route `POST /api/interactive/notify`.
    - **Lien direct (deep-link)** : ouvrir `…/#ic-<id>` lance automatiquement le cours si l'utilisateur est connecté, sinon le cours s'ouvre juste après la connexion.
    - **Bouton « Dupliquer »** : copie un cours existant (« … (copie) ») pour qu'un enseignant l'adapte rapidement à sa classe.
25. **Documents pédagogiques avec filigrane automatique du logo** 🆕 :
    - **Fiches ajoutées à Cours & Documents** : « Ma routine matinale » (expression écrite illustrée) et « Le présent des verbes être et avoir » (PDF 2 pages) — toutes deux filigranées avec le logo Rahma (centré, semi-transparent).
    - **8 cours interactifs dérivés** (#41-#48) : quiz « être ou avoir ? », textes à trous conjugaison être/avoir, quiz des pronoms, accord sujet-verbe, cartes mémoire conjugaison complète, texte à trous et quiz « Ma routine matinale ».
    - **Filigrane automatique** : tout document (image ou PDF) ajouté via « Nouveau cours » reçoit automatiquement le logo Rahma en filigrane côté client (canvas pour images, pdf-lib pour PDF) avant l'envoi au stockage. En cas d'échec (PDF protégé…), le fichier original est envoyé. Les photos d'élèves ne sont pas filigranées. Logo de référence : bucket `photos/logo_rahma_watermark.png`.
    - **Aperçu image sur les cartes de cours** : les documents image affichent une miniature cliquable.
26. **Mensualités automatiques et historique de paiement par élève** 🆕 :
    - **Génération automatique mensuelle** : chaque élève actif reçoit une mensualité « Mensualité <mois> <année> » (échéance le 10 du mois) — générée automatiquement une fois par jour (déclenchée par le chargement du tableau de bord, verrou `settings.fees_maintenance`) ou manuellement via le bouton admin « Générer mensualités ».
    - **Montant personnalisable** : montant par défaut réglable (engrenage de la page Frais, `settings.fees.monthly_amount`, défaut 60 DT) + mensualité personnalisée par élève (champ « Mensualité personnalisée » de la fiche élève, colonne `students.monthly_fee`).
    - **Rappels de retard automatiques** : les mensualités échues passent en « overdue » et le tuteur reçoit une notification « Rappel de paiement » (visible aussi par l'élève/parent connecté).
    - **Historique de paiement par élève** : cliquer sur le nom d'un élève dans la page Frais ouvre un modal avec totaux payé / en attente / en retard, alerte de retard et tableau complet (quittance PDF, marquer payé). API : `GET /api/fees/history/:studentId` (parent/élève : uniquement les élèves liés, enseignant : uniquement les élèves affectés).
    - ✅ **Migration `0005_monthly_fees.sql` appliquée** (08/09/2026) : colonnes `fees.period` et `students.monthly_fee` actives — anti-doublon par période et mensualités personnalisées pleinement opérationnels (testés : idempotence + écriture monthly_fee via API).
27. **5 affiches pédagogiques 5AP (grammaire) + 11 cours interactifs dérivés** 🆕 :
    - **Affiches publiées dans Cours & Documents** (filigranées logo Rahma, niveau 5AP, Français) : « Grâce à / À cause de », « Les métiers — masculin/féminin (3 parties) », « Les métiers — grand tableau », « À la, au et chez », « Parler Français (au, à la, à l', aux, du, de la, de l') ».
    - **11 cours interactifs dérivés** (#49-#59) : 6 quiz (grâce à/à cause de ×2, métiers féminin/masculin, à la/au/chez, articles contractés), 2 textes à trous (transformation grâce à↔à cause de, prépositions de lieu) et 3 jeux de cartes mémoire (métiers ×2, articles contractés). Script : `scripts/seed_affiches_5ap.mjs`.
28. **Carnet de classe — plan de salle interactif & évaluation continue (دفتر التنقيط)** 🆕 :
    - **Plan de salle réaliste** par niveau : tableau noir, bureau de l'enseignant, grille configurable de tables doubles (rangées et tables/rangée ajustables ±), sièges libres cliquables « + Placer ».
    - **Placement des élèves** : affectation manuelle par siège, « Placement auto » de tout le niveau, « Vider les places », « Libérer la place » — le plan est sauvegardé par niveau (`settings.notebook_<niveau>`).
    - **Fiche d'évaluation instantanée** (panneau latéral, clic sur un élève) : 4 critères notés /5 par pas de ±0.5 — Participation & interaction (المشاركة والتفاعل), Discipline & assiduité (الانضباط والحضور), Comportement & moralité (السلوك والأخلاق), Cahier & devoirs (الكراس والواجبات) — moyenne en direct, bouton « Récompense participation (+0.5) », « Main levée ✋ ».
    - **Pointage direct depuis le plan** : Présent / Retard / Absent du jour (mêmes notifications automatiques au tuteur que la page Présence), pastille de statut sur chaque siège.
    - **Tirage au sort d'un élève** (قرعة تلميذ للمشاركة) avec effet roulette + halo vert lime pulsant sur l'élu (les absents sont exclus).
    - **Mini-badge de moyenne** au-dessus de chaque élève sur le plan ; accès direct à la « Fiche élève » complète.
    - **Avatars 3D réalistes (style Pixar)** pour les élèves sans photo : 8 portraits 3D (`/static/avatars/boy1-4.jpg`, `girl1-4.jpg`) choisis de façon déterministe selon le genre (colonne `gender`) et l'id (`1 + id % 4`) — utilisés dans le plan de salle, la fiche latérale, le Carnet de notation (table + cartes) et la liste « à soutenir » des Analyses. La photo réelle (`photo_url`) reste toujours prioritaire si renseignée. Les 8 avatars sont pré-cachés par le Service Worker (v19) pour le mode hors-ligne.
    - Menu « Carnet de classe » réservé admin/enseignants ; les enseignants peuvent enregistrer uniquement les clés `notebook_*` des réglages.
29. **Analyses & rapports du niveau (لوحة التحليلات والتقارير)** 🆕 :
    - **8 indicateurs clés** par niveau et trimestre : moyenne générale /20 (معدل القسم العام), taux de réussite ≥10 (نسبة النجاح), meilleure/plus basse moyenne avec nom de l'élève, absences non justifiées/excusées, retards et assiduité parfaite du mois (انضباط تام).
    - **Distribution des moyennes par appréciation** (منحنى توزيع المعدلات حسب التقدير) : 7 tranches bilingues FR/AR (Excellent ممتاز 18-20 → Faible ضعيف <8) en barres colorées avec effectifs et pourcentages.
    - **Tableau d'honneur** (لوحة الشرف والمتفوقين, moyenne ≥ 14) avec podium or/argent/bronze et détail par type d'épreuve (Contrôle/Synthèse/Oral) ; **liste des élèves à suivre et soutenir** (تلاميذ بحاجة لمتابعة ودعم, moyenne < 10).
    - **Export Excel 3 feuilles** (Synthèse / Classement complet avec appréciations bilingues / Distribution) et **impression PDF** avec en-tête logo Rahma.
    - Notes normalisées sur /20 quel que soit le barème saisi ; menu « Analyses & rapports » réservé admin/enseignants.
30. **Carnet de notation et d'évaluation — vue table par élève (دفتر التنقيط والتقويم / دفتر تقويم قسم)** 🆕 :
    - **En-tête de classe** : matière (المادة), année scolaire (السنة الدراسية), effectif (عدد التلاميذ), **معدل القسم /20** et **نسبة النجاح %** calculés en direct.
    - **Table de notation par élève** : n° (رت), nom (اللقب والاسم), **4 critères /5 avec boutons +/− inline** (المشاركة والتفاعل / الانضباط والحضور / السلوك والأخلاق / الكراس والواجبات) **synchronisés avec le Carnet de classe** (mêmes données `settings.notebook_<niveau>`), **ت. مستمر /20 = somme des 4 critères**, saisies **فرض 1 / فرض 2 / الاختبار** (nouveaux `exam_type` : `devoir1`, `devoir2`, `examen` — aussi disponibles dans le formulaire Notes & Bulletins).
    - **معدل المادة = (ت. مستمر + moyenne(فرض 1, فرض 2) + الاختبار × 2) ÷ 4** (formule vérifiée sur les données du modèle) + **badge التقدير والإجراء** : ممتاز (لوحة الشرف) / جيد جدا (تهنئة) / جيد (تشجيع) / قريب من الجيد / متوسط (مقبول) / دون المتوسط / ضعيف.
    - **Barre d'outils** : recherche d'élève (بحث عن اسم تلميذ بالقسم), tri أبجديا بالاسم / الترتيب (classement), toggle جدول / بطاقات (table/cartes), **تعديل جماعي** (édition groupée avec « Enregistrer tout »), sélecteurs niveau/matière/trimestre, **export Excel 2 feuilles**.
    - **Notifications parents maîtrisées** : case « Notifier les parents » (désactivée par défaut dans cette vue) — nouveau header API `X-Skip-Notify: 1` sur `POST /api/db/grades` pour éviter le spam lors des saisies en masse.
    - Menu « Carnet de notation » réservé admin/enseignants ; SW v17.

## URLs / Points d'entrée API
- `POST /api/auth/signup` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET|POST /api/db/:table` · `PUT|DELETE /api/db/:table/:id` (CRUD générique sécurisé, tables : students, teachers, classes, subjects, grades, attendance, fees, courses, interactive_courses, events, notifications, registrations, settings)
- `GET /api/stats` — statistiques dashboard (filtrées par rôle)
- `GET /api/bulletin/:studentId?trimester=N` — données bulletin
- `POST /api/registrations/:id/approve` — approbation inscription
- `POST /api/fees/check-overdue` — relance impayés
- `POST /api/fees/generate-monthly` — génération manuelle des mensualités du mois (admin)
- `GET /api/fees/history/:studentId` — historique de paiement d'un élève (totaux + frais)
- `POST /api/notify` — notification manuelle au tuteur
- `POST /api/interactive/notify` — notifier les élèves du niveau d'un cours interactif (staff, filtré par affectation pour un enseignant)
- `POST /api/upload/:bucket` — upload photos/cours (buckets : photos, courses)
- `GET|PATCH|DELETE /api/admin/users` — gestion utilisateurs (admin)
- `PATCH /api/profile` — mise à jour de son profil
- `GET /api/chat/threads` · `GET /api/chat/messages/:studentId` · `POST /api/chat/send` — messagerie interne
- `POST /api/telegram/announce` — publier une annonce sur le canal Telegram (staff)
- `GET /quittance/:id?t=token` + `GET /api/public/receipt/:id?t=token` — téléchargement public sécurisé d'une quittance
- `GET /api/students/:id/code` — code élève (staff) · `POST /api/link-student` — liaison par code (parent/élève)
- `GET /api/teachers/:id/students` — élèves affectés à un enseignant (admin ou l'enseignant lui-même) · `PUT /api/teachers/:id/students` — remplacer les affectations `{student_ids:[...]}` (admin)

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
- **Dernière mise à jour** : 13/09/2026

## Développement local
```bash
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000
```
