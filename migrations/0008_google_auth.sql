-- Migration 0008 : connexion Google (OAuth 2.0 / OpenID Connect)
-- À exécuter dans Supabase -> SQL Editor
-- L'application fonctionne sans cette migration (repli : liaison par email uniquement, pas d'avatar).

ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS google_id TEXT;          -- identifiant Google "sub" (stable, unique)
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS avatar_url TEXT;         -- photo de profil Google
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password'; -- password | google
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_google_id ON user_accounts(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_accounts_email_lower ON user_accounts (lower(email));
