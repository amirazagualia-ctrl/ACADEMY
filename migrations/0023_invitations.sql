-- F75 : invitations — liens d'activation à usage unique (base MAÎTRE uniquement).
--
-- Principe : on ne transmet JAMAIS de mot de passe par e-mail (il resterait dans la boîte du
-- destinataire, dans les journaux du fournisseur et dans les sauvegardes). On envoie un LIEN :
--   • le jeton n'est jamais stocké en clair — seule son empreinte SHA-256 est conservée ;
--   • il expire (7 jours par défaut) et devient inutilisable après le premier usage (`used_at`) ;
--   • il ne donne accès qu'à UN établissement et UNE adresse e-mail.
--
-- Une invitation ne crée aucun établissement et ne modifie aucune donnée métier avant acceptation.
--
-- ⚠️ Migration RÉSERVÉE À LA BASE MAÎTRE (comme 0019 et 0022) : exclue du script d'installation
-- d'un établissement par `scripts_gen_install_sql.mjs`.

CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id          BIGSERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,                  -- SHA-256 hexadécimal du jeton (jamais le jeton)
  tenant      TEXT NOT NULL,                         -- slug de l'établissement visé
  email       TEXT NOT NULL,                         -- destinataire (minuscules)
  name        TEXT,                                  -- nom affiché s'il faut créer le compte
  role        TEXT NOT NULL DEFAULT 'admin',         -- admin | teacher | parent | student
  purpose     TEXT NOT NULL DEFAULT 'invite',        -- invite (nouveau) | reset (mot de passe oublié)
  created_by  TEXT,                                  -- e-mail du super-admin émetteur
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at     TIMESTAMPTZ,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email  ON public.tenant_invitations (email);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant ON public.tenant_invitations (tenant);
-- Une seule invitation vivante par (établissement, e-mail) : réémettre remplace l'ancienne.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_invitations_live
  ON public.tenant_invitations (tenant, email)
  WHERE used_at IS NULL;

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_invitations FROM anon;
REVOKE ALL ON public.tenant_invitations FROM authenticated;
