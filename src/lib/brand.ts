// Identité visuelle / schéma de niveaux de l'établissement
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { getSettings } from './supabase'
import { TC } from './tenant'
import type { Bindings } from '../types/bindings'

// ---------- F62 : identité de l'établissement (marque blanche) ----------
// Toutes les informations de marque vivent dans settings.key = 'school' (étendu) ; valeurs par défaut = Rahma Academy.
export const BRAND_DEFAULTS = {
  name: 'Rahma Academy', name_ar: 'أكاديمية الرحمة', short_name: 'Rahma Academy', type: 'academie',
  tagline: 'Plateforme de gestion scolaire', tagline_ar: 'منصة إدارة مدرسية',
  logo_url: '/static/logo-rahma.png', logo_light_url: '', favicon_url: '/static/icons/favicon.png',
  // Icônes PWA générées depuis le logo au téléversement (192 / 512 / maskable / apple-touch).
  // Vides → on retombe sur le logo puis sur les icônes Rahma par défaut.
  icon_192_url: '', icon_512_url: '', icon_maskable_url: '', apple_touch_url: '',
  // F70 : icônes de l'application séparée « رفيق المعلم » — logo de l'établissement
  // posé sur le fond turquoise de Rafiq. Vides → on compose à la volée (manifest-rafiq.json)
  // à partir du logo + des couleurs de la palette « rafiq ».
  icon_rafiq_192_url: '', icon_rafiq_512_url: '', icon_rafiq_maskable_url: '',
  color_primary: '#1d4ed8', color_accent: '#f59e0b', color_dark: '#000612',
  // F67 : palette nommée ('rahma', 'rafiq', 'lagoon', …) choisie par l'établissement.
  // Vide = couleurs libres ci-dessus. Les palettes sont définies dans public/static/theme-palettes.js
  // (source unique pour les teintes) et l'API valide seulement la clé.
  color_palette: '',
  address: '10 Av Imam Malik, Messadine 4013', phone: '+216 52 517 581', email: '', website: '', country: 'TN',
  currency: 'DT', currency_ar: 'دينار تونسي', locale: 'fr', director: '', director_title: 'le Directeur',
  legal_id: '', legal_text: '', doc_prefix: '', registration_fee: 40,
  social: { facebook: '', instagram: '', whatsapp: '', youtube: '', telegram: '' },
  landing: { headline: '', subheadline: '', show_stats: true, show_features: true, show_registration: true, show_qr: true },
  modules: {} as Record<string, boolean>
}
// F62 : structure pédagogique (cycles / niveaux) paramétrable par établissement — presets par type
type LevelDef = { code: string; label: string; label_ar?: string; cycle: string }
type CycleDef = { key: string; label: string; label_ar?: string }
type LevelScheme = { preset: string; cycles: CycleDef[]; levels: LevelDef[] }
export const LEVEL_PRESETS: Record<string, { label: string; cycles: CycleDef[]; levels: LevelDef[] }> = {
  tunisie: { label: 'Système scolaire tunisien (1AP → 4AS)',
    cycles: [{ key: 'primaire', label: 'Primaire', label_ar: 'المرحلة الابتدائية' }, { key: 'base', label: 'Base (Collège)', label_ar: 'المرحلة الأساسية (الإعدادية)' }, { key: 'secondaire', label: 'Secondaire (Lycée)', label_ar: 'المرحلة الثانوية' }],
    levels: [
      { code: '1AP', label: '1ère année primaire', label_ar: 'السنة الأولى ابتدائي', cycle: 'primaire' }, { code: '2AP', label: '2ème année primaire', label_ar: 'السنة الثانية ابتدائي', cycle: 'primaire' }, { code: '3AP', label: '3ème année primaire', label_ar: 'السنة الثالثة ابتدائي', cycle: 'primaire' },
      { code: '4AP', label: '4ème année primaire', label_ar: 'السنة الرابعة ابتدائي', cycle: 'primaire' }, { code: '5AP', label: '5ème année primaire', label_ar: 'السنة الخامسة ابتدائي', cycle: 'primaire' }, { code: '6AP', label: '6ème année primaire', label_ar: 'السنة السادسة ابتدائي', cycle: 'primaire' },
      { code: '7AB', label: '7ème année de base', label_ar: 'السنة السابعة أساسي', cycle: 'base' }, { code: '8AB', label: '8ème année de base', label_ar: 'السنة الثامنة أساسي', cycle: 'base' }, { code: '9AB', label: '9ème année de base', label_ar: 'السنة التاسعة أساسي', cycle: 'base' },
      { code: '1AS', label: '1ère année secondaire', label_ar: 'السنة الأولى ثانوي', cycle: 'secondaire' }, { code: '2AS', label: '2ème année secondaire', label_ar: 'السنة الثانية ثانوي', cycle: 'secondaire' }, { code: '3AS', label: '3ème année secondaire', label_ar: 'السنة الثالثة ثانوي', cycle: 'secondaire' }, { code: '4AS', label: '4ème année secondaire', label_ar: 'السنة الرابعة ثانوي', cycle: 'secondaire' }
    ] },
  france: { label: 'Système français (CP → Terminale)',
    cycles: [{ key: 'primaire', label: 'Élémentaire' }, { key: 'college', label: 'Collège' }, { key: 'lycee', label: 'Lycée' }],
    levels: [{ code: 'CP', label: 'CP', cycle: 'primaire' }, { code: 'CE1', label: 'CE1', cycle: 'primaire' }, { code: 'CE2', label: 'CE2', cycle: 'primaire' }, { code: 'CM1', label: 'CM1', cycle: 'primaire' }, { code: 'CM2', label: 'CM2', cycle: 'primaire' }, { code: '6E', label: '6ème', cycle: 'college' }, { code: '5E', label: '5ème', cycle: 'college' }, { code: '4E', label: '4ème', cycle: 'college' }, { code: '3E', label: '3ème', cycle: 'college' }, { code: '2ND', label: 'Seconde', cycle: 'lycee' }, { code: '1RE', label: 'Première', cycle: 'lycee' }, { code: 'TLE', label: 'Terminale', cycle: 'lycee' }] },
  maroc: { label: 'Système marocain (1AP → 2ème Bac)',
    cycles: [{ key: 'primaire', label: 'Primaire', label_ar: 'الابتدائي' }, { key: 'college', label: 'Collégial', label_ar: 'الإعدادي' }, { key: 'lycee', label: 'Qualifiant', label_ar: 'التأهيلي' }],
    levels: [{ code: '1AP', label: '1ère année primaire', cycle: 'primaire' }, { code: '2AP', label: '2ème année primaire', cycle: 'primaire' }, { code: '3AP', label: '3ème année primaire', cycle: 'primaire' }, { code: '4AP', label: '4ème année primaire', cycle: 'primaire' }, { code: '5AP', label: '5ème année primaire', cycle: 'primaire' }, { code: '6AP', label: '6ème année primaire', cycle: 'primaire' }, { code: '1AC', label: '1ère année collège', cycle: 'college' }, { code: '2AC', label: '2ème année collège', cycle: 'college' }, { code: '3AC', label: '3ème année collège', cycle: 'college' }, { code: 'TC', label: 'Tronc commun', cycle: 'lycee' }, { code: '1BAC', label: '1ère année Bac', cycle: 'lycee' }, { code: '2BAC', label: '2ème année Bac', cycle: 'lycee' }] },
  jardin: { label: 'Jardin d\u2019enfants / Crèche (groupes d\u2019âge)',
    cycles: [{ key: 'creche', label: 'Crèche', label_ar: 'الحضانة' }, { key: 'maternelle', label: 'Maternelle', label_ar: 'روضة الأطفال' }],
    levels: [{ code: 'BB', label: 'Bébés (3–12 mois)', label_ar: 'الرضّع', cycle: 'creche' }, { code: 'TP', label: 'Tout-petits (1–2 ans)', label_ar: 'الصغار جداً', cycle: 'creche' }, { code: 'PS', label: 'Petite section (3 ans)', label_ar: 'القسم الصغير', cycle: 'maternelle' }, { code: 'MS', label: 'Moyenne section (4 ans)', label_ar: 'القسم المتوسط', cycle: 'maternelle' }, { code: 'GS', label: 'Grande section (5 ans)', label_ar: 'القسم التحضيري', cycle: 'maternelle' }] },
  centre: { label: 'Centre de formation (niveaux / sessions)',
    cycles: [{ key: 'initiation', label: 'Initiation', label_ar: 'تمهيدي' }, { key: 'perfectionnement', label: 'Perfectionnement', label_ar: 'تحسين' }, { key: 'certification', label: 'Certification', label_ar: 'شهادة' }],
    levels: [{ code: 'N1', label: 'Niveau 1 — Débutant', label_ar: 'المستوى 1', cycle: 'initiation' }, { code: 'N2', label: 'Niveau 2 — Élémentaire', label_ar: 'المستوى 2', cycle: 'initiation' }, { code: 'N3', label: 'Niveau 3 — Intermédiaire', label_ar: 'المستوى 3', cycle: 'perfectionnement' }, { code: 'N4', label: 'Niveau 4 — Avancé', label_ar: 'المستوى 4', cycle: 'perfectionnement' }, { code: 'N5', label: 'Niveau 5 — Expert / Préparation examen', label_ar: 'المستوى 5', cycle: 'certification' }] },
  langues: { label: 'Centre de langues (CECRL A1 → C2)',
    cycles: [{ key: 'A', label: 'Utilisateur élémentaire' }, { key: 'B', label: 'Utilisateur indépendant' }, { key: 'C', label: 'Utilisateur expérimenté' }],
    levels: [{ code: 'A1', label: 'A1 — Découverte', cycle: 'a' }, { code: 'A2', label: 'A2 — Survie', cycle: 'a' }, { code: 'B1', label: 'B1 — Seuil', cycle: 'b' }, { code: 'B2', label: 'B2 — Avancé', cycle: 'b' }, { code: 'C1', label: 'C1 — Autonome', cycle: 'c' }, { code: 'C2', label: 'C2 — Maîtrise', cycle: 'c' }] },
  universite: { label: 'Enseignement supérieur (Licence / Master)',
    cycles: [{ key: 'licence', label: 'Licence', label_ar: 'الإجازة' }, { key: 'master', label: 'Master', label_ar: 'الماجستير' }],
    levels: [{ code: 'L1', label: 'Licence 1', cycle: 'licence' }, { code: 'L2', label: 'Licence 2', cycle: 'licence' }, { code: 'L3', label: 'Licence 3', cycle: 'licence' }, { code: 'M1', label: 'Master 1', cycle: 'master' }, { code: 'M2', label: 'Master 2', cycle: 'master' }] },
  club: { label: 'Club / Association (groupes)',
    cycles: [{ key: 'enfants', label: 'Enfants', label_ar: 'أطفال' }, { key: 'jeunes', label: 'Jeunes', label_ar: 'شباب' }, { key: 'adultes', label: 'Adultes', label_ar: 'كبار' }],
    levels: [{ code: 'G1', label: 'Groupe 1 (6–9 ans)', cycle: 'enfants' }, { code: 'G2', label: 'Groupe 2 (10–13 ans)', cycle: 'enfants' }, { code: 'G3', label: 'Groupe 3 (14–17 ans)', cycle: 'jeunes' }, { code: 'G4', label: 'Groupe 4 (adultes)', cycle: 'adultes' }] }
}
// clés de cycles en minuscules (cohérence avec normalizeScheme)
for (const p of Object.values(LEVEL_PRESETS)) { for (const c of p.cycles) c.key = c.key.toLowerCase() }
export const TYPE_PRESET: Record<string, string> = { ecole: 'tunisie', academie: 'tunisie', college: 'tunisie', lycee: 'tunisie', jardin: 'jardin', centre: 'centre', institut: 'centre', universite: 'universite', club: 'club', autre: 'tunisie' }
export function normalizeScheme(x: any): LevelScheme | null {
  if (!x || typeof x !== 'object') return null
  const slug = (v: any, max: number) => String(v ?? '').trim().slice(0, max)
  const cycles: CycleDef[] = Array.isArray(x.cycles) ? x.cycles.map((c: any) => ({ key: slug(c.key, 24).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase(), label: slug(c.label, 60), label_ar: slug(c.label_ar, 60) || undefined })).filter((c: CycleDef) => c.key && c.label) : []
  const keys = new Set(cycles.map(c => c.key))
  const seen = new Set<string>()
  const levels: LevelDef[] = Array.isArray(x.levels) ? x.levels.map((l: any) => ({ code: slug(l.code, 12).replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase(), label: slug(l.label, 80), label_ar: slug(l.label_ar, 80) || undefined, cycle: slug(l.cycle, 24).toLowerCase() })).filter((l: LevelDef) => l.code && l.label && keys.has(l.cycle) && !seen.has(l.code) && !!seen.add(l.code)) : []
  if (!cycles.length || !levels.length) return null
  return { preset: slug(x.preset, 24) || 'custom', cycles, levels }
}
function schemeFor(b: any): LevelScheme {
  const custom = normalizeScheme(b?.levels)
  if (custom) return custom
  const key = (b?.levels?.preset && LEVEL_PRESETS[b.levels.preset]) ? b.levels.preset : (TYPE_PRESET[b?.type] || 'tunisie')
  const p = LEVEL_PRESETS[key]
  return { preset: key, cycles: p.cycles, levels: p.levels }
}

