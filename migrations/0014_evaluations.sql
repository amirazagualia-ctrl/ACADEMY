-- Migration 0014 : constructeur d'évaluations (évaluations des prérequis, contrôles, synthèses)
-- À exécuter dans Supabase -> SQL Editor

CREATE TABLE IF NOT EXISTS evaluations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,                     -- ex. « Évaluation des prérequis — Français »
  kind TEXT DEFAULT 'prerequis',           -- prerequis | controle | synthese | devoir | examen
  subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
  level TEXT NOT NULL,                     -- 1AP..4AS
  teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
  trimester INT DEFAULT 1,
  duration_min INT,                        -- durée conseillée
  lang TEXT DEFAULT 'fr',                  -- fr | ar
  sections JSONB DEFAULT '[]',             -- [{title, subtitle, text, items:[{type, consigne, points, ...}]}]
  total_points NUMERIC DEFAULT 20,
  source JSONB DEFAULT '{}',               -- {course_id, interactive_id, file_url, file_name, text_excerpt, ai_model}
  status TEXT DEFAULT 'draft',             -- draft | published | closed
  online BOOLEAN DEFAULT true,             -- passation en ligne autorisée
  count_in_term BOOLEAN DEFAULT false,     -- report de la note dans grades
  due_at TIMESTAMPTZ,                      -- date limite de passation en ligne (optionnel)
  school_year TEXT,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT
);
CREATE INDEX IF NOT EXISTS idx_evaluations_level ON evaluations(level, status);
CREATE INDEX IF NOT EXISTS idx_evaluations_teacher ON evaluations(teacher_id);

CREATE TABLE IF NOT EXISTS evaluation_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_id BIGINT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  answers JSONB DEFAULT '{}',              -- {"s0i1": réponse} (clé = section/item)
  item_scores JSONB DEFAULT '{}',          -- {"s0i1": points} (auto + manuel)
  auto_score NUMERIC,                      -- points auto-corrigés
  score NUMERIC,                           -- total final (après correction manuelle)
  max_score NUMERIC,
  status TEXT DEFAULT 'submitted',         -- submitted | graded
  feedback TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  submitted_by BIGINT,
  graded_by BIGINT, graded_at TIMESTAMPTZ,
  grade_id BIGINT,
  UNIQUE(evaluation_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_eva_attempts_eval ON evaluation_attempts(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_eva_attempts_student ON evaluation_attempts(student_id);
