-- Migration 0016 : Référentiel du programme scolaire tunisien (cycles → niveaux → sections → matières → trimestres → chapitres → notions)
-- À exécuter dans Supabase -> SQL Editor. Seed : POST /api/curriculum/seed (admin) à partir de /seed/*.json

CREATE TABLE IF NOT EXISTS cur_cycles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- primaire | preparatoire | secondaire
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  position INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cur_levels (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- P1..P6, C7..C9, S1..S4
  legacy_code TEXT,                       -- 1AP..6AP, 7AB..9AB, 1AS..4AS (niveaux utilisés par le reste de Rahma)
  cycle_id BIGINT NOT NULL REFERENCES cur_cycles(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  grade INT,                              -- 1..13
  duration_default INT DEFAULT 60,        -- minutes par défaut d'un devoir
  position INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cur_levels_legacy ON cur_levels(legacy_code);
CREATE TABLE IF NOT EXISTS cur_sections (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- lettres | maths | sciences_exp | eco_gestion | sciences_tech | info | sport | f_lettres | f_sciences | f_eco | f_info
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  levels TEXT[] DEFAULT '{}',             -- codes de niveaux concernés (ex. {S3,S4})
  kind TEXT DEFAULT 'bac',                -- filiere (2e année) | bac (3e-4e)
  position INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cur_subjects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  is_optional BOOLEAN DEFAULT false,
  default_lang TEXT DEFAULT 'ar',         -- ar | fr | en
  family TEXT,                            -- langues | sciences | humaines | arts | techno | sport | autres
  school_subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,  -- lien carnet de notes (mapping auto par nom, modifiable)
  position INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cur_level_subjects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level_id BIGINT NOT NULL REFERENCES cur_levels(id) ON DELETE CASCADE,
  section_id BIGINT REFERENCES cur_sections(id) ON DELETE CASCADE,   -- null = tronc commun / niveau sans section
  subject_id BIGINT NOT NULL REFERENCES cur_subjects(id) ON DELETE CASCADE,
  coefficient NUMERIC,
  starts_from_grade INT,
  duration_default INT,
  grading_scale INT DEFAULT 20,
  default_lang TEXT,                      -- override langue (maths : ar primaire/collège, fr secondaire)
  is_specialty BOOLEAN DEFAULT false,
  needs_verification BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'published',        -- draft | published
  position INT DEFAULT 0,
  UNIQUE(level_id, section_id, subject_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cur_ls_nosection ON cur_level_subjects(level_id, subject_id) WHERE section_id IS NULL;
CREATE TABLE IF NOT EXISTS cur_chapters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level_subject_id BIGINT NOT NULL REFERENCES cur_level_subjects(id) ON DELETE CASCADE,
  trimester INT DEFAULT 1,                -- 1 | 2 | 3 | 0 = année complète
  code TEXT,                              -- clé d'import idempotente (ex. P6.maths.T1.decimaux)
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  needs_verification BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'published',
  position INT DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cur_chapters_code ON cur_chapters(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cur_chapters_ls ON cur_chapters(level_subject_id, trimester);
CREATE TABLE IF NOT EXISTS cur_notions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chapter_id BIGINT NOT NULL REFERENCES cur_chapters(id) ON DELETE CASCADE,
  code TEXT,
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  position INT DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cur_notions_code ON cur_notions(code) WHERE code IS NOT NULL;
CREATE TABLE IF NOT EXISTS cur_domains (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES cur_subjects(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  position INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cur_exercise_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- 8 types moteur + construction_geo, redaction, analyse_doc, dissertation, tableau, ordonner_images
  base_type TEXT NOT NULL DEFAULT 'open', -- type moteur du constructeur ; les nouveaux types sont des gabarits de « open »
  name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
  subject_codes TEXT[] DEFAULT '{}',      -- vide = toutes matières
  template JSONB DEFAULT '{}',
  position INT DEFAULT 0
);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS cur_level_subject_id BIGINT REFERENCES cur_level_subjects(id) ON DELETE SET NULL;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS cur_chapter_ids BIGINT[] DEFAULT '{}';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS cur_notion_ids BIGINT[] DEFAULT '{}';
ALTER TABLE exercise_bank ADD COLUMN IF NOT EXISTS cur_chapter_id BIGINT REFERENCES cur_chapters(id) ON DELETE SET NULL;
ALTER TABLE exercise_bank ADD COLUMN IF NOT EXISTS cur_notion_id BIGINT REFERENCES cur_notions(id) ON DELETE SET NULL;
