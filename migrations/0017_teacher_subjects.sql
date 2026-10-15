-- Migration 0017 : matières affectées par enseignant (plusieurs possibles, liées à la table subjects)
-- L'admin choisit les matières dans la fiche enseignant ; `subject` (texte) reste le libellé affiché / repli.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subject_ids BIGINT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_teachers_subject_ids ON teachers USING GIN (subject_ids);
-- Remplissage initial : relier par nom (insensible à la casse) ; l'admin ajuste ensuite dans la fiche enseignant
UPDATE teachers t SET subject_ids = ARRAY(SELECT s.id FROM subjects s WHERE lower(trim(s.name)) = lower(trim(t.subject)))
WHERE (t.subject_ids IS NULL OR cardinality(t.subject_ids) = 0) AND t.subject IS NOT NULL;
-- Observations du carnet de classe par enseignant : clé settings `notebook_<niveau>_t<teacher_id>` (aucune colonne à ajouter)
