-- Migration 0018 : registre d'authenticité des documents (filigrane + droits d'auteur)
-- Chaque fichier déposé (cours, supports d'évaluation, devoirs, photos) est filigrané côté serveur,
-- haché (SHA-256) et enregistré ici. La page publique /verifier/<code> authentifie un document.
CREATE TABLE IF NOT EXISTS document_registry (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- code court public (12 car.) imprimé sur le document
  bucket TEXT NOT NULL,                   -- photos | courses | homeworks
  path TEXT NOT NULL,                     -- chemin dans le bucket
  url TEXT NOT NULL,                      -- URL publique
  filename TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT NOT NULL,                   -- empreinte du fichier filigrané (tel que publié)
  sha256_original TEXT,                   -- empreinte du fichier d'origine (avant filigrane)
  watermarked BOOLEAN DEFAULT false,
  owner_user_id BIGINT REFERENCES user_accounts(id) ON DELETE SET NULL,
  owner_name TEXT,
  owner_role TEXT,
  teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
  license TEXT DEFAULT 'Tous droits réservés — Rahma Academy',
  school_year TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docreg_sha ON document_registry(sha256);
CREATE INDEX IF NOT EXISTS idx_docreg_owner ON document_registry(owner_user_id);
