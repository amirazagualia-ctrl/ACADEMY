// Utilitaires génériques (IP, cookies, échappement HTML, niveaux, limiteur mémoire, origine publique)
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.

export function slugOk(s: any): s is string { return typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,30}$/.test(s) }
export function parseCookie(c: any, name: string): string | null { const m = (c.req.header('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : null }

// IP du client (Cloudflare) pour rate-limiting / audit
export function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || (c.req.header('X-Forwarded-For') || '').split(',')[0].trim() || 'unknown'
}
// Libellé de l'année suivante : 2025-2026 -> 2026-2027
export function nextYearLabel(label: string) { const [a, b] = label.split('-').map(Number); return `${a + 1}-${b + 1}` }
// Niveau suivant (promotion) ; null = sortant (fin 4AS)
const LEVEL_ORDER = ['1AP', '2AP', '3AP', '4AP', '5AP', '6AP', '7AB', '8AB', '9AB', '1AS', '2AS', '3AS', '4AS']
export function nextLevel(l: string): string | null { const i = LEVEL_ORDER.indexOf(l); return i < 0 ? l : (i === LEVEL_ORDER.length - 1 ? null : LEVEL_ORDER[i + 1]) }
export function cycleOf(l: string) { return l.endsWith('AP') ? 'primaire' : l.endsWith('AB') ? 'base' : 'secondaire' }
export function escapeHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// ---------- Telegram (alternative SMS gratuite) ----------
export function normPhone(p: string) { return (p || '').replace(/[^0-9]/g, '').slice(-8) }

// ---------- Connexion Google (OAuth 2.0 / OpenID Connect) ----------
// Règles : compte existant (même email, vérifié par Google) -> connexion directe ;
// nouveau compte -> rôle parent uniquement (jamais admin/enseignant) ; comptes inactifs bloqués.
// Origine publique : derrière un proxy (Cloudflare, sandbox) le Worker peut voir http:// alors que le navigateur est en https://
export function publicOrigin(c: any): string {
  const u = new URL(c.req.url)
  const proto = c.req.header('X-Forwarded-Proto') || (u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? 'http' : 'https')
  return `${proto}://${u.host}`
}
// Limiteur simple en mémoire (par clé) : n essais par fenêtre
const _rlStore: Record<string, { n: number; reset: number }> = {}
export function rateLimit(key: string, max: number, windowMs: number) { const now = Date.now(); const e = _rlStore[key]; if (!e || e.reset < now) { _rlStore[key] = { n: 1, reset: now + windowMs }; return { ok: true } } e.n++; return { ok: e.n <= max } }

// ---------- Mensualités automatiques ----------
// Génère la mensualité du mois courant pour chaque élève actif qui ne l'a pas encore.
// Montant : students.monthly_fee sinon montant par défaut (settings.fees.monthly_amount, défaut 60 DT).
// Échéance : le 10 du mois. Anti-doublon via la colonne fees.period (YYYY-MM),
// avec repli sur le libellé si la migration 0005 n'est pas appliquée.
export const MONTH_LABELS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export function frDate(d: string | Date) { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }
