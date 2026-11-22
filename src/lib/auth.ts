// Authentification JWT, verrouillage login, audit, périmètre enseignant, super-admin
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { verify } from 'hono/jwt'
import { hashPassword } from './crypto'
import { sb } from './supabase'
import { resolveSession } from './session'
import { sessionUsable } from './session-rules'
import { DEFAULT_TENANT, TC, cfg, tenantSlug } from './tenant'
import { clientIp } from './utils'
import type { Bindings } from '../types/bindings'

// Migration transparente du hash après connexion réussie
export async function upgradeHashIfNeeded(env: Bindings, userId: number, password: string, res: { ok: boolean; needsUpgrade: boolean }) {
  if (res.ok && res.needsUpgrade) {
    try { await sb(env, `user_accounts?id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ password_hash: await hashPassword(password) }) }) } catch (e) { /* non bloquant */ }
  }
}

// ---------- Rate-limiting connexion : 5 échecs / 15 min par email ou par IP ----------
const LOGIN_MAX = 5
const LOGIN_WINDOW_MIN = 15
export async function loginBlocked(env: Bindings, email: string, ip: string): Promise<number> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60000).toISOString()
  const r = await sb(env, `login_attempts?select=created_at&or=(email.eq.${encodeURIComponent(email)},ip.eq.${encodeURIComponent(ip)})&created_at=gte.${since}&order=created_at.desc&limit=${LOGIN_MAX}`)
  if (!r.ok) return 0 // table absente (migration 0007 non appliquée) -> pas de blocage
  const rows = r.data || []
  if (rows.length < LOGIN_MAX) return 0
  const oldest = new Date(rows[rows.length - 1].created_at).getTime()
  return Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MIN * 60000 - Date.now()) / 60000))
}
export async function recordLoginFailure(env: Bindings, email: string, ip: string) {
  try { await sb(env, 'login_attempts', { method: 'POST', body: JSON.stringify({ email, ip }), headers: { Prefer: 'return=minimal' } }) } catch (e) {}
}
export async function clearLoginFailures(env: Bindings, email: string) {
  try { await sb(env, `login_attempts?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }) } catch (e) {}
}

// ---------- Journal d'audit ----------
export async function audit(env: Bindings, c: any, user: any, action: string, table: string, recordId: any, before: any, after: any) {
  try {
    const strip = (o: any) => { if (!o || typeof o !== 'object') return o; const x = { ...o }; delete x.password_hash; return x }
    await sb(env, 'audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      user_id: user?.id || null, user_email: user?.email || null, user_role: user?.role || null,
      action, table_name: table, record_id: recordId != null ? String(recordId) : null,
      before: strip(before) ?? null, after: strip(after) ?? null, ip: clientIp(c)
    }) })
  } catch (e) { /* jamais bloquant */ }
}

// L2 : authentification par COOKIE de session (HttpOnly) — la source de vérité est la table `sessions`.
// Le Bearer reste accepté pour les scripts/API (compatibilité), mais uniquement s'il porte un `sid`
// dont la session est vivante : un jeton volé et non rattaché à une session est refusé.
export async function getUser(c: any): Promise<any | null> {
  // Mémo par requête : de nombreuses routes appellent getUser() puis superAdmin() (qui le rappelle).
  // Sans ce cache, chaque appel referait une requête `sessions`.
  if (c.get('_sessResolved')) return c.get('_sessUser') || null
  c.set('_sessResolved', true)
  const found = await resolveUser(c)
  c.set('_sessUser', found || null)
  return found
}

async function resolveUser(c: any): Promise<any | null> {
  const cookie = await resolveSession(c)
  if (cookie) {
    try { c.set('monUser', { id: cookie.id, role: cookie.role }) } catch {} // observabilité (jamais l'e-mail)
    return cookie
  }
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const u: any = await verify(auth.slice(7), cfg(c.env).jwt, 'HS256')
    // F63 : un jeton émis pour un autre établissement n'est pas valable ici
    const tok = u?.tenant || DEFAULT_TENANT
    if (tok !== tenantSlug()) return null
    // L2 : jeton d'API legacy (sans session) ou session révoquée -> refus
    if (!u?.sid) return null
    const r = await sb(c.env, `sessions?id=eq.${encodeURIComponent(u.sid)}&select=id,user_id,revoked_at,expires_at`)
    const row = r.data?.[0]
    if (r.ok && !sessionUsable(row)) return null
    try { c.set('monUser', { id: u.id, role: u.role }) } catch {}
    return u
  } catch { return null }
}

