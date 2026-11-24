-- F74 : Portail d'entrée multi-établissements (base MAÎTRE uniquement).
--
-- Deux tables, aucune donnée métier, aucun secret :
--
--   • tenant_directory  : annuaire « e-mail → établissement(s) ». Ce n'est PAS une autorité
--                         d'authentification : c'est un CACHE de routage. S'il est vide, incomplet
--                         ou périmé, personne n'est bloqué (l'utilisateur garde /e/<slug> et la
--                         connexion directe). Il est alimenté à chaque connexion réussie.
--   • tenant_requests   : file des demandes de création d'établissement. Une demande n'est JAMAIS
--                         transformée automatiquement en établissement : un humain (super-admin)
--                         l'accepte, puis le provisionnement existant crée le tenant.
--
-- ⚠️ Migration RÉSERVÉE À LA BASE MAÎTRE : elle ne doit pas être incluse dans le script
-- d'installation d'un établissement (voir le filtre de scripts_gen_install_sql.mjs).
-- Appliquez ce fichier sur la base de Rahma Academy (Supabase → SQL Editor).

-- ----------------------------------------------------------------------------
-- 1) Annuaire de routage : quel(s) établissement(s) pour cet e-mail ?
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_directory (
  email      TEXT NOT NULL,                    -- toujours stocké EN MINUSCULES (normalisé à l'écriture)
  tenant     TEXT NOT NULL,                    -- slug de l'établissement
  role       TEXT,                             -- admin | teacher | parent | student (indicatif, pour l'affichage)
  user_id    BIGINT,                           -- user_accounts.id dans la base de l'établissement (facultatif)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, tenant)
);

CREATE INDEX IF NOT EXISTS idx_tenant_directory_email    ON public.tenant_directory (email);
CREATE INDEX IF NOT EXISTS idx_tenant_directory_tenant   ON public.tenant_directory (tenant);

-- RLS : accès réservé à la clé service (le Worker). Aucun accès anon/authenticated.
ALTER TABLE public.tenant_directory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_directory FROM anon;
REVOKE ALL ON public.tenant_directory FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2) File des demandes de création d'établissement
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_requests (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,                       -- nom de l'établissement souhaité
  type              TEXT DEFAULT 'ecole',                -- ecole | academie | college | lycee | jardin | centre | institut | universite | club | autre
  city              TEXT,
  director_name     TEXT NOT NULL,                       -- directeur / responsable
  director_email    TEXT NOT NULL,                       -- normalisé en minuscules
  phone             TEXT,
  expected_students INTEGER,
  message           TEXT,
  status            TEXT NOT NULL DEFAULT 'nouvelle',    -- nouvelle | en_cours | acceptee | refusee
  tenant_slug       TEXT,                                -- slug créé lors de l'acceptation
  handled_at        TIMESTAMPTZ,
  handled_by        TEXT,                                -- e-mail du super-admin ayant traité la demande
  ip                TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_requests_status ON public.tenant_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_requests_email  ON public.tenant_requests (director_email);

-- Anti-doublon : une seule demande ouverte (nouvelle / en_cours) par e-mail de directeur.
-- Une nouvelle demande alors qu'une demande est déjà ouverte est ignorée (réponse 200 « déjà enregistrée »).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_requests_open
  ON public.tenant_requests (director_email)
  WHERE status IN ('nouvelle', 'en_cours');

ALTER TABLE public.tenant_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_requests FROM anon;
REVOKE ALL ON public.tenant_requests FROM authenticated;
