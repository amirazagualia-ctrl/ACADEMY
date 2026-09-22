-- Feature 45 : Certificats & attestations (scolarité, présence, réussite…) PDF filigranés avec QR de vérification
-- À exécuter dans Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS certificates (
  id BIGSERIAL PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,            -- ex. ATT-2026-00012
  type TEXT NOT NULL,                     -- scolarite | presence | reussite | inscription | conduite | autre
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  title TEXT NOT NULL,                    -- intitulé imprimé
  body TEXT NOT NULL,                     -- texte imprimé (figé au moment de l'émission)
  extra JSONB,                            -- données annexes (période de présence, moyenne, mention…)
  issued_by BIGINT,                       -- user_accounts.id
  issued_by_name TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verify_token TEXT NOT NULL,             -- jeton du lien de vérification
  fingerprint TEXT,                       -- SHA-256 du contenu (numéro + élève + texte)
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by BIGINT
);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_year ON certificates(school_year);
