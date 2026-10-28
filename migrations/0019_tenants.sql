-- F63 : Multi-établissements — registre central des établissements (base MAÎTRE uniquement).
-- Chaque établissement possède SA PROPRE base Supabase (schema.sql + migrations appliqués dedans).
-- La base maître (celle de Rahma Academy, tenant par défaut « rahma ») ne contient que l'annuaire ci-dessous.
-- Les clés de service sont chiffrées (AES-256-GCM) avec le secret TENANT_SECRET (variable d'environnement) : jamais en clair.

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,                 -- identifiant court (URL /e/<slug>, en-tête X-Tenant)
  name TEXT NOT NULL,
  type TEXT DEFAULT 'ecole',                 -- ecole | academie | college | lycee | jardin | centre | institut | universite | club | autre
  logo_url TEXT,
  country TEXT DEFAULT 'TN',
  status TEXT DEFAULT 'pending',             -- pending (à valider) | active | suspended
  is_public BOOLEAN DEFAULT TRUE,            -- visible dans le sélecteur d'établissement de l'accueil
  db_url TEXT NOT NULL,                      -- https://xxxx.supabase.co
  db_key_enc TEXT NOT NULL,                  -- clé service chiffrée : v1.<iv_b64>.<cipher_b64>
  db_key_hint TEXT,                          -- 6 derniers caractères (affichage super-admin)
  custom_domain TEXT UNIQUE,                 -- domaine ou sous-domaine dédié (optionnel)
  admin_email TEXT,                          -- premier administrateur (contact)
  admin_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(custom_domain);
