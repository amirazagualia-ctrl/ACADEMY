-- Migration 0009 : années scolaires + archivage
-- À exécuter dans Supabase -> SQL Editor
--
-- Principe : chaque donnée « datée » (notes, présences, frais, événements, inscriptions, notifications)
-- porte l'année scolaire (libellé « 2025-2026 »). Une seule année est courante (is_current).
-- Les années passées restent consultables en lecture seule ; l'assistant « Nouvelle année »
-- clôture l'année, crée la suivante et fait passer les élèves au niveau supérieur.

CREATE TABLE IF NOT EXISTS school_years (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label TEXT UNIQUE NOT NULL,             -- « 2025-2026 »
  start_date DATE NOT NULL,               -- 2025-09-01
  end_date DATE NOT NULL,                 -- 2026-06-30
  is_current BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,                  -- date de clôture (lecture seule ensuite)
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_years_current ON school_years(is_current) WHERE is_current = true;

-- Année scolaire sur les tables datées
ALTER TABLE grades        ADD COLUMN IF NOT EXISTS school_year TEXT;
ALTER TABLE attendance    ADD COLUMN IF NOT EXISTS school_year TEXT;
ALTER TABLE fees          ADD COLUMN IF NOT EXISTS school_year TEXT;
ALTER TABLE events        ADD COLUMN IF NOT EXISTS school_year TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS school_year TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS school_year TEXT;
-- Historique de parcours des élèves (niveau par année) — utile pour les bulletins des années passées
CREATE TABLE IF NOT EXISTS student_year_levels (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  level TEXT NOT NULL,
  class_name TEXT,
  outcome TEXT,                           -- promu | redoublant | sortant | (NULL = en cours)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_grades_year ON grades(school_year);
CREATE INDEX IF NOT EXISTS idx_attendance_year ON attendance(school_year);
CREATE INDEX IF NOT EXISTS idx_fees_year ON fees(school_year);
CREATE INDEX IF NOT EXISTS idx_events_year ON events(school_year);

-- Année courante initiale : 2025-2026 ; toutes les données existantes lui sont rattachées
INSERT INTO school_years (label, start_date, end_date, is_current)
VALUES ('2025-2026', '2025-09-01', '2026-06-30', true)
ON CONFLICT (label) DO NOTHING;

UPDATE grades        SET school_year = '2025-2026' WHERE school_year IS NULL;
UPDATE attendance    SET school_year = '2025-2026' WHERE school_year IS NULL;
UPDATE fees          SET school_year = '2025-2026' WHERE school_year IS NULL;
UPDATE events        SET school_year = '2025-2026' WHERE school_year IS NULL;
UPDATE registrations SET school_year = '2025-2026' WHERE school_year IS NULL;
UPDATE notifications SET school_year = '2025-2026' WHERE school_year IS NULL;

INSERT INTO student_year_levels (student_id, school_year, level, class_name)
SELECT id, '2025-2026', level, class_name FROM students
ON CONFLICT (student_id, school_year) DO NOTHING;
