-- Migration : identifiant unique de l'élève (12 chiffres)
-- À exécuter dans Supabase → SQL Editor
ALTER TABLE students ADD COLUMN IF NOT EXISTS national_id TEXT UNIQUE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS national_id TEXT;
