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

// ---------------------------------------------------------------------------
// Traduction d'un échec d'envoi en message lisible.
//
// Constat réel (24/11/2026) : Resend renvoie un JSON volumineux
//   {"message":"You can only send testing emails to your own email address (…).
//    To send emails to other recipients, please verify a domain at resend.com/domains…",
//    "name":"validation_error","statusCode":403}
// Ce texte était affiché BRUT dans la modale d'invitation, en anglais et au milieu
// de la phrase française. Un administrateur n'y comprend rien et ne sait pas quoi faire.
// On classe donc l'échec et on rend une phrase actionnelle en français.
// ---------------------------------------------------------------------------

export type SendFailureCode =
  | 'missing_api_key'
  | 'test_recipient_only'
  | 'unverified_domain'
  | 'invalid_from'
  | 'rate_limited'
  | 'quota'
  | 'network'
  | 'unknown'

export type SendFailure = { code: SendFailureCode; message: string; detail: string }

/** Extrait le message exploitable d'un corps d'erreur (JSON Resend ou texte brut). */
function bodySummary(raw: string): { name: string; message: string } {
  const s = String(raw || '')
  try {
    const j: any = JSON.parse(s)
    return { name: String(j?.name || ''), message: String(j?.message || '') }
  } catch {
    return { name: '', message: s }
  }
}

/**
 * Classe un échec d'envoi Resend et renvoie une phrase compréhensible.
 * Fonction PURE : aucune requête réseau, donc directement testable.
 */
export function explainSendFailure(status: number | null, raw: string): SendFailure {
  const detail = String(raw || '').slice(0, 800)
  const { name, message } = bodySummary(detail)
  const hay = `${name} ${message}`.toLowerCase()

  // Cas le plus fréquent en pratique : expéditeur de test, destinataire tiers.
  if (/testing emails|verify a domain|own email address/.test(hay)) {
    return {
      code: 'test_recipient_only',
      detail,
      message: "L'e-mail n'est pas parti : le domaine d'envoi n'est pas encore vérifié chez Resend, "
        + "qui n'autorise alors que l'adresse du compte. Transmettez le lien ci-dessous vous-même — "
        + "il fonctionne. Pour activer l'envoi automatique : vérifiez un domaine sur resend.com/domains, "
        + "puis définissez RESEND_FROM sur une adresse de ce domaine."
    }
  }
  // Domaine explicitement rejeté.
  if (/domain is not verified|not verified|unverified domain/.test(hay)) {
    return {
      code: 'unverified_domain',
      detail,
      message: "L'e-mail n'est pas parti : le domaine de l'expéditeur n'est pas vérifié chez Resend. "
        + "Transmettez le lien ci-dessous vous-même, et vérifiez le domaine sur resend.com/domains."
    }
  }
  // Adresse expéditrice malformée.
  if (/invalid.*(from|sender)|from.*(invalid|required)/.test(hay)) {
    return {
      code: 'invalid_from',
      detail,
      message: "L'e-mail n'est pas parti : l'adresse d'expédition (RESEND_FROM) est invalide. "
        + "Corrigez-la, ou transmettez le lien ci-dessous vous-même."
    }
  }
  if (status === 429 || /rate limit|too many requests/.test(hay)) {
    return {
      code: 'rate_limited',
      detail,
      message: "L'e-mail n'est pas parti : trop d'envois en peu de temps. Réessayez dans quelques minutes, "
        + "ou transmettez le lien ci-dessous vous-même."
    }
  }
  if (/quota|limit exceeded|exceeded your/.test(hay)) {
    return {
      code: 'quota',
      detail,
      message: "L'e-mail n'est pas parti : le quota d'envoi du compte e-mail est atteint. "
        + "Transmettez le lien ci-dessous vous-même."
    }
  }
  if (status === null || status === 0 || /network|fetch failed|timeout|econn/i.test(hay)) {
    return {
      code: 'network',
      detail,
      message: "L'e-mail n'est pas parti : le service d'e-mail est injoignable. "
        + "Le lien ci-dessous reste valable, transmettez-le vous-même."
    }
  }
  return {
    code: 'unknown',
    detail,
    message: "L'e-mail n'est pas parti. Le lien ci-dessous reste valable : transmettez-le vous-même "
      + "pour ne pas bloquer la personne invitée."
  }
}
