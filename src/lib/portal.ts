// F74 : Portail d'entrée multi-établissements — logique pure + accès à l'annuaire de routage.
//
// Invariants (à ne jamais casser) :
//   1. L'annuaire `tenant_directory` est un CACHE de routage, JAMAIS une autorité d'authentification.
//      S'il est absent, vide ou périmé, personne n'est bloqué : /e/<slug> et la connexion directe
//      restent la voie de secours. Un échec d'écriture d'annuaire n'échoue jamais une connexion.
//   2. Le portail ne vérifie JAMAIS un mot de passe. Il ne fait que répondre « à quel(s)
//      établissement(s) cet e-mail est rattaché » pour afficher les bonnes portes.
//   3. Aucun secret ne transite par le portail (ni clé Supabase, ni mot de passe d'établissement).
//   4. Une demande d'établissement n'est jamais transformée automatiquement en établissement :
//      un humain l'accepte (voir POST /api/tenants/admin/requests/:id/approve).
import { DEFAULT_TENANT, defaultTenant, loadTenant, masterFetch, tenantCtx, tenantSlug, tenantsSupported } from './tenant'
import type { TenantCfg } from './tenant'
import { sb } from './supabase'
import { getBrand } from './brand'
import type { Bindings } from '../types/bindings'

export type DirectoryRow = { email: string; tenant: string; role: string | null; user_id: number | null }
export type PortalEstablishment = { slug: string; name: string; type: string | null; logo_url: string | null; role: string | null; status: string }

/** Normalise un e-mail pour l'annuaire (minuscules, sans espaces). Retourne '' si invalide. */
export function normEmail(raw: any): string {
  const e = String(raw || '').trim().toLowerCase().slice(0, 190)
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : ''
}

// --- Support de l'annuaire (migration 0022 appliquée ou non) -----------------
let _dirSupported: { ok: boolean; at: number } | null = null
export async function directorySupported(env: Bindings, force = false): Promise<boolean> {
  if (!force && _dirSupported && Date.now() - _dirSupported.at < 300000) return _dirSupported.ok
  let ok = false
  try { const r = await masterFetch(env, 'tenant_directory?select=email&limit=1'); ok = r.ok } catch { ok = false }
  _dirSupported = { ok, at: Date.now() }
  return ok
}

/**
 * Enregistre (ou rafraîchit) le rattachement e-mail → établissement.
 * Appelé à chaque connexion RÉUSSIE. Best effort : ne lève jamais et n'échoue jamais la connexion.
 * Sans cette écriture, l'annuaire reste vide — c'est dégradé, pas cassé : /e/<slug> fonctionne toujours.
 */
export async function recordDirectoryEntry(env: Bindings, email: any, opts: { tenant?: string; role?: any; userId?: any } = {}) {
  const mail = normEmail(email)
  if (!mail) return false
  if (!(await directorySupported(env))) return false
  const tenant = String(opts.tenant || tenantSlug() || '').toLowerCase().slice(0, 40)
  if (!tenant) return false
  const row: any = { email: mail, tenant, role: opts.role ? String(opts.role).slice(0, 20) : null, updated_at: new Date().toISOString() }
  if (opts.userId != null) row.user_id = Number(opts.userId) || null
  try {
    const r = await masterFetch(env, 'tenant_directory?on_conflict=email,tenant', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(row)
    })
    return r.ok
  } catch { return false }
}

/**
 * REPLI (sonde directe) : cet e-mail existe-t-il dans la base de l'établissement par DÉFAUT ?
 * L'annuaire n'est qu'un cache : tant qu'il est vide (migration récente, compte qui ne s'est pas
 * reconnecté depuis), le portail doit quand même savoir où envoyer la personne. Coût : UNE requête
 * sur la base déjà configurée — jamais de balayage de tous les établissements.
 */
