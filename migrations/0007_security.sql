-- Migration 0007 : sécurité — rate-limiting connexion, journal d'audit, soft-delete (corbeille 30 jours)
-- À exécuter dans Supabase -> SQL Editor
--
-- Remarques :
--  * Les mots de passe passent en PBKDF2 (format pbkdf2$iter$sel$hash) automatiquement à la prochaine
--    connexion de chaque utilisateur (aucune action SQL nécessaire).
--  * L'application fonctionne avant ET après cette migration (replis automatiques).

-- 1) Tentatives de connexion (rate-limiting : 5 échecs / 15 min par email ou IP)
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at DESC);

-- 2) Journal d'audit : qui a fait quoi, sur quel enregistrement, avant / après
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,          -- login | login_failed | login_blocked | signup | create | update | delete | soft_delete | restore | purge
  table_name TEXT,
  record_id TEXT,
  before JSONB,
  after JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_email);

-- 3) Soft-delete : colonne deleted_at / deleted_by sur les tables métier
ALTER TABLE students            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
ALTER TABLE teachers            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
ALTER TABLE grades              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
ALTER TABLE fees                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
ALTER TABLE courses             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
ALTER TABLE interactive_courses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
ALTER TABLE events              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
ALTER TABLE classes             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
CREATE INDEX IF NOT EXISTS idx_students_deleted ON students(deleted_at);
CREATE INDEX IF NOT EXISTS idx_grades_deleted   ON grades(deleted_at);
CREATE INDEX IF NOT EXISTS idx_fees_deleted     ON fees(deleted_at);

-- 4) Nettoyage automatique des tentatives de connexion de plus de 24 h (facultatif, via pg_cron si activé)
-- SELECT cron.schedule('purge_login_attempts', '0 3 * * *', $$DELETE FROM login_attempts WHERE created_at < now() - interval '24 hours'$$);
