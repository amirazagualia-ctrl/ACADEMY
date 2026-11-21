// F71 : accès à l'édition d'un établissement (couche base + cache), au-dessus des règles pures
// de edition-rules.ts. L'édition est stockée dans settings.key='school' → edition_code.
// Table `editions` = catalogue (migrations/0020_editions.sql) ; si elle est absente ou en erreur,
// on retombe sur EDITION_FALLBACK : l'application ne doit JAMAIS rester sans édition.
import { getSettings, sb } from './supabase'
import { TC } from './tenant'
import { DEFAULT_EDITION, EDITION_FALLBACK, editionInfo, mergeEditionModules, normalizeEditionCode } from './edition-rules'
import type { Edition, EditionInfo } from './edition-rules'
import type { Bindings } from '../types/bindings'

// Catalogue des éditions, en cache 5 min par établissement (la table est en lecture seule en pratique).
async function loadCatalog(env: Bindings): Promise<Edition[]> {
  const cache = TC._editionCatalog as { at: number; value: Edition[] } | null
  if (cache && Date.now() - cache.at < 300000) return cache.value
  let value = EDITION_FALLBACK
  try {
    const r = await sb(env, 'editions?select=code,label,label_ar,hint,modules_json,seed_profile,max_users,read_only&order=id')
    if (r.ok && Array.isArray(r.data) && r.data.length) {
      value = r.data.map((e: any) => ({
        code: String(e.code),
        label: String(e.label || e.code),
        label_ar: String(e.label_ar || ''),
        hint: String(e.hint || ''),
        read_only: !!e.read_only,
        modules: (e.modules_json && typeof e.modules_json === 'object') ? e.modules_json : {},
        seed_profile: String(e.seed_profile || 'none'),
        max_users: e.max_users == null ? null : Number(e.max_users)
      }))
    }
  } catch { /* repli silencieux : catalogue par défaut */ }
  TC._editionCatalog = { at: Date.now(), value }
  return value
}

function fallbackFor(code: string): Edition {
  return EDITION_FALLBACK.find(e => e.code === code) || EDITION_FALLBACK[EDITION_FALLBACK.length - 1]
}

/** Édition effective de l'établissement courant (résolue à chaque requête, cache 60 s). */
export async function getEdition(env: Bindings, force = false): Promise<Edition> {
  const cache = TC._editionCache as { at: number; value: Edition } | null
  if (!force && cache && Date.now() - cache.at < 60000) return cache.value
  let saved: any = {}
  try { saved = await getSettings(env, 'school') } catch { /* base indisponible : défaut */ }
  const code = normalizeEditionCode(saved?.edition_code)
  const catalog = await loadCatalog(env)
  const value = catalog.find(e => e.code === code) || fallbackFor(code) || fallbackFor(DEFAULT_EDITION)
  TC._editionCache = { at: Date.now(), value }
  return value
}

export function editionInvalidate() { TC._editionCache = null; TC._editionCatalog = null }

/** Objet exposé au client (aucune donnée interne inutile). */
export function publicEdition(e: Edition): EditionInfo & { modules: Record<string, boolean> } {
  return { ...editionInfo(e), modules: e.modules || {} }
}

/** Catalogue complet, pour le sélecteur de Paramètres → Établissement. */
export async function listEditions(env: Bindings): Promise<EditionInfo[]> {
  const catalog = await loadCatalog(env)
  return catalog.map(editionInfo)
}

/** Fusionne les modules de l'établissement avec les restrictions de l'édition (false gagne). */
export function modulesForEdition(brandModules: any, edition: Edition) {
  return mergeEditionModules(brandModules, edition.modules)
}
