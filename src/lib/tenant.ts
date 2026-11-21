// Multi-établissement F63 : contexte tenant (AsyncLocalStorage), caches par tenant, chiffrement des secrets, résolution
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { AsyncLocalStorage } from 'node:async_hooks'
import { b64, unb64 } from './crypto'
import { parseCookie, slugOk } from './utils'
import type { Bindings } from '../types/bindings'

// ======================================================================
// F63 : MULTI-ÉTABLISSEMENTS — une base de données Supabase PAR établissement
// ----------------------------------------------------------------------
// • La base configurée par SUPABASE_URL / SUPABASE_SERVICE_KEY est la base MAÎTRE : c'est la base de
//   l'établissement par défaut (« rahma ») ET elle héberge l'annuaire `tenants` (migration 0019).
// • Chaque autre établissement apporte son propre projet Supabase (URL + clé service). La clé est
//   chiffrée AES-256-GCM avec TENANT_SECRET avant stockage ; déchiffrée en mémoire (cache 5 min).
// • Résolution à chaque requête : domaine personnalisé → en-tête X-Tenant → cookie `tenant` → /e/<slug> → défaut.
// • `cfg(env)` et donc `sb()` lisent le tenant courant (AsyncLocalStorage) : aucun autre appel à modifier.
// • Le JWT porte `tenant` : un jeton émis pour un établissement est refusé sur un autre.
// • Tous les caches « par base » (année, marque, soft-delete, migrations supportées…) sont isolés par slug.
// ======================================================================
export type TenantCfg = { slug: string; name: string; url: string; key: string; status: string; type?: string; logo_url?: string; id?: number; isDefault: boolean }
export const DEFAULT_TENANT = 'rahma'
export const tenantCtx = new AsyncLocalStorage<TenantCfg | null>()
export const currentTenant = (): TenantCfg | null => tenantCtx.getStore() || null
export const tenantSlug = () => currentTenant()?.slug || DEFAULT_TENANT
// Cache générique isolé par établissement : tcache(name) → objet mutable propre au tenant courant
const _tcaches: Record<string, Record<string, any>> = {}
function tcache<T extends object>(name: string, init: () => T): T {
  const slug = tenantSlug(); const bucket = (_tcaches[name] = _tcaches[name] || {})
  return (bucket[slug] = bucket[slug] || init()) as T
}
function tcacheReset(slug?: string) { for (const name of Object.keys(_tcaches)) { if (slug) delete _tcaches[name][slug]; else _tcaches[name] = {} } }
// Variables de cache isolées par établissement (anciennes variables globales `let _x`) : TC._x lit/écrit le tenant courant
const TC_DEFAULTS: Record<string, any> = { _yearSupported: null, _currentYearCache: null, _softDeleteSupported: null, _softDeleteCheckedAt: 0, _tsubjSupported: null, _brandCache: null, _adminChatsCache: null, _hwSupported: null, _docRegSupported: null, _wmLogoBytes: null, _wmLogoKey: '', _paySupported: null, _evaSupported: null, _bankSupported: null, _curSupported: null, _curMem: null, _certSupported: null, _sigSupported: null, _editionCache: null, _editionCatalog: null }
export const TC: Record<string, any> = new Proxy({}, { get: (_t, k: string) => { const st = tcache<Record<string, any>>('vars', () => ({ ...TC_DEFAULTS })); return st[k] }, set: (_t, k: string, v) => { const st = tcache<Record<string, any>>('vars', () => ({ ...TC_DEFAULTS })); st[k] = v; return true } })

// --- Chiffrement des clés (Web Crypto, AES-GCM 256, clé dérivée de TENANT_SECRET par SHA-256) ---
async function tenantAesKey(env: Bindings) {
  const secret = env.TENANT_SECRET || env.JWT_SECRET || ''
  if (secret.length < 16) throw new Error('TENANT_SECRET manquant ou trop court (16 caractères minimum)')
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rahma-tenant::' + secret))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function encryptSecret(env: Bindings, plain: string) {
  const key = await tenantAesKey(env); const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return `v1.${b64(iv)}.${b64(ct)}`
}
async function decryptSecret(env: Bindings, enc: string) {
  const [v, iv, ct] = enc.split('.'); if (v !== 'v1') throw new Error('Format de clé inconnu')
  const key = await tenantAesKey(env)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct))
  return new TextDecoder().decode(pt)
}

