// F77 — Diagnostic de l'expéditeur e-mail (Resend).
//
// Constat mesuré le 24/11/2026 sur la clé du projet : `GET /domains` renvoie
// `{"data":[]}` — AUCUN domaine vérifié. Conséquence réelle : Resend accepte la
// clé mais refuse toute livraison vers une adresse tierce (403), donc les
// invitations F75 échouent silencieusement côté expéditeur et l'utilisateur doit
// copier le lien à la main.
//
// Ce module ne cherche pas à contourner Resend (c'est impossible : la
// vérification DNS est côté fournisseur). Il transforme un échec obscur en
// diagnostic actionnable, affiché dans Paramètres → Établissements → E-mail.
//
// Tout est PUR ici : aucune requête réseau. La route fournit `domains`.

export type ResendDomain = { name?: string; status?: string }

export type SenderLevel = 'missing' | 'test' | 'unverified' | 'unknown' | 'ok'

export type SenderVerdict = {
  level: SenderLevel
  ready: boolean
  /** Adresse expéditrice réellement utilisée par sendEmail(). */
  from: string
  /** Partie après @ de `from`, en minuscules. */
  domain: string
  verified_domains: string[]
  reason: string
  action: string
}

/** Domaine de test public de Resend : n'autorise l'envoi que vers l'adresse du compte. */
export const RESEND_TEST_DOMAIN = 'resend.dev'
export const RESEND_TEST_FROM = 'onboarding@resend.dev'

export function domainOf(addr: string): string {
  const s = String(addr || '').trim().toLowerCase()
  const at = s.lastIndexOf('@')
  return at < 0 ? '' : s.slice(at + 1)
}

/**
 * Décide de l'état de l'expéditeur.
 * @param opts.fromEnv  valeur de RESEND_FROM (peut être absente)
 * @param opts.domains  liste renvoyée par Resend, ou `null` si l'appel a échoué
 */
export function evaluateSender(opts: {
  apiKey?: string | null
  fromEnv?: string | null
  domains?: ResendDomain[] | null
}): SenderVerdict {
  const from = String(opts.fromEnv || '').trim() || RESEND_TEST_FROM
  const domain = domainOf(from)
  const verified = (opts.domains || [])
    .filter(d => String(d?.status || '').toLowerCase() === 'verified')
    .map(d => String(d?.name || '').toLowerCase())
    .filter(Boolean)
    .sort()

  const base = { from, domain, verified_domains: verified }

  if (!opts.apiKey) {
    return {
      ...base, level: 'missing', ready: false,
      reason: "Aucune clé Resend configurée (RESEND_API_KEY) : aucun e-mail ne peut partir.",
      action: 'Créez une clé sur resend.com/api-keys, puis : npx wrangler pages secret put RESEND_API_KEY'
    }
  }

  if (domain === RESEND_TEST_DOMAIN) {
    return {
      ...base, level: 'test', ready: false,
      reason: "Expéditeur de test de Resend : la livraison n'aboutit que vers l'adresse du compte Resend. Un enfant, un parent ou un enseignant ne recevra rien.",
      action: 'Vérifiez un domaine sur resend.com/domains (enregistrements SPF/DKIM), puis définissez RESEND_FROM sur une adresse de ce domaine.'
    }
  }

  if (opts.domains == null) {
    return {
      ...base, level: 'unknown', ready: false,
      reason: "Impossible d'interroger Resend pour vérifier le domaine : l'expéditeur n'a pas pu être confirmé.",
      action: 'Vérifiez que RESEND_API_KEY est valide et que la clé a le droit de lister les domaines.'
    }
  }

  if (!verified.includes(domain)) {
    return {
      ...base, level: 'unverified', ready: false,
      reason: `Le domaine « ${domain || '(absent)'} » n'est pas vérifié chez Resend : les envois vers des adresses tierces seront refusés.`,
      action: `Vérifiez « ${domain || 'le domaine'} » sur resend.com/domains, ou corrigez RESEND_FROM.`
    }
  }

  return {
    ...base, level: 'ok', ready: true,
    reason: `Expéditeur opérationnel : le domaine « ${domain} » est vérifié chez Resend.`,
    action: ''
  }
}

/** Fabrique le libellé de niveau affiché à l'administrateur. */
export function senderLevelLabel(level: SenderLevel): string {
  return ({
    missing: 'Non configuré',
    test: 'Mode test',
    unverified: 'Domaine non vérifié',
    unknown: 'Vérification impossible',
    ok: 'Opérationnel'
  } as Record<SenderLevel, string>)[level] || 'Inconnu'
}
