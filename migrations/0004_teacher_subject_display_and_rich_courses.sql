-- Migration 0004 : matière enseignant dans notes + cours interactifs enrichis
-- À exécuter dans Supabase -> SQL Editor

-- Enseignant auteur d'une note (affiché aux parents avec sa matière)
ALTER TABLE grades ADD COLUMN IF NOT EXISTS teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL;

-- Cours interactifs enrichis : type, contenu riche, lien d'application externe
ALTER TABLE interactive_courses ADD COLUMN IF NOT EXISTS course_type TEXT DEFAULT 'quiz'; -- quiz | flashcards | fillblank | external
ALTER TABLE interactive_courses ADD COLUMN IF NOT EXISTS content JSONB DEFAULT '{}';      -- flashcards: {cards:[{front,back}]} ; fillblank: {text:"... [mot] ..."}
ALTER TABLE interactive_courses ADD COLUMN IF NOT EXISTS external_url TEXT;               -- lien app externe (LearningApps, Wordwall, GeoGebra...)
ALTER TABLE interactive_courses ADD COLUMN IF NOT EXISTS teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL;
