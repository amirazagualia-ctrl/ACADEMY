// Accès PostgREST Supabase (sb), année scolaire active, corbeille, paramètres
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { AsyncLocalStorage } from 'node:async_hooks'
import { healthReport } from './notify'
import { TC, cfg } from './tenant'
import type { Bindings } from '../types/bindings'

export const yearCtx = new AsyncLocalStorage<string | null>()
export const activeYear = () => yearCtx.getStore() || null

export async function sb(env: Bindings, path: string, options: RequestInit = {}) {
  const { url, key } = cfg(env)
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(options.headers as Record<string, string> || {})
  }
  // Soft-delete global : toute LECTURE d'une table concernée exclut les lignes supprimées,
  // sauf si la requête mentionne déjà deleted_at (corbeille, purge) ou si la migration n'est pas appliquée.
  const method = (options.method || 'GET').toUpperCase()
  const tbl = path.split('?')[0]
  if (method === 'GET' && TC._softDeleteSupported === true && SOFT_DELETE_TABLES.includes(tbl) && !path.includes('deleted_at')) {
    path += (path.includes('?') ? '&' : '?') + 'deleted_at=is.null'
  }
  // Année scolaire globale : les requêtes internes (stats, bulletins, mensualités, relances) portent sur l'année
  // active (contexte par requête) ; les lectures par id précis ne sont pas filtrées ; les insertions sont tamponnées avec l'année courante.
  const ay = activeYear()
  if (ay && YEAR_TABLES.includes(tbl) && !path.includes('school_year')) {
    if (method === 'GET' && !/[?&]id=eq\./.test(path)) path += (path.includes('?') ? '&' : '?') + `school_year=eq.${ay}`
    else if (method === 'POST' && options.body && typeof options.body === 'string' && TC._currentYearCache?.label) {
      try { const b = JSON.parse(options.body); const stamp = (o: any) => { if (o && typeof o === 'object' && !o.school_year) o.school_year = TC._currentYearCache!.label }; if (Array.isArray(b)) b.forEach(stamp); else stamp(b); options = { ...options, body: JSON.stringify(b) } } catch {}
    }
  }
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...options, headers })
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (res.status >= 500 || res.status === 540 || res.status === 402) healthReport(env, false, `HTTP ${res.status} sur ${tbl}`)
    else healthReport(env, true)
    return { ok: res.ok, status: res.status, data }
  } catch (e: any) {
    healthReport(env, false, e?.message || 'fetch failed')
    return { ok: false, status: 503, data: { error: 'Base de données Supabase inaccessible. Le projet Supabase est probablement en pause — restaurez-le sur supabase.com/dashboard puis exécutez schema.sql.', detail: e.message } }
  }
}

// ---------- Année scolaire ----------
// Tables portées par une année scolaire ; les lectures sont filtrées sur l'année sélectionnée (header X-School-Year)
// ou l'année courante ; les écritures reçoivent automatiquement l'année courante.
export const YEAR_TABLES = ['grades', 'attendance', 'fees', 'events', 'registrations', 'homeworks', 'bulletin_signatures', 'evaluations']
// (per-tenant) let _yearSupported: { ok: boolean; at: number } | null = null
// (per-tenant) let _currentYearCache: { label: string; at: number } | null = null
export async function yearSupported(env: Bindings): Promise<boolean> {
  // Cache 5 min : la migration 0009 est prise en compte sans redéploiement
  if (TC._yearSupported && (Date.now() - TC._yearSupported.at < 300000 || TC._yearSupported.ok)) return TC._yearSupported.ok
  const probe = await sb(env, 'school_years?select=id&limit=1')
  TC._yearSupported = { ok: probe.ok, at: Date.now() }
  return probe.ok
}
export async function currentYear(env: Bindings): Promise<string | null> {
  if (!(await yearSupported(env))) return null
  if (TC._currentYearCache && Date.now() - TC._currentYearCache.at < 60000) return TC._currentYearCache.label
  const r = await sb(env, 'school_years?is_current=eq.true&select=label&limit=1')
  const label = r.data?.[0]?.label || null
  if (label) TC._currentYearCache = { label, at: Date.now() }
  return label
}
// Année demandée par le client (consultation d'une année passée) ; format strict AAAA-AAAA
export function requestedYear(c: any): string | null {
  const y = c.req.header('X-School-Year') || c.req.query('school_year') || ''
  return /^\d{4}-\d{4}$/.test(y) ? y : null
}

// ---------- Soft-delete : tables concernées + filtre de lecture ----------
export const SOFT_DELETE_TABLES = ['students', 'teachers', 'grades', 'fees', 'courses', 'interactive_courses', 'events', 'classes', 'homeworks', 'certificates', 'evaluations', 'exercise_bank']
export const TRASH_RETENTION_DAYS = 30
// (per-tenant) let _softDeleteSupported: boolean | null = null
// (per-tenant) let _softDeleteCheckedAt = 0
export async function softDeleteSupported(env: Bindings): Promise<boolean> {
  if (TC._softDeleteSupported === true || (TC._softDeleteSupported === false && Date.now() - TC._softDeleteCheckedAt < 300000)) return TC._softDeleteSupported
  const probe = await sb(env, 'students?select=deleted_at&limit=1')
  TC._softDeleteSupported = probe.ok; TC._softDeleteCheckedAt = Date.now()
  return probe.ok
}

// ---------- Notifications (email / SMS) ----------
export async function getSettings(env: Bindings, key: string): Promise<any> {
  const r = await sb(env, `settings?key=eq.${key}&select=value`)
  return (r.ok && r.data?.[0]?.value) || {}
}
