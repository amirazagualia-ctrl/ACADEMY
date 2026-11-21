-- F71 : Éditions d'établissement — une seule base de code, l'édition n'est qu'une configuration.
-- L'édition est choisie PAR L'ÉTABLISSEMENT (colonne edition_code dans settings.key = 'school'),
-- jamais par utilisateur : un parent en édition démo sur des notes réelles n'aurait aucun sens.
--
--   demo     : lecture seule imposée CÔTÉ SERVEUR (toute écriture API hors /api/auth/* → 403),
--              données de démonstration, modules sensibles (frais, inscriptions) masqués.
--   test     : écriture libre, données de départ, purge possible — bac à sable de recette.
--   complete : production, tout activé, données réelles (défaut).
--
-- modules_json : modules explicitement imposés par l'édition (false = masqué). L'édition gagne
--                sur le réglage de l'établissement : c'est une contrainte de plateforme.
-- seed_profile : jeu de données de départ appliqué au provisionnement (lot L5).
-- max_users    : plafond indicatif de comptes (NULL = illimité).
-- read_only    : true → le serveur refuse les écritures.

CREATE TABLE IF NOT EXISTS editions (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                  -- demo | test | complete
  label TEXT NOT NULL,
  label_ar TEXT,
  hint TEXT,                                  -- texte d'aide affiché sous le sélecteur
  modules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  seed_profile TEXT DEFAULT 'none',           -- demo | minimal | none
  max_users INTEGER,
  read_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO editions (code, label, label_ar, hint, modules_json, seed_profile, max_users, read_only) VALUES
  ('demo', 'Démo',
   'نسخة تجريبية',
   'Lecture seule : idéale pour présenter la plateforme. Toute modification est refusée côté serveur.',
   '{"fees": false, "registrations": false}'::jsonb, 'demo', 20, TRUE),
  ('test', 'Test',
   'نسخة اختبار',
   'Écriture libre : bac à sable de recette. Les données de départ peuvent être purgées.',
   '{}'::jsonb, 'minimal', 50, FALSE),
  ('complete', 'Complète',
   'نسخة كاملة',
   'Production : tous les modules, données réelles, aucune restriction.',
   '{}'::jsonb, 'none', NULL, FALSE)
ON CONFLICT (code) DO NOTHING;

-- Édition des établissements déjà en service : « complete » (aucun changement de comportement).
UPDATE settings
   SET value = jsonb_set(value, '{edition_code}', '"complete"', true)
 WHERE key = 'school'
   AND NOT (value ? 'edition_code');
