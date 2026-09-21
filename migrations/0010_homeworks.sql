-- Migration 0010 : devoirs à rendre (الواجبات المنزلية)
-- À exécuter dans Supabase -> SQL Editor
-- Puis créer le bucket Storage PUBLIC « homeworks » (Storage → New bucket → name: homeworks → Public) pour les fichiers déposés.

CREATE TABLE IF NOT EXISTS homeworks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  instructions TEXT,                       -- consignes (texte)
  subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
  level TEXT NOT NULL,                     -- 1AP..4AS
  teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,             -- date + heure limite
  attachment_url TEXT,                     -- pièce jointe enseignant (PDF/image)
  attachment_name TEXT,
  max_points NUMERIC DEFAULT 20,
  allow_late BOOLEAN DEFAULT true,         -- dépôt tardif autorisé (marqué « en retard »)
  count_in_term BOOLEAN DEFAULT false,     -- la note compte pour le trimestre (report dans grades)
  trimester INT DEFAULT 1,
  status TEXT DEFAULT 'published',         -- draft | published | closed
  school_year TEXT,
  created_by BIGINT,                       -- user_accounts.id
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT
);
CREATE INDEX IF NOT EXISTS idx_homeworks_level_due ON homeworks(level, due_at);
CREATE INDEX IF NOT EXISTS idx_homeworks_teacher ON homeworks(teacher_id);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  homework_id BIGINT NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content TEXT,                            -- réponse texte
  files JSONB DEFAULT '[]',                -- [{url,name,type,size}]
  submitted_at TIMESTAMPTZ DEFAULT now(),
  submitted_by BIGINT,                     -- user_accounts.id (élève ou parent)
  is_late BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'submitted',         -- submitted | graded | returned
  score NUMERIC,
  feedback TEXT,
  corrected_file_url TEXT,
  graded_by BIGINT,
  graded_at TIMESTAMPTZ,
  grade_id BIGINT,                         -- note reportée dans grades (si count_in_term)
  UNIQUE(homework_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_hs_homework ON homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_hs_student ON homework_submissions(student_id);
