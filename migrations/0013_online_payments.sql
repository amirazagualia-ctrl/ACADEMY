-- Feature 50 : Paiement en ligne (Konnect — cartes bancaires, D17, Flouci via l'agrégateur)
-- À exécuter dans Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS online_payments (
  id BIGSERIAL PRIMARY KEY,
  fee_id BIGINT NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
  student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'konnect',
  payment_ref TEXT UNIQUE,                -- identifiant du paiement chez le prestataire
  amount_millimes BIGINT NOT NULL,        -- montant en millimes (1 DT = 1000)
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed | expired | cancelled
  pay_url TEXT,
  initiated_by BIGINT,                    -- user_accounts.id (parent)
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  raw JSONB,                              -- dernière réponse du prestataire (vérification)
  school_year TEXT
);
CREATE INDEX IF NOT EXISTS idx_online_payments_fee ON online_payments(fee_id);
CREATE INDEX IF NOT EXISTS idx_online_payments_status ON online_payments(status);

-- Méthode de paiement "en ligne" sur les frais (la colonne method accepte déjà du texte libre : 'en_ligne')
ALTER TABLE fees ADD COLUMN IF NOT EXISTS online_payment_id BIGINT;
