-- Migration 0003 : affectation élèves <-> enseignants + liaison compte enseignant
-- À exécuter dans Supabase -> SQL Editor

-- Lier un compte utilisateur (rôle teacher) à sa fiche enseignant
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS linked_teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL;

-- Affectations élèves par enseignant (plusieurs enseignants possibles par élève)
CREATE TABLE IF NOT EXISTS teacher_students (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(teacher_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_ts_teacher ON teacher_students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ts_student ON teacher_students(student_id);
