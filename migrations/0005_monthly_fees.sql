-- Migration 0005 : mensualités automatiques + historique de paiement
-- À exécuter dans Supabase SQL Editor

-- Période de la mensualité (format YYYY-MM) : permet de savoir si la mensualité
-- du mois a déjà été générée pour un élève (anti-doublon)
ALTER TABLE fees ADD COLUMN IF NOT EXISTS period TEXT;
CREATE INDEX IF NOT EXISTS idx_fees_period ON fees(period);
CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);

-- Montant de la mensualité propre à chaque élève (sinon montant par défaut des paramètres)
ALTER TABLE students ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC;
