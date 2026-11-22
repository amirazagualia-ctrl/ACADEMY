-- L2 : sessions serveur révocables (remplace le JWT stocké dans localStorage).
--
-- Principe :
--   • un cookie HttpOnly `rahma_sess` porte un JWT signé (HS256) qui contient le `sid` de la session ;
--   • la ligne `sessions` correspondante est vérifiée à chaque requête : si elle est révoquée
--     (revoked_at renseigné), expirée ou supprimée, la session est refusée (401) ;
--   • la révocation est donc IMMÉDIATE, y compris depuis un autre appareil
--     (« Sessions actives » → Déconnecter cet appareil).
--
-- Rétro-compatibilité : si cette migration n'est pas encore appliquée, l'application continue de
-- fonctionner en mode dégradé (cookie signé sans vérification en base, donc sans révocation).
-- Appliquez ce fichier sur CHAQUE base d'établissement (Supabase → SQL Editor).

CREATE TABLE IF NOT EXISTS public.sessions (
  id            TEXT PRIMARY KEY,                         -- identifiant public de la session (claim `sid`)
  user_id       BIGINT NOT NULL,                          -- user_accounts.id
  tenant        TEXT NOT NULL DEFAULT 'rahma',            -- slug de l'établissement (cloisonnement)
  device_label  TEXT,                                     -- ex. « Chrome · Android » (affiché dans Sessions actives)
  csrf          TEXT NOT NULL,                            -- jeton CSRF lié à la session
  refresh_hash  TEXT,                                     -- SHA-256 du secret de rafraîchissement (jamais le secret en clair)
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_live ON public.sessions (user_id, revoked_at, expires_at);

-- RLS : la table n'est accessible que par la clé service (le Worker). Aucun accès anon/authenticated.
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sessions FROM anon;
REVOKE ALL ON public.sessions FROM authenticated;

-- Purge des sessions mortes depuis plus de 30 jours (à lancer manuellement ou via un cron Supabase).
-- DELETE FROM public.sessions WHERE expires_at < now() - interval '30 days';