export async function probeDefaultTenant(env: Bindings, email: any): Promise<{ slug: string; role: string | null; userId: number | null } | null> {
  const mail = normEmail(email)
  if (!mail) return null
  try {
    const r = await tenantCtx.run(defaultTenant(env), async () => sb(env, `user_accounts?email=ilike.${encodeURIComponent(mail)}&select=id,role&limit=1`))
    const u = (r.data || [])[0]
    if (!u) return null
    return { slug: DEFAULT_TENANT, role: u.role || null, userId: u.id ?? null }
  } catch { return null }
}

/**
 * (Re)construit l'annuaire depuis les comptes RÉELS de chaque établissement actif.
 * Nécessaire une fois après l'installation : sans cela, la porte 1 ne connaît que les personnes
 * qui se sont connectées depuis la migration. Idempotent (upsert), ne touche à aucune donnée métier.
 */
export async function rebuildDirectory(env: Bindings): Promise<{ tenants: number; indexed: number; failed: string[] }> {
  if (!(await directorySupported(env, true))) throw new Error("Annuaire non installé : appliquez migrations/0022_tenant_directory.sql sur la base maître.")
  const targets: TenantCfg[] = [defaultTenant(env)]
  if (await tenantsSupported(env)) {
    const r = await masterFetch(env, 'tenants?status=eq.active&select=slug&limit=200')
    for (const t of (r.data || [])) {
      if (!t?.slug || t.slug === DEFAULT_TENANT) continue
      const tcfg = await loadTenant(env, t.slug)
      if (tcfg) targets.push(tcfg)
    }
  }
  let indexed = 0
  const failed: string[] = []
  for (const tcfg of targets) {
    try {
      const r = await tenantCtx.run(tcfg, async () => sb(env, 'user_accounts?select=id,email,role&status=eq.active&limit=5000'))
      if (!r.ok) { failed.push(tcfg.slug); continue }
      const now = new Date().toISOString()
      const rows = ((r.data || []) as any[])
        .map(u => ({ email: normEmail(u.email), tenant: tcfg.slug, role: u.role || null, user_id: u.id ?? null, updated_at: now }))
        .filter(x => !!x.email)
      if (!rows.length) continue
      const ins = await masterFetch(env, 'tenant_directory?on_conflict=email,tenant', {
        method: 'POST',
        headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(rows)
      })
      if (ins.ok) indexed += rows.length
      else failed.push(tcfg.slug)
    } catch { failed.push(tcfg.slug) }
  }
  return { tenants: targets.length, indexed, failed }
}

/**
 * Cherche les établissements rattachés à un e-mail.
 * Retourne TOUJOURS un résultat exploitable : `known:false` ⇒ l'interface propose la voie de secours.
 * Seuls les établissements ACTIFS (ou l'établissement par défaut) sont des cibles de connexion.
 */
