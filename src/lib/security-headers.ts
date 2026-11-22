// L3 : en-têtes de sécurité — logique PURE, testable.
//
// ⚠️ État réel du code : ~874 gestionnaires `onclick`/`oninput` en ligne, 5 blocs <script> en ligne
// et Tailwind CDN (qui utilise `eval`). Un `script-src 'self'` strict casserait donc TOUTE
// l'interface. La présente politiques est volontairement permissive sur les scripts mais ferme
// les vecteurs qui ne dépendent pas de script-src :
//   • object-src 'none'        → neutralise <object>/<embed>/<applet>
//   • base-uri 'self'          → empêche le détournement de la balise <base>
//   • form-action 'self'       → empêche l'exfiltration d'un formulaire vers un domaine tiers
//   • frame-ancestors 'self'   → anti-clickjacking (doublé par X-Frame-Options)
//   • connect-src limité       → un script injecté ne peut pas envoyer les données n'importe où
// Retirer 'unsafe-inline'/'unsafe-eval' est un chantier séparé (migration des onclick), pas une
// case à cocher : le faire ici rendrait l'application inutilisable.

export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'", "'unsafe-inline'", "'unsafe-eval'",
    'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'media-src': ["'self'", 'data:', 'blob:', 'https:'],
  'connect-src': ["'self'", 'https://*.supabase.co'],
  'frame-src': ["'self'", 'https:', 'blob:'],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"]
} as const

export function buildCsp(directives: Record<string, readonly string[]> = CSP_DIRECTIVES): string {
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ')
}

// En-têtes communs. `secure` = la requête arrive en https (HSTS n'a aucun sens en http local).
export function securityHeaders(opts: { secure: boolean }): Record<string, string> {
  const h: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=()',
    // `same-origin-allow-popups` (et non `same-origin`) : l'application ouvre des fenêtres
    // d'impression via window.open + document.write ; `same-origin` couperait le lien opener.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Content-Security-Policy': buildCsp()
  }
  if (opts.secure) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  return h
}
