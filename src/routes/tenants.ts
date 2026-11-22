// Routes tenants
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { INSTALL_SQL } from '../install-sql'
import { audit, superAdmin } from '../lib/auth'
import { BRAND_DEFAULTS, BRAND_TYPES, LEVEL_PRESETS, TYPE_PRESET, getBrand } from '../lib/brand'
import { hashPassword } from '../lib/crypto'
import { healthNotify } from '../lib/notify'
import { getSettings, sb } from '../lib/supabase'
import { DEFAULT_TENANT, encryptSecret, loadTenant, masterFetch, tenantCtx, tenantInvalidate, tenantsSupported } from '../lib/tenant'
import type { TenantCfg } from '../lib/tenant'
import { clientIp, escapeHtml, rateLimit, slugOk } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ======================================================================
// F63 : API des établissements (annuaire sur la base MAÎTRE)
// ======================================================================
const TENANT_PUBLIC_COLS = 'id,slug,name,type,logo_url,country,status,is_public,created_at'
// Teste un projet Supabase fourni : connexion, tables requises, buckets
async function probeTenantDb(url: string, key: string): Promise<{ ok: boolean; reachable: boolean; missing: string[]; buckets_missing: string[]; error?: string }> {
  const base = String(url || '').trim().replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(base)) return { ok: false, reachable: false, missing: [], buckets_missing: [], error: 'URL Supabase invalide (attendu : https://xxxx.supabase.co)' }
  if (!key || key.length < 40) return { ok: false, reachable: false, missing: [], buckets_missing: [], error: 'Clé service_role manquante ou trop courte' }
  const h = { apikey: key, Authorization: `Bearer ${key}` }
  const required = ['settings', 'user_accounts', 'students', 'teachers', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'notifications', 'audit_log', 'school_years', 'homeworks', 'certificates', 'evaluations', 'exercise_bank', 'cur_levels', 'document_registry']
  const missing: string[] = []
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 9000)
    const r = await fetch(`${base}/rest/v1/`, { headers: h, signal: ctrl.signal }); clearTimeout(to)
    if (r.status === 401 || r.status === 403) return { ok: false, reachable: true, missing: [], buckets_missing: [], error: 'Clé refusée par Supabase (utilisez la clé service_role du projet, pas la clé anon)' }
    if (!r.ok) return { ok: false, reachable: false, missing: [], buckets_missing: [], error: `Supabase répond HTTP ${r.status}` }
    const spec: any = await r.json().catch(() => null)
    const defs = spec?.definitions || spec?.components?.schemas || {}
    const have = new Set(Object.keys(defs))
    for (const t of required) if (!have.has(t)) missing.push(t)
  } catch (e: any) {
    // Erreurs réseau de la plateforme (workerd/Cloudflare : « internal error; reference = … », DNS, TLS…) → message compréhensible
    const raw = String(e?.message || '')
    let msg = 'Connexion impossible : vérifiez l\u2019URL du projet'
    if (e?.name === 'AbortError') msg = 'Délai dépassé : le projet Supabase est peut-être en pause (plan gratuit) — ouvrez-le dans supabase.com puis réessayez'
    else if (/internal error|DNS|ENOTFOUND|getaddrinfo|lookup/i.test(raw)) msg = 'Hôte introuvable : cette URL ne correspond à aucun projet Supabase (vérifiez Project Settings → API → Project URL)'
    else if (/certificate|TLS|SSL/i.test(raw)) msg = 'Connexion sécurisée refusée par l\u2019hôte'
    return { ok: false, reachable: false, missing: [], buckets_missing: [], error: msg }
  }
  const buckets_missing: string[] = []
  try { const r = await fetch(`${base}/storage/v1/bucket`, { headers: h }); const list: any[] = r.ok ? ((await r.json()) as any[]) : []; const names = new Set(list.map(b => b.name)); for (const b of ['photos', 'courses', 'homeworks']) if (!names.has(b)) buckets_missing.push(b) } catch {}
  return { ok: missing.length === 0, reachable: true, missing, buckets_missing }
}
// Liste publique (sélecteur d'accueil) : établissement par défaut + établissements actifs et publics
app.get('/api/tenants', async (c) => {
  const env = c.env; const b = await getBrand(env)
  const items: any[] = [{ slug: DEFAULT_TENANT, name: b.name, type: b.type, logo_url: b.logo_url, is_default: true }]
  if (await tenantsSupported(env)) {
    const r = await masterFetch(env, `tenants?status=eq.active&is_public=eq.true&select=${TENANT_PUBLIC_COLS}&order=name.asc&limit=200`)
    for (const t of (r.data || [])) items.push({ slug: t.slug, name: t.name, type: t.type, logo_url: t.logo_url, is_default: false })
  }
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ items, registry: await tenantsSupported(env), types: BRAND_TYPES, presets: Object.fromEntries(Object.entries(LEVEL_PRESETS).map(([k, v]) => [k, v.label])), type_preset: TYPE_PRESET })
})
// SQL d'installation d'une base établissement (schema + migrations + buckets)
app.get('/api/tenants/install.sql', (c) => { c.header('Content-Type', 'application/sql; charset=utf-8'); c.header('Content-Disposition', 'attachment; filename="rahma-platform-install.sql"'); return c.body(INSTALL_SQL) })
// Disponibilité d'un slug
app.get('/api/tenants/check/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase(); if (!slugOk(slug)) return c.json({ available: false, reason: 'Format : 2 à 31 caractères, lettres minuscules, chiffres, tirets' })
  if (slug === DEFAULT_TENANT || ['api', 'static', 'admin', 'www', 'e', 'app', 'aide', 'verifier', 'quittance', 'paiement', 'inscription', 'check', 'install', 'test-db'].includes(slug)) return c.json({ available: false, reason: 'Identifiant réservé' })
  if (!(await tenantsSupported(c.env))) return c.json({ available: false, reason: 'Registre des établissements non installé (migration 0019 sur la base maître)' })
  const r = await masterFetch(c.env, `tenants?slug=eq.${slug}&select=id`)
  return c.json({ available: !(r.data || []).length })
})
// --- Super-administration (admin de l'établissement par défaut) ---
app.get('/api/tenants/admin/list', async (c) => {
  if (!(await superAdmin(c))) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await tenantsSupported(c.env))) return c.json({ supported: false, items: [] })
  const r = await masterFetch(c.env, `tenants?select=${TENANT_PUBLIC_COLS},db_url,db_key_hint,custom_domain,admin_email,admin_name,notes,validated_at,last_seen_at&order=created_at.desc`)
  return c.json({ supported: true, items: r.data || [] })
})
app.patch('/api/tenants/admin/:id', async (c) => {
  const su = await superAdmin(c); if (!su) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id')); const b = await c.req.json().catch(() => ({}))
  const patch: any = {}
  if (['active', 'pending', 'suspended'].includes(b.status)) { patch.status = b.status; if (b.status === 'active') patch.validated_at = new Date().toISOString() }
  if (typeof b.is_public === 'boolean') patch.is_public = b.is_public
  if (b.notes !== undefined) patch.notes = String(b.notes).slice(0, 1000)
  if (b.custom_domain !== undefined) patch.custom_domain = String(b.custom_domain || '').toLowerCase().trim() || null
  if (b.name) patch.name = String(b.name).slice(0, 120)
  if (b.db_url) {
    patch.db_url = String(b.db_url).trim().replace(/\/+$/, '')
    // Garde-fou : une base Supabase ne peut servir qu'un seul établissement (sinon fuite de données entre écoles)
    const other = await dbUrlOwner(c.env, patch.db_url, id)
    if (other) return c.json({ error: `Cette base Supabase est déjà utilisée par l'établissement « ${other.name} » (${other.slug}). Créez un projet Supabase distinct.` }, 409)
  }
  if (b.db_key) { const probe = await probeTenantDb(b.db_url, b.db_key); if (!probe.reachable || probe.error) return c.json({ error: probe.error || 'Nouvelle clé refusée' }, 400); patch.db_key_enc = await encryptSecret(c.env, String(b.db_key)); patch.db_key_hint = String(b.db_key).slice(-6) }
  const cur = await masterFetch(c.env, `tenants?id=eq.${id}&select=slug`); const slug = cur.data?.[0]?.slug; if (!slug) return c.json({ error: 'Introuvable' }, 404)
  const r = await masterFetch(c.env, `tenants?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  tenantInvalidate(slug)
  await audit(c.env, c, su, 'tenant_update', 'tenants', id, null, { ...patch, db_key_enc: patch.db_key_enc ? '***' : undefined })
  return c.json({ ok: r.ok, item: r.data?.[0] })
})
app.delete('/api/tenants/admin/:id', async (c) => {
  const su = await superAdmin(c); if (!su) return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id'))
  const cur = await masterFetch(c.env, `tenants?id=eq.${id}&select=slug,name`); const t = cur.data?.[0]; if (!t) return c.json({ error: 'Introuvable' }, 404)
  const r = await masterFetch(c.env, `tenants?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  tenantInvalidate(t.slug)
  await audit(c.env, c, su, 'tenant_delete', 'tenants', id, t, null)
  return c.json({ ok: r.ok, note: 'Seule la fiche du registre est supprimée ; la base Supabase de l\u2019établissement reste intacte.' })
})
// Diagnostic d'un établissement enregistré (connexion à sa base)
app.post('/api/tenants/admin/:id/probe', async (c) => {
  if (!(await superAdmin(c))) return c.json({ error: 'Accès refusé' }, 403)
  const cur = await masterFetch(c.env, `tenants?id=eq.${Number(c.req.param('id'))}&select=slug`); const slug = cur.data?.[0]?.slug; if (!slug) return c.json({ error: 'Introuvable' }, 404)
  tenantInvalidate(slug); const t = await loadTenant(c.env, slug); if (!t) return c.json({ error: 'Déchiffrement impossible (TENANT_SECRET a changé ?)' }, 500)
  const probe = await probeTenantDb(t.url, t.key)
  if (probe.reachable) masterFetch(c.env, `tenants?slug=eq.${slug}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_seen_at: new Date().toISOString() }) }).catch(() => {})
  return c.json(probe)
})
// Fiche publique d'un établissement (existence / statut) — pour le sélecteur et /e/<slug>
app.get('/api/tenants/:slug', async (c) => {
  const slug = c.req.param('slug'); if (!slugOk(slug)) return c.json({ error: 'Identifiant invalide' }, 400)
  const t = await loadTenant(c.env, slug); if (!t) return c.json({ error: 'Établissement introuvable' }, 404)
  return c.json({ slug: t.slug, name: t.name, type: t.type, logo_url: t.logo_url, status: t.status, is_default: t.isDefault })
})
// Un même projet Supabase ne peut être rattaché qu'à un seul établissement : renvoie le propriétaire actuel (hors `exceptId`)
async function dbUrlOwner(env: Bindings, dbUrl: string, exceptId?: number): Promise<{ slug: string; name: string } | null> {
  if (!dbUrl) return null
  const host = dbUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
  if (!host) return null
  // La base maître (Rahma) est elle aussi réservée
  const masterHost = String(env.SUPABASE_URL || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
  if (masterHost && host === masterHost) return { slug: DEFAULT_TENANT, name: BRAND_DEFAULTS.name }
  const r = await masterFetch(env, `tenants?db_url=ilike.*${encodeURIComponent(host)}*&select=id,slug,name`)
  const hit = (r.data || []).find((t: any) => t.id !== exceptId && String(t.db_url || '').toLowerCase().includes(host))
  return hit ? { slug: hit.slug, name: hit.name } : ((r.data || []).find((t: any) => t.id !== exceptId) || null)
}
// Test de connexion à une base fournie (sans rien enregistrer)
// SÉCURITÉ : réservé au super-admin (plateforme) — sinon n'importe qui pourrait sonder des bases arbitraires.
app.post('/api/tenants/test-db', async (c) => {
  if (!(await superAdmin(c))) return c.json({ error: 'Accès refusé : réservé à l’administration de la plateforme' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const r = await probeTenantDb(b.db_url, b.db_key)
  return c.json(r, r.reachable ? 200 : 400)
})
// Création d'un établissement (fonction de PLATEFORME → super-admin uniquement).
// L'établissement créé obtient sa propre application PWA et toutes les fonctions métier,
// mais jamais les écrans de super-administration.
app.post('/api/tenants', async (c) => {
  const env = c.env
  if (!(await superAdmin(c))) return c.json({ error: 'Accès refusé : la création d’un établissement est réservée à l’administration de la plateforme' }, 403)
  if (!(await tenantsSupported(env))) return c.json({ error: 'Registre des établissements non installé : appliquez migrations/0019_tenants.sql sur la base maître.' }, 503)
  const ip = clientIp(c); if (!rateLimit(`tenant-create:${ip}`, 5, 3600_000).ok) return c.json({ error: 'Trop de tentatives, réessayez plus tard' }, 429)
  const b = await c.req.json().catch(() => ({}))
  const slug = String(b.slug || '').toLowerCase().trim()
  const name = String(b.name || '').trim().slice(0, 120)
  const type = BRAND_TYPES[b.type] ? b.type : 'ecole'
  const adminName = String(b.admin_name || '').trim().slice(0, 80), adminEmail = String(b.admin_email || '').trim().toLowerCase(), adminPass = String(b.admin_password || '')
  if (!name) return c.json({ error: "Le nom de l'établissement est obligatoire" }, 400)
  if (!slugOk(slug) || slug === DEFAULT_TENANT) return c.json({ error: 'Identifiant (slug) invalide ou réservé' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) return c.json({ error: 'E-mail administrateur invalide' }, 400)
  if (adminPass.length < 8) return c.json({ error: 'Mot de passe administrateur : 8 caractères minimum' }, 400)
  const dup = await masterFetch(env, `tenants?slug=eq.${slug}&select=id`); if ((dup.data || []).length) return c.json({ error: 'Cet identifiant est déjà utilisé' }, 409)
  const dbUrl = String(b.db_url || '').trim().replace(/\/+$/, '')
  // Garde-fou : une base Supabase = un seul établissement
  const owner = await dbUrlOwner(env, dbUrl)
  if (owner) return c.json({ error: `Cette base Supabase est déjà utilisée par l'établissement « ${owner.name} » (${owner.slug}). Chaque établissement doit avoir son propre projet Supabase.` }, 409)
  const probe = await probeTenantDb(dbUrl, b.db_key)
  if (!probe.ok) return c.json({ error: probe.error || `Base incomplète : tables manquantes ${probe.missing.join(', ')}. Exécutez le script d'installation puis réessayez.`, probe }, 400)
  // 1) Compte administrateur + identité dans la base de l'établissement
  const tcfg: TenantCfg = { slug, name, type, url: dbUrl, key: String(b.db_key), status: 'pending', isDefault: false }
  const created: any = await tenantCtx.run(tcfg, async () => {
    const existing = await sb(env, `user_accounts?email=eq.${encodeURIComponent(adminEmail)}&select=id,role`)
    let adminId: number | null = null
    if (existing.data?.[0]) {
      if (existing.data[0].role !== 'admin') return { error: 'Un compte non administrateur existe déjà avec cet e-mail dans cette base' }
      adminId = existing.data[0].id
    } else {
      const r = await sb(env, 'user_accounts', { method: 'POST', body: JSON.stringify({ name: adminName || 'Administrateur', email: adminEmail, password_hash: await hashPassword(adminPass), role: 'admin', status: 'active' }) })
      if (!r.ok) return { error: 'Impossible de créer le compte administrateur dans la base fournie', detail: r.data }
      adminId = r.data[0].id
    }
    // Hardening : si la base a été installée avec un ancien script contenant le compte générique admin@rahma-ecole.tn / admin123, on le désactive
    try { if (adminEmail !== 'admin@rahma-ecole.tn') await sb(env, 'user_accounts?email=eq.admin%40rahma-ecole.tn&role=eq.admin', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'inactive' }) }) } catch {}
    const brand: any = { name, type, short_name: name, country: String(b.country || 'TN').toUpperCase().slice(0, 2), currency: String(b.currency || 'DT').slice(0, 8), email: adminEmail }
    if (b.tagline) brand.tagline = String(b.tagline).slice(0, 120)
    if (b.logo_url) brand.logo_url = String(b.logo_url).slice(0, 500)
    if (b.phone) brand.phone = String(b.phone).slice(0, 40)
    if (b.address) brand.address = String(b.address).slice(0, 200)
    if (b.levels_preset && LEVEL_PRESETS[b.levels_preset]) brand.levels = { preset: b.levels_preset }
    const prev = await getSettings(env, 'school')
    await sb(env, 'settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify({ key: 'school', value: { ...prev, ...brand } }) })
    try { const ys = await sb(env, 'school_years?select=id&limit=1'); if (ys.ok && !(ys.data || []).length) { const y = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1; await sb(env, 'school_years', { method: 'POST', body: JSON.stringify({ label: `${y}-${y + 1}`, start_date: `${y}-09-01`, end_date: `${y + 1}-06-30`, is_current: true }) }) } } catch {}
    return { adminId }
  })
  if (created.error) return c.json(created, 400)
  // 2) Enregistrement dans l'annuaire (clé chiffrée)
  let enc: string; try { enc = await encryptSecret(env, String(b.db_key)) } catch (e: any) { return c.json({ error: e?.message || 'Chiffrement impossible (TENANT_SECRET)' }, 500) }
  const autoActivate = String(env.APP_ENV || '').toLowerCase() === 'development'
  const row = { slug, name, type, logo_url: b.logo_url || null, country: String(b.country || 'TN').toUpperCase().slice(0, 2), status: autoActivate ? 'active' : 'pending', is_public: b.is_public !== false, db_url: dbUrl, db_key_enc: enc, db_key_hint: String(b.db_key).slice(-6), admin_email: adminEmail, admin_name: adminName || null, validated_at: autoActivate ? new Date().toISOString() : null }
  const ins = await masterFetch(env, 'tenants', { method: 'POST', body: JSON.stringify(row) })
  if (!ins.ok) return c.json({ error: 'Enregistrement dans le registre impossible', detail: ins.data }, 500)
  tenantInvalidate(slug)
  try { await healthNotify(env, `🏫 <b>Nouvel établissement</b> : ${escapeHtml(name)} (<code>${slug}</code>, ${BRAND_TYPES[type]})\nAdmin : ${escapeHtml(adminEmail)}\nStatut : ${row.status}${row.status === 'pending' ? ' — à valider dans Paramètres → Établissements' : ''}`) } catch {}
  // 3) L2 : plus AUCUN jeton renvoyé (les sessions vivent en cookies HttpOnly, par établissement).
  //    L'administrateur de la plateforme ouvre l'espace et se connecte avec le compte qu'il vient de créer :
  //    ouvrir une session ici écraserait la sienne (cookies partagés par le navigateur).
  return c.json({ ok: true, tenant: { slug, name, type, status: row.status }, login_url: `/e/${slug}`, admin_email: adminEmail, pending: row.status === 'pending' })
})

export default app