export async function lookupDirectory(env: Bindings, email: any): Promise<{ known: boolean; email: string; items: PortalEstablishment[]; degraded: boolean }> {
  const mail = normEmail(email)
  if (!mail) return { known: false, email: '', items: [], degraded: false }
  if (!(await directorySupported(env))) return { known: false, email: mail, items: [], degraded: true }
  let rows: DirectoryRow[] = []
  try {
    const r = await masterFetch(env, `tenant_directory?email=eq.${encodeURIComponent(mail)}&select=email,tenant,role,user_id&limit=50`)
    if (!r.ok) return { known: false, email: mail, items: [], degraded: true }
    rows = (r.data || []) as DirectoryRow[]
  } catch { return { known: false, email: mail, items: [], degraded: true } }
  // Annuaire muet : ce n'est PAS une réponse « inconnu ». On sonde l'établissement par défaut —
  // c'est exactement le cas d'une base installée avant la migration, ou d'un compte qui ne s'est
  // pas encore reconnecté. Sans ce repli, la porte 1 renverrait tout le monde vers « créer un
  // établissement » alors que les comptes existent.
  if (!rows.length) {
    const hit = await probeDefaultTenant(env, mail)
    if (!hit) return { known: false, email: mail, items: [], degraded: false }
    rows = [{ email: mail, tenant: hit.slug, role: hit.role, user_id: hit.userId }]
    // On répare l'annuaire au passage (best effort, jamais bloquant).
    recordDirectoryEntry(env, mail, { tenant: hit.slug, role: hit.role, userId: hit.userId }).catch(() => {})
  }
  // Statut lisible depuis le registre (une base peut être suspendue ou en attente)
  const statusBySlug: Record<string, { name: string; type: string | null; logo_url: string | null; status: string }> = {}
  try {
    const q = rows.map(r => r.tenant).filter(Boolean).map(t => `slug.eq.${t}`).join(',')
    const reg = await masterFetch(env, `tenants?or=(${q})&select=slug,name,type,logo_url,status&limit=50`)
    for (const t of (reg.data || [])) statusBySlug[t.slug] = { name: t.name, type: t.type, logo_url: t.logo_url, status: t.status }
  } catch { /* registre indisponible : on affiche au minimum le slug */ }
  // L'établissement par défaut n'est PAS dans le registre `tenants` (c'est la base maître elle-même) :
  // son nom, son type et son logo vivent dans les paramètres `school`. Sans ça, l'interface
  // afficherait le slug brut « rahma » et aucune image.
  if (rows.some(r => r.tenant === DEFAULT_TENANT) && !statusBySlug[DEFAULT_TENANT]) {
    try {
      const b = await getBrand(env)
      statusBySlug[DEFAULT_TENANT] = { name: b.name || DEFAULT_TENANT, type: b.type || null, logo_url: b.logo_url || null, status: 'active' }
    } catch { /* marque indisponible : on garde le slug */ }
  }
  const items: PortalEstablishment[] = rows.map(r => {
    const reg = statusBySlug[r.tenant]
    return {
      slug: r.tenant,
      name: reg?.name || r.tenant,
      type: reg?.type || null,
      logo_url: reg?.logo_url || null,
      role: r.role || null,
      status: reg?.status || 'active'
    }
  })
  // Les établissements utilisables d'abord (actif), puis par nom
  items.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.name.localeCompare(b.name))
  return { known: true, email: mail, items, degraded: false }
}

// --- File des demandes d'établissement --------------------------------------
export type RequestInput = {
  name?: any; type?: any; city?: any; director_name?: any; director_email?: any
  phone?: any; expected_students?: any; message?: any
}

export type ValidatedRequest = {
  name: string; type: string; city: string | null; director_name: string; director_email: string
  phone: string | null; expected_students: number | null; message: string | null
}

/** Valide une demande. Retourne `{ error }` (message prêt à afficher) ou `{ value }`. */
export function validateRequest(b: RequestInput): { error: string } | { value: ValidatedRequest } {
  const name = String(b.name || '').trim().slice(0, 120)
  if (name.length < 2) return { error: "Indiquez le nom de votre établissement (2 caractères minimum)." }
  const director_name = String(b.director_name || '').trim().slice(0, 80)
  if (director_name.length < 2) return { error: 'Indiquez le nom du directeur ou de la directrice.' }
  const director_email = normEmail(b.director_email)
  if (!director_email) return { error: 'Adresse e-mail invalide.' }
  const type = String(b.type || 'ecole').trim().toLowerCase()
  const city = String(b.city || '').trim().slice(0, 80) || null
  const phone = String(b.phone || '').replace(/[^0-9+ ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || null
  const msgRaw = String(b.message || '').trim()
  if (msgRaw.length > 1500) return { error: 'Le message est trop long (1500 caractères maximum).' }
  const message = msgRaw || null
  let expected_students: number | null = null
  if (b.expected_students != null && String(b.expected_students).trim() !== '') {
    const n = Number(b.expected_students)
    if (!Number.isFinite(n) || n < 1 || n > 20000) return { error: "Nombre d'élèves attendu invalide." }
    expected_students = Math.round(n)
  }
  return { value: { name, type, city, director_name, director_email, phone, expected_students, message } }
}
