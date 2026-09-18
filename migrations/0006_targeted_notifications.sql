-- Migration 0006 : notifications ciblées par rôle (cours / événements / examens)
-- À exécuter dans Supabase -> SQL Editor
--
-- Principe : UNE ligne par information publiée (pas une ligne par compte).
--   audience : rôles destinataires, ex. ["student","parent","teacher"]
--   level    : niveau scolaire ciblé (NULL = toute l'école)
--   ref_table/ref_id : objet concerné (courses / interactive_courses / events)
--   link     : route de l'application à ouvrir au clic (ex. #courses, #ic-12, #calendar)
-- La visibilité est calculée côté serveur (rôle + niveau des enfants liés / élèves affectés).
-- L'état lu / non lu est individuel : table notification_reads (user_id, notification_id).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience JSONB;        -- NULL = notification historique (parent de l'élève student_id)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ref_table TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ref_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_by BIGINT;     -- user_accounts.id de l'auteur (exclu de ses propres notifications)

CREATE INDEX IF NOT EXISTS idx_notifications_type_created ON notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_level ON notifications(level);

CREATE TABLE IF NOT EXISTS notification_reads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, notification_id)
);
CREATE INDEX IF NOT EXISTS idx_nr_user ON notification_reads(user_id);

-- Préférences canaux externes (parents) pour les 3 nouveaux types — activées par défaut pour Telegram
UPDATE settings SET value = value || '{"telegram_cours":true,"telegram_evenement":true,"telegram_examen":true,"email_cours":false,"email_evenement":false,"email_examen":false}'::jsonb
WHERE key = 'notifications';
