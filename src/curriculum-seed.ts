// Seed du référentiel programme (importé au build — Cloudflare Workers n'a pas de système de fichiers)
import cycles from '../seed/cycles.json'
import levels from '../seed/levels.json'
import sections from '../seed/sections.json'
import subjects from '../seed/subjects.json'
import level_subjects from '../seed/level_subjects.json'
import domains from '../seed/domains.json'
import exercise_types from '../seed/exercise_types.json'
import chapters from '../seed/chapters.json'
export const CURRICULUM_SEED = { cycles, levels, sections, subjects, level_subjects, domains, exercise_types, chapters } as Record<string, any[]>
