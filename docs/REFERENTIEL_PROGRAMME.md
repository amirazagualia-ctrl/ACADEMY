# Référentiel programme — guide court (admin)

## Où ?
Menu **Référentiel programme** (admin). Si l'écran indique « Tables absentes » : exécuter `migrations/0016_curriculum.sql` dans Supabase → SQL Editor, puis cliquer **Charger le programme de base** (idempotent, ~30 s).

## Ajouter un chapitre (et ses notions)
1. Onglet **Programme** → cliquer le niveau (ex. `6AP`) → (section au secondaire) → la matière dans la liste de gauche.
2. Filtrer le trimestre (1 / 2 / 3 / Toute l'année) → **+ Chapitre**.
3. Saisir le nom en **FR** (obligatoire) et **AR / EN** (repli automatique sur FR si vide). Le **code** est généré (`P6.maths.T2.proportionnalite`) ; il sert de clé d'import : réimporter avec le même code met à jour au lieu de dupliquer.
4. Statut **Publié** = visible dans l'assistant « Créer un examen » ; **Brouillon** = admin seulement. Cocher **À vérifier** tant que le contenu n'est pas confirmé par le programme officiel (badge ⚠️ visible des enseignants).
5. Sur la ligne du chapitre : **+** ajoute une notion (🔖), ✎ modifie, 🗑 supprime (cascade sur les notions). Glisser-déposer les lignes réordonne (enregistré aussitôt).

## Import en masse (CSV)
Bouton **Importer** → coller ou charger un fichier :
```
level,section,subject,trimester,code,name_ar,name_fr,name_en,notion_code,notion_ar,notion_fr,notion_en
P6,,maths,2,P6.maths.T2.proportionnalite,التناسب,Proportionnalité,Proportionality,P6.maths.T2.proportionnalite.tableau,جدول التناسب,Tableau de proportionnalité,Proportionality table
S3,sciences_exp,svt,2,S3.svt.exp.T2.genetique,الوراثة,Génétique,Genetics,S3.svt.exp.T2.genetique.adn,الحمض النووي,ADN,DNA
```
- Une ligne par notion ; les lignes partageant un `code` forment un chapitre. `section` vide = tronc commun.
- Codes niveau : `P1…P6`, `C7…C9`, `S1…S4`. Codes matière / section : colonne *Code* de l'onglet **Matières** et des sections (ex. `maths`, `sciences_exp`, `f_sciences`).
- Les chapitres importés sont **publiés** et marqués **à vérifier**. Relancer l'import = mise à jour.
- Le même bouton accepte le JSON de l'export ou du dossier `seed/`.

## Ajouter une matière
1. Onglet **Matières & mapping** → **+ Matière** : code (ex. `allemand`), noms FR/AR/EN, famille (langues, sciences, humaines, arts, techno, sport, autres), langue par défaut de l'épreuve, optionnelle ou non.
2. Relier la matière à celle du **carnet de notes** (colonne *Carnet de notes* ; le mapping automatique par nom se fait au seed, ajustable ici). C'est ce lien qui alimente `subject_id` des évaluations.
3. Onglet **Programme** → niveau (→ section) → **ajouter** dans la liste des matières : la matière devient disponible pour ce niveau. **Paramètres** (⚙) : langue (override), durée par défaut, barème, coefficient, spécialité, statut.

## Types d'exercices
Onglet **Types d'exercices** : les 8 types moteur sont corrigés automatiquement ; un nouveau type est un **gabarit** d'un type moteur (`open` le plus souvent) avec `subject_codes` (vide = toutes matières) et un `template` JSON : `{"consigne":{"fr":"…","ar":"…","en":"…"},"criteria":["…"],"lines":12,"image":true}`.

## Règles métier du seed
- Durées par défaut : 60 min primaire, 90 collège, 120 secondaire, 180 bac (S4). Barème /20.
- Maths et sciences : arabe en primaire-collège, français au secondaire ; langues dans leur langue.
- Arts et Musique = deux matières optionnelles distinctes. Sections portées par niveau (`cur_sections.levels`), chapitres par section (`section_id` nullable sur `cur_level_subjects`).
- `npm run test:seed` vérifie unicité des codes, 3 langues, clés étrangères, applicabilité des sections et ces règles.