// --- Accès direct à la base MAÎTRE (annuaire) ---
export async function masterFetch(env: Bindings, path: string, options: RequestInit = {}) {
  const url = env.SUPABASE_URL!, key = env.SUPABASE_SERVICE_KEY!
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers as any || {}) }
  const res = await fetch(`${url}/rest/v1/${path}`, { ...options, headers })
  let data: any = null; try { data = await res.json() } catch {}
  return { ok: res.ok, status: res.status, data }
}
let _tenantsSupported: { ok: boolean; at: number } | null = null
export async function tenantsSupported(env: Bindings) {
  if (_tenantsSupported && Date.now() - _tenantsSupported.at < 300000) return _tenantsSupported.ok
  const r = await masterFetch(env, 'tenants?select=id&limit=1'); _tenantsSupported = { ok: r.ok, at: Date.now() }; return r.ok
}
const _tenantCache: Record<string, { at: number; cfg: TenantCfg | null }> = {}
export function defaultTenant(env: Bindings): TenantCfg { return { slug: DEFAULT_TENANT, name: 'Rahma Academy', url: env.SUPABASE_URL!, key: env.SUPABASE_SERVICE_KEY!, status: 'active', type: 'academie', isDefault: true } }
export async function loadTenant(env: Bindings, slugOrDomain: string, byDomain = false): Promise<TenantCfg | null> {
  const ck = (byDomain ? 'd:' : 's:') + slugOrDomain
  const hit = _tenantCache[ck]; if (hit && Date.now() - hit.at < 300000) return hit.cfg
  let cfgT: TenantCfg | null = null
  if (!byDomain && slugOrDomain === DEFAULT_TENANT) cfgT = defaultTenant(env)
  else if (await tenantsSupported(env)) {
    const q = byDomain ? `custom_domain=eq.${encodeURIComponent(slugOrDomain)}` : `slug=eq.${encodeURIComponent(slugOrDomain)}`
    const r = await masterFetch(env, `tenants?${q}&select=*&limit=1`)
    const t = r.data?.[0]
    if (t) { try { cfgT = { id: t.id, slug: t.slug, name: t.name, type: t.type, logo_url: t.logo_url, url: String(t.db_url).replace(/\/+$/, ''), key: await decryptSecret(env, t.db_key_enc), status: t.status, isDefault: false } } catch (e) { console.error('Tenant key decrypt failed', t.slug, e) } }
  }
  _tenantCache[ck] = { at: Date.now(), cfg: cfgT }
  return cfgT
}
export function tenantInvalidate(slug?: string) { for (const k of Object.keys(_tenantCache)) if (!slug || k.endsWith(':' + slug)) delete _tenantCache[k]; if (slug) tcacheReset(slug) }
// Détermine le slug demandé par la requête (sans charger la base)
function requestedTenantSlug(c: any): { slug: string | null; domain: string | null } {
  const host = (c.req.header('Host') || new URL(c.req.url).host).split(':')[0].toLowerCase()
  const h = c.req.header('X-Tenant'); if (slugOk(h)) return { slug: h, domain: null }
  const q = c.req.query?.('tenant'); if (slugOk(q)) return { slug: q, domain: null }
  const m = new URL(c.req.url).pathname.match(/^\/e\/([a-z0-9-]{2,31})(?:\/|$)/); if (m && slugOk(m[1])) return { slug: m[1], domain: null }
  const ck = parseCookie(c, 'tenant'); if (slugOk(ck)) return { slug: ck, domain: null }
  // domaine personnalisé / sous-domaine (ex. monecole.rahma.app → slug « monecole ») — ignoré en local
  if (!/^(localhost|127\.|0\.0\.0\.0|.*\.e2b\.dev|.*\.pages\.dev|.*\.gensparksite\.com)/.test(host)) return { slug: null, domain: host }
  return { slug: null, domain: null }
}
export async function resolveTenant(c: any): Promise<TenantCfg> {
  const env: Bindings = c.env
  const { slug, domain } = requestedTenantSlug(c)
  if (domain) { const t = await loadTenant(env, domain, true); if (t) return t }
  if (slug) { const t = await loadTenant(env, slug); if (t) return t }
  return defaultTenant(env)
}

// ---------- Helpers ----------
export function cfg(env: Bindings) {
  const t = currentTenant()
  return { url: t?.url || env.SUPABASE_URL!, key: t?.key || env.SUPABASE_SERVICE_KEY!, jwt: env.JWT_SECRET! }
}
