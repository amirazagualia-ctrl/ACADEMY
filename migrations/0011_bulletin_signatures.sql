-- Feature 43 : Signature électronique du bulletin par le parent (accusé de lecture horodaté)
-- À exécuter dans Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS bulletin_signatures (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trimester SMALLINT NOT NULL CHECK (trimester BETWEEN 1 AND 3),
  school_year TEXT NOT NULL,
  signed_by BIGINT,                       -- user_accounts.id du parent signataire
  signer_name TEXT,                       -- nom affiché au moment de la signature
  signer_email TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  general_average NUMERIC(5,2),           -- moyenne au moment de la signature
  grades_count INT,                       -- nombre de notes au moment de la signature
  fingerprint TEXT,                       -- empreinte SHA-256 du contenu signé (notes + moyenne)
  comment TEXT,                           -- remarque facultative du parent
  UNIQUE (student_id, trimester, school_year)
);
CREATE INDEX IF NOT EXISTS idx_bulletin_sig_year ON bulletin_signatures(school_year, trimester);