export type Brand = typeof BRAND_DEFAULTS & Record<string, any>
// (per-tenant) let _brandCache: { at: number; value: Brand } | null = null
function brandDeepMerge(dst: any, src: any) { for (const k of Object.keys(src || {})) { const v = src[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { dst[k] = brandDeepMerge({ ...(dst[k] || {}) }, v) } else if (v !== undefined && v !== null && v !== '') dst[k] = v } return dst }
export async function getBrand(env: Bindings, force = false): Promise<Brand> {
  if (!force && TC._brandCache && Date.now() - TC._brandCache.at < 60000) return TC._brandCache.value
  let saved: any = {}
  try { saved = await getSettings(env, 'school') } catch {}
  const value = brandDeepMerge(JSON.parse(JSON.stringify(BRAND_DEFAULTS)), saved) as Brand
  if (!saved.short_name && saved.name) value.short_name = saved.name
  ;(value as any).scheme = schemeFor(value)
  TC._brandCache = { at: Date.now(), value }
  return value
}
export function brandInvalidate() { TC._brandCache = null }
export const BRAND_TYPES: Record<string, string> = { ecole: 'École', academie: 'Académie', college: 'Collège', lycee: 'Lycée', jardin: 'Jardin d\u2019enfants / Crèche', centre: 'Centre de formation', institut: 'Institut', universite: 'Université', club: 'Club / Association', autre: 'Autre établissement' }
