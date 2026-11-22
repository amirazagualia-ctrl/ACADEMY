// L3 : autorisation serveur par défaut (deny-by-default) — logique PURE, testable sans base ni réseau.
//
// Principe : toute route `/api/*` exige une session, SAUF une liste blanche explicite.
// Aujourd'hui chaque route appelle déjà `getUser()` et renvoie 401 ; cette garde rend la règle
// GLOBALE : une future route qui oublierait son contrôle est fermée par défaut, pas ouverte.
//
// Ce module ne change AUCUNE autorisation métier (rôles, périmètre enseignant, appartenance) :
// il ne décide que « connecté ou non ».

// Routes accessibles sans session. Chaque entrée est justifiée dans le commentaire.
const PUBLIC: Array<{ re: RegExp; why: string }> = [
  { re: /^\/api\/health$/, why: 'sonde de disponibilité (aucune donnée)' },
  { re: /^\/api\/auth\/login$/, why: 'connexion' },
  { re: /^\/api\/auth\/signup$/, why: 'inscription publique' },
  { re: /^\/api\/auth\/refresh$/, why: 'renouvellement par cookie de rafraîchissement' },
  { re: /^\/api\/auth\/logout$/, why: 'déconnexion (efface les cookies même sans session)' },
  { re: /^\/api\/auth\/google(\/.*)?$/, why: 'OAuth Google (status + redirection + retour)' },
  { re: /^\/api\/brand$/, why: 'identité publique de l’établissement (logo, couleurs, modules)' },
  { re: /^\/api\/public\//, why: 'vérification de document, quittance par jeton, statistiques' },
  { re: /^\/api\/tenants$/, why: 'annuaire public des établissements (nom, logo)' },
  { re: /^\/api\/tenants\/check\/[^/]+$/, why: 'disponibilité d’un identifiant à la création' },
  { re: /^\/api\/tenants\/install\.sql$/, why: 'script d’installation téléchargeable' },
  { re: /^\/api\/tenants\/[a-z0-9][a-z0-9-]{1,30}$/, why: 'fiche publique d’un établissement' },
  { re: /^\/api\/telegram\/webhook$/, why: 'webhook Telegram (secret vérifié par Telegram)' },
  { re: /^\/api\/payments\/webhook$/, why: 'webhook de paiement (signature vérifiée par le prestataire)' }
]

// Écritures publiques ponctuelles : table + méthode. L'inscription d'un nouvel élève se fait
// sans compte (formulaire public), avec ses propres contrôles dans la route.
const PUBLIC_WRITES: Array<{ table: string; method: string }> = [
  { table: 'registrations', method: 'POST' }
]

// Vrai si la route peut être appelée sans session.
export function isPublicApi(method: string, pathname: string): boolean {
  const m = String(method || 'GET').toUpperCase()
  const p = String(pathname || '')
  if (PUBLIC.some(x => x.re.test(p))) return true
  const dbWrite = /^\/api\/db\/([a-z_]+)(\/\d+)?$/.exec(p)
  if (dbWrite && PUBLIC_WRITES.some(w => w.table === dbWrite[1] && w.method === m)) return true
  return false
}

// Décision de la garde : `null` = laisser passer, sinon le corps/statut du refus.
// `hasSession` est fourni par l'appelant (résultat de getUser()) pour rester testable.
export function apiGateDecision(method: string, pathname: string, hasSession: boolean) {
  if (!String(pathname || '').startsWith('/api/')) return null
  if (hasSession) return null
  if (isPublicApi(method, pathname)) return null
  return { status: 401 as const, error: 'Non authentifié' }
}