export function linkedIds(user: any): number[] {
  const ids: number[] = []
  if (user?.linked_student_id) ids.push(Number(user.linked_student_id))
  if (Array.isArray(user?.linked_student_ids)) user.linked_student_ids.forEach((i: any) => { const n = Number(i); if (n && !ids.includes(n)) ids.push(n) })
  return ids
}

// ---------- Enseignants : fiche liée + élèves affectés ----------
// Retrouve la fiche enseignant (teachers.id) du compte connecté : via linked_teacher_id, sinon par email (auto-liaison)
export async function getTeacherId(env: Bindings, user: any): Promise<number | null> {
  const acc = await sb(env, `user_accounts?id=eq.${user.id}&select=*`)
  const a = acc.data?.[0]
  if (a?.linked_teacher_id) return Number(a.linked_teacher_id)
  const email = a?.email || user.email
  if (!email) return null
  const t = await sb(env, `teachers?email=eq.${encodeURIComponent(email)}&select=id`)
  const tid = t.data?.[0]?.id
  if (tid) { try { await sb(env, `user_accounts?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ linked_teacher_id: tid }) }) } catch (e) {} }
  return tid ? Number(tid) : null
}

// IDs des élèves affectés à l'enseignant connecté.
// Retourne null si la table teacher_students n'existe pas encore (migration 0003 non appliquée -> pas de filtrage),
// [] si aucun élève affecté (l'enseignant ne voit rien).
export async function teacherAssignedIds(env: Bindings, user: any): Promise<number[] | null> {
  const tid = await getTeacherId(env, user)
  const probe = await sb(env, `teacher_students?select=student_id&limit=1`)
  if (!probe.ok) return null // table absente => comportement historique (pas de filtrage)
  if (!tid) return []
  const r = await sb(env, `teacher_students?teacher_id=eq.${tid}&select=student_id`)
  if (!r.ok) return null
  return (r.data || []).map((x: any) => Number(x.student_id))
}

// F59 : périmètre enseignant = matières affectées (teachers.subject_ids, repli : nom `subject`) + élèves affectés (teacher_students)
// (per-tenant) let _tsubjSupported: { ok: boolean; at: number } | null = null
async function teacherSubjectsSupported(env: Bindings) {
  if (TC._tsubjSupported && (TC._tsubjSupported.ok || Date.now() - TC._tsubjSupported.at < 300000)) return TC._tsubjSupported.ok
  const p = await sb(env, 'teachers?select=subject_ids&limit=1'); TC._tsubjSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
// Renvoie { teacher_id, subject_ids (null = non restreint : colonne absente ET aucun nom ne correspond), student_ids (null = non restreint) }
export async function teacherScope(env: Bindings, user: any) {
  const tid = await getTeacherId(env, user)
  const student_ids = await teacherAssignedIds(env, user)
  let subject_ids: number[] | null = null
  if (tid) {
    const hasCol = await teacherSubjectsSupported(env)
    const t = (await sb(env, `teachers?id=eq.${tid}&select=subject${hasCol ? ',subject_ids' : ''}`)).data?.[0]
    if (hasCol && Array.isArray(t?.subject_ids) && t.subject_ids.length) subject_ids = t.subject_ids.map(Number)
    else if (t?.subject) {
      // Repli : correspondance par nom (plusieurs noms séparés par , / ;)
      const names = String(t.subject).split(/[,;\/]/).map((x: string) => x.trim().toLowerCase()).filter(Boolean)
      const all = (await sb(env, 'subjects?select=id,name')).data || []
      const ids = all.filter((x: any) => names.some((n: string) => String(x.name || '').trim().toLowerCase() === n)).map((x: any) => Number(x.id))
      if (ids.length) subject_ids = ids
    }
  } else subject_ids = []
  return { teacher_id: tid, subject_ids, student_ids }
}
export const inScopeSubject = (scope: any, sid: any) => scope.subject_ids === null || scope.subject_ids.includes(Number(sid))
export const inScopeStudent = (scope: any, sid: any) => scope.student_ids === null || scope.student_ids.includes(Number(sid))
// Super-administrateur = administrateur de l'établissement par défaut (base maître).
// L2 : lit la session cookie d'abord, puis le Bearer rattaché à une session vivante.
export async function superAdmin(c: any): Promise<any | null> {
  const u: any = await getUser(c)
  return u?.role === 'admin' && (u?.tenant || DEFAULT_TENANT) === DEFAULT_TENANT ? u : null
}
