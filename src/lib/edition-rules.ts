// F71 : règles d'édition — logique PURE, sans dépendance base/réseau (testable unitairement).
// Trois éditions, une seule base de code : l'édition n'est qu'une configuration.
//   demo     → lecture seule imposée côté serveur + modules sensibles masqués
//   test     → écriture libre, bac à sable
//   complete → production (défaut)

export type EditionCode = 'demo' | 'test' | 'complete'

export const EDITION_CODES: EditionCode[] = ['demo', 'test', 'complete']
export const DEFAULT_EDITION: EditionCode = 'complete'

export type EditionInfo = {
  code: string
  label: string
  label_ar: string
  hint: string
  read_only: boolean
}

export type Edition = EditionInfo & {
  modules: Record<string, boolean>
  seed_profile: string
  max_users: number | null
}

// Miroir exact du seed de migrations/0020_editions.sql (utilisé si la table est absente
// ou si la requête échoue : l'application ne doit jamais se retrouver sans édition).
export const EDITION_FALLBACK: Edition[] = [
  {
    code: 'demo', label: 'Démo', label_ar: 'نسخة تجريبية', read_only: true,
    hint: 'Lecture seule : idéale pour présenter la plateforme. Toute modification est refusée côté serveur.',
    modules: { fees: false, registrations: false },
    seed_profile: 'demo', max_users: 20
  },
  {
    code: 'test', label: 'Test', label_ar: 'نسخة اختبار', read_only: false,
    hint: 'Écriture libre : bac à sable de recette. Les données de départ peuvent être purgées.',
    modules: {},
    seed_profile: 'minimal', max_users: 50
  },
  {
    code: 'complete', label: 'Complète', label_ar: 'نسخة كاملة', read_only: false,
    hint: 'Production : tous les modules, données réelles, aucune restriction.',
    modules: {},
    seed_profile: 'none', max_users: null
  }
]

export function isEditionCode(code: any): code is EditionCode {
  return EDITION_CODES.includes(String(code) as EditionCode)
}

// Une édition absente / inconnue retombe sur « complete » : jamais de restriction accidentelle
// (un client existant qui envoie n'importe quoi ne doit pas se retrouver en lecture seule).
export function normalizeEditionCode(code: any): EditionCode {
  return isEditionCode(code) ? (String(code) as EditionCode) : DEFAULT_EDITION
}

export function editionInfo(e: Edition): EditionInfo {
  return { code: e.code, label: e.label, label_ar: e.label_ar, hint: e.hint, read_only: !!e.read_only }
}

/**
 * L'édition peut seulement RESTREINDRE les modules de l'établissement, jamais les activer d'office :
 * un module désactivé par l'école doit le rester, et un module interdit par l'édition (démo : frais)
 * ne doit pas réapparaître. Résultat : `false` l'emporte sur `true`.
 */
export function mergeEditionModules(
  brandModules: Record<string, boolean> | undefined,
  editionModules: Record<string, boolean> | undefined
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  const bm = brandModules || {}
  const em = editionModules || {}
  for (const k of new Set([...Object.keys(bm), ...Object.keys(em)])) {
    out[k] = !(bm[k] === false || em[k] === false)
  }
  return out
}

// Méthodes qui écrivent. HEAD/OPTIONS ne modifient rien (OPTIONS = préflight CORS : doit passer,
// sinon l'édition démo casserait tous les appels API depuis le navigateur).
export function isWriteMethod(method: string): boolean {
  const m = String(method || 'GET').toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

/**
 * Décide si une requête est refusée par la lecture seule de l'édition.
 * Exemptions strictement nécessaires :
 *  - `/api/auth/*` : se connecter / se déconnecter reste possible en démo (sinon la démo est inutilisable).
 *  - `/api/admin/edition` : SORTIE DE SECOURS. Sans elle, un établissement passé en démo ne pourrait
 *    plus jamais revenir en « complete » (toute écriture étant refusée). La route reste réservée au
 *    rôle admin et n'autorise QUE le changement d'édition.
 *  - hors `/api/` : les pages HTML restent servies (elles sont en GET de toute façon).
 */
export const EDITION_SWITCH_PATH = '/api/admin/edition'

export function editionWriteBlocked(method: string, pathname: string, readOnly: boolean): boolean {
  if (!readOnly) return false
  if (!isWriteMethod(method)) return false
  const path = String(pathname || '')
  if (!path.startsWith('/api/')) return false
  if (path.startsWith('/api/auth/')) return false
  if (path === EDITION_SWITCH_PATH) return false
  return true
}

export const DEMO_READ_ONLY_ERROR = 'Édition démo : lecture seule'
