-- Migration 0015 : Bibliothèque d'exercices, chapitres, modèles, versions, jetons IA (cahier des charges « plateforme d'examens »)
-- À exécuter dans Supabase -> SQL Editor (après 0014_evaluations.sql)

-- Chapitres du programme (classification matière × niveau)
CREATE TABLE IF NOT EXISTS chapters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  name TEXT NOT NULL,                      -- nom (fr)
  name_ar TEXT,
  position INT DEFAULT 0,
  UNIQUE(subject_id, level, name)
);

-- Exercices réutilisables
CREATE TABLE IF NOT EXISTS exercise_bank (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL,                      -- mcq | truefalse | match | strike | fill | conjug | quote | open
  title TEXT,                              -- intitulé court (recherche)
  subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
  level TEXT,                              -- 1AP..4AS (null = tous)
  chapter_id BIGINT REFERENCES chapters(id) ON DELETE SET NULL,
  chapter TEXT,                            -- libellé libre si pas de chapitre référencé
  difficulty INT DEFAULT 2,                -- 1 facile · 2 moyen · 3 difficile
  lang TEXT DEFAULT 'fr',                  -- fr | ar | en
  data JSONB NOT NULL DEFAULT '{}',        -- item complet (consigne, question, options, correct, blanks, pairs, ... , points)
  tags TEXT[] DEFAULT '{}',
  source_text TEXT,                        -- texte support (lecture) optionnel
  author_id BIGINT,                        -- user_accounts.id
  origin_id BIGINT,                        -- exercice d'origine si copie personnelle
  visibility TEXT DEFAULT 'private',       -- private | school | public
  status TEXT DEFAULT 'approved',          -- pending | approved | hidden (modération)
  ai_generated BOOLEAN DEFAULT false,
  uses INT DEFAULT 0,                      -- nombre d'ajouts à une évaluation
  reports INT DEFAULT 0,                   -- signalements
  school_year TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT
);
CREATE INDEX IF NOT EXISTS idx_bank_filters ON exercise_bank(level, subject_id, type, difficulty, status);
CREATE INDEX IF NOT EXISTS idx_bank_author ON exercise_bank(author_id);

CREATE TABLE IF NOT EXISTS exercise_favorites (
  user_id BIGINT NOT NULL,
  exercise_id BIGINT NOT NULL REFERENCES exercise_bank(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, exercise_id)
);

-- Historique de versions des évaluations (sauvegarde automatique)
CREATE TABLE IF NOT EXISTS evaluation_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_id BIGINT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  sections JSONB NOT NULL,
  title TEXT,
  saved_by BIGINT,
  saved_at TIMESTAMPTZ DEFAULT now(),
  note TEXT                                -- 'auto' | 'manuel' | 'publication'
);
CREATE INDEX IF NOT EXISTS idx_eva_versions ON evaluation_versions(evaluation_id, saved_at DESC);

-- Modèles, dossiers, en-tête, partage, variantes
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS folder TEXT;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS header JSONB DEFAULT '{}';          -- {school, teacher_name, show_logo, instructions}
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS shared_with BIGINT[] DEFAULT '{}';  -- user_accounts.id des collègues (lecture)
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS shared_edit BOOLEAN DEFAULT false;  -- les collègues partagés peuvent modifier
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS shuffle BOOLEAN DEFAULT false;      -- mélanger l'ordre des exercices en passation

-- Jetons IA par utilisateur (solde + mouvements)
CREATE TABLE IF NOT EXISTS ai_wallets (
  user_id BIGINT PRIMARY KEY,
  balance INT DEFAULT 50,
  granted INT DEFAULT 50,
  consumed INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_token_moves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  delta INT NOT NULL,                      -- négatif = consommation
  action TEXT,                             -- exercise | evaluation | quiz | credit
  cost_usd NUMERIC,                        -- coût réel estimé (suivi)
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_moves_user ON ai_token_moves(user_id, created_at DESC);
