// L3 : autorisation serveur par défaut (deny-by-default) — logique PURE, testable sans base ni réseau.
//
// Principe : toute route `/api/*` exige une session, SAUF une liste blanche explicite.
// Aujourd'hui chaque route appelle déjà `getUser()` et renvoie 401 ; cette garde rend la règle
// GLOBALE : une future route qui oublierait son contrôle est fermée par défaut, pas ouverte.
//
// Ce module ne change AUCUNE autorisation métier (rôles, périmètre enseignant, appartenance) :
// il ne décide que « connecté ou non ».

// Routes accessibles sans session. La MÉTHODE est explicite : `GET /api/tenants` est public,
// mais `POST /api/tenants` (création d'établissement) ne l'est pas. Chaque entrée est justifiée.
const PUBLIC: Array<{ methods: string[]; re: RegExp; why: string }> = [
  { methods: ['GET'], re: /^\/api\/health$/, why: 'sonde de disponibilité (aucune donnée)' },
  { methods: ['POST'], re: /^\/api\/auth\/login$/, why: 'connexion' },
  { methods: ['POST'], re: /^\/api\/auth\/signup$/, why: 'inscription publique' },
  { methods: ['POST'], re: /^\/api\/auth\/refresh$/, why: 'renouvellement par cookie de rafraîchissement' },
  { methods: ['POST'], re: /^\/api\/auth\/logout$/, why: 'déconnexion (efface les cookies même sans session)' },
  { methods: ['GET'], re: /^\/api\/auth\/google(\/.*)?$/, why: 'OAuth Google (status + redirection + retour)' },
  { methods: ['GET'], re: /^\/api\/brand$/, why: 'identité publique de l’établissement (logo, couleurs, modules)' },
  { methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], re: /^\/api\/public\//, why: 'vérification de document, quittance par jeton, statistiques' },
  { methods: ['GET'], re: /^\/api\/tenants$/, why: 'annuaire public des établissements (nom, logo) — la CRÉATION reste protégée' },
  { methods: ['GET'], re: /^\/api\/tenants\/check\/[^/]+$/, why: 'disponibilité d’un identifiant à la création' },
  { methods: ['GET'], re: /^\/api\/tenants\/install\.sql$/, why: 'script d’installation téléchargeable' },
  { methods: ['GET'], re: /^\/api\/portal\/lookup$/, why: 'portail : à quels établissements cet e-mail est rattaché (aucune donnée métier, limité en débit)' },
  { methods: ['POST'], re: /^\/api\/portal\/request$/, why: 'portail : demande de création d’établissement (file d’attente, limité en débit)' },
  { methods: ['GET'], re: /^\/api\/tenants\/[a-z0-9][a-z0-9-]{1,30}$/, why: 'fiche publique d’un établissement (lecture seule)' },
  { methods: ['POST'], re: /^\/api\/telegram\/webhook$/, why: 'webhook Telegram (secret vérifié par Telegram)' },
  { methods: ['POST'], re: /^\/api\/payments\/webhook$/, why: 'webhook de paiement (signature vérifiée par le prestataire)' }
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
  // Préflight CORS : jamais d'authentification sur OPTIONS.
  if (m === 'OPTIONS' || m === 'HEAD') return true
  if (PUBLIC.some(x => x.methods.includes(m) && x.re.test(p))) return true
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
