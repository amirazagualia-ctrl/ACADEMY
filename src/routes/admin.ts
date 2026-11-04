// Routes admin
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { getBrand } from '../lib/brand'
import { hashPassword } from '../lib/crypto'
import { SOFT_DELETE_TABLES, TRASH_RETENTION_DAYS, getSettings, sb, softDeleteSupported, yearCtx } from '../lib/supabase'
import { TC } from '../lib/tenant'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- ADMIN : gestion des utilisateurs ----------
app.get('/api/admin/users', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const role = c.req.query('role')
  let q = 'user_accounts?select=id,name,email,role,status,linked_student_id,linked_student_ids,phone,last_login,created_at&order=created_at.desc'
  if (role) q += `&role=eq.${role}`
  const r = await sb(c.env, q)
  return c.json(r.data || [])
})

// Création d'un compte par l'admin (seule voie pour créer un autre administrateur)
app.post('/api/admin/users', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!b.email || !b.password || !b.name) return c.json({ error: 'Champs requis manquants' }, 400)
  if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
  const role = ['admin', 'teacher', 'parent', 'student'].includes(b.role) ? b.role : 'parent'
  const email = String(b.email).trim().toLowerCase()
  const exists = await sb(c.env, `user_accounts?email=ilike.${encodeURIComponent(email)}&select=id`)
  if (exists.data?.length) return c.json({ error: 'Cet email est déjà utilisé' }, 409)
  const payload: any = { name: b.name, email, password_hash: await hashPassword(b.password), role, status: 'active', phone: b.phone || null, linked_student_ids: [] }
  const r = await sb(c.env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) })
  if (!r.ok) return c.json({ error: 'Erreur création compte', detail: r.data }, 500)
  await audit(c.env, c, user, 'create', 'user_accounts', r.data?.[0]?.id, null, { email, role, name: b.name })
  const { password_hash, ...safe } = r.data?.[0] || {}
  return c.json(safe, 201)
})

app.patch('/api/admin/users/:id', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const allowed: any = {}
  for (const k of ['status', 'role', 'name', 'email', 'linked_student_id', 'linked_student_ids', 'phone']) if (k in b) allowed[k] = b[k]
  if (b.password) {
    if (String(b.password).length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400)
    allowed.password_hash = await hashPassword(b.password)
  }
  const before = (await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}&select=id,name,email,role,status,phone,linked_student_ids`)).data?.[0]
  const r = await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(allowed) })
  await audit(c.env, c, user, 'update', 'user_accounts', c.req.param('id'), before, { ...allowed, password_hash: b.password ? '(modifié)' : undefined })
  const { password_hash: _ph, ...safeU } = r.data?.[0] || {}
  return c.json(r.data?.[0] ? safeU : { ok: r.ok })
})

app.delete('/api/admin/users/:id', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (String(user.id) === c.req.param('id')) return c.json({ error: 'Impossible de supprimer votre propre compte' }, 400)
  const before = (await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}&select=id,name,email,role,status`)).data?.[0]
  const r = await sb(c.env, `user_accounts?id=eq.${c.req.param('id')}`, { method: 'DELETE' })
  await audit(c.env, c, user, 'delete', 'user_accounts', c.req.param('id'), before, null)
  return c.json({ ok: r.ok })
})

// ---------- Journal d'audit (admin) ----------
app.get('/api/admin/audit', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const limit = Math.min(500, Number(c.req.query('limit') || 200))
  let q = `audit_log?select=*&order=created_at.desc&limit=${limit}`
  for (const k of ['action', 'table_name', 'user_email']) { const v = c.req.query(k); if (v) q += `&${k}=eq.${encodeURIComponent(v)}` }
  const from = c.req.query('from'); if (from) q += `&created_at=gte.${from}`
  const to = c.req.query('to'); if (to) q += `&created_at=lte.${to}T23:59:59`
  const r = await sb(c.env, q)
  if (!r.ok) return c.json({ error: 'Journal d\'audit indisponible — exécutez migrations/0007_security.sql', supported: false, items: [] }, 200)
  return c.json({ supported: true, items: r.data || [] })
})

// ---------- Corbeille (soft-delete) : liste / restauration / purge ----------
app.get('/api/admin/trash', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!(await softDeleteSupported(c.env))) return c.json({ supported: false, items: [] })
  // Auto-purge des éléments supprimés depuis plus de 30 jours
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400000).toISOString()
  const items: any[] = []
  for (const t of SOFT_DELETE_TABLES) {
    try { await sb(c.env, `${t}?deleted_at=lt.${cutoff}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }) } catch (e) {}
    const r = await sb(c.env, `${t}?deleted_at=not.is.null&select=*&order=deleted_at.desc&limit=200`)
    for (const row of (r.data || [])) items.push({ table: t, id: row.id, deleted_at: row.deleted_at, deleted_by: row.deleted_by, label: rowLabel(t, row), expires_at: new Date(new Date(row.deleted_at).getTime() + TRASH_RETENTION_DAYS * 86400000).toISOString() })
  }
  items.sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)))
  return c.json({ supported: true, retention_days: TRASH_RETENTION_DAYS, items })
})
function rowLabel(t: string, r: any): string {
  if (t === 'students' || t === 'teachers') return `${r.first_name || ''} ${r.last_name || ''}`.trim() + (r.level ? ` (${r.level})` : '')
  if (t === 'grades') return `Note ${r.score}/${r.max_score || 20} — élève #${r.student_id} T${r.trimester}`
  if (t === 'fees') return `${r.label || 'Frais'} ${r.amount} DT — élève #${r.student_id} (${r.status})`
  if (t === 'events') return `${r.title} — ${r.date}`
  return r.title || r.name || `#${r.id}`
}
app.post('/api/admin/trash/restore', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!SOFT_DELETE_TABLES.includes(b.table) || !b.id) return c.json({ error: 'Paramètres invalides' }, 400)
  const r = await sb(c.env, `${b.table}?id=eq.${Number(b.id)}&deleted_at=not.is.null`, { method: 'PATCH', body: JSON.stringify({ deleted_at: null, deleted_by: null }) })
  if (!r.data?.length) return c.json({ error: 'Élément introuvable dans la corbeille' }, 404)
  await audit(c.env, c, user, 'restore', b.table, b.id, null, r.data?.[0] || null)
  return c.json({ ok: r.ok, row: r.data?.[0] })
})
app.post('/api/admin/trash/purge', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!SOFT_DELETE_TABLES.includes(b.table) || !b.id) return c.json({ error: 'Paramètres invalides' }, 400)
  // deleted_at=not.is.null : lecture explicite d'un élément en corbeille (le filtre global exclut sinon les supprimés)
  const before = (await sb(c.env, `${b.table}?id=eq.${Number(b.id)}&deleted_at=not.is.null&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Seuls les éléments déjà dans la corbeille peuvent être supprimés définitivement' }, 400)
  const r = await sb(c.env, `${b.table}?id=eq.${Number(b.id)}`, { method: 'DELETE' })
  await audit(c.env, c, user, 'purge', b.table, b.id, before, null)
  return c.json({ ok: r.ok })
})

// ---------- Sauvegardes (export complet / restauration) ----------
// Export JSON de TOUTES les tables (toutes années, y compris corbeille) — admin uniquement.
// Le stockage automatique hebdomadaire vers R2 sera branché au déploiement (binding R2 optionnel).
const BACKUP_TABLES = ['school_years', 'students', 'student_year_levels', 'teachers', 'teacher_students', 'classes', 'subjects', 'grades', 'attendance', 'fees', 'courses', 'interactive_courses', 'events', 'homeworks', 'homework_submissions', 'bulletin_signatures', 'certificates', 'online_payments', 'evaluations', 'evaluation_attempts', 'cur_cycles', 'cur_levels', 'cur_sections', 'cur_subjects', 'cur_level_subjects', 'cur_chapters', 'cur_notions', 'cur_domains', 'cur_exercise_types', 'exercise_bank', 'exercise_favorites', 'chapters', 'evaluation_versions', 'ai_wallets', 'ai_token_moves', 'notifications', 'notification_reads', 'registrations', 'settings', 'user_accounts', 'audit_log']
const BACKUP_SENSITIVE = ['password_hash'] // exclus de l'export

async function buildBackup(env: Bindings, user: any) {
  const tables: Record<string, any[]> = {}
  const counts: Record<string, number> = {}
  const errors: string[] = []
  for (const t of BACKUP_TABLES) {
    // Lecture brute hors contexte (toutes années, supprimés inclus) : requête directe sans filtres globaux
    const rows: any[] = []
    let from = 0
    while (true) {
      // ALL_ROWS : mention de « deleted_at » sans effet (or toujours vrai) pour neutraliser le filtre global soft-delete
      const r = await yearCtx.run(null, () => sb(env, `${t}?select=*&order=${t === 'settings' ? 'key' : 'id'}.asc${SOFT_DELETE_TABLES.includes(t) ? '&or=(deleted_at.is.null,deleted_at.not.is.null)' : ''}`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } }))
      if (!r.ok) { if (from === 0) errors.push(`${t}: ${r.data?.message || r.status}`); break }
      const chunk = Array.isArray(r.data) ? r.data : []
      rows.push(...chunk)
      if (chunk.length < 1000) break
      from += 1000
    }
    for (const row of rows) for (const k of BACKUP_SENSITIVE) delete row[k]
    tables[t] = rows; counts[t] = rows.length
  }
  return {
    meta: { app: (await getBrand(env)).name, platform: 'Rahma Academy Platform', version: 1, exported_at: new Date().toISOString(), exported_by: user?.email || null, tables: counts, errors },
    tables
  }
}

// Export complet (JSON). Enregistre une entrée dans l'historique (settings.backup_history, 30 dernières)
app.get('/api/admin/backup/export', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const data = await buildBackup(c.env, user)
  const json = JSON.stringify(data)
  const total = Object.values(data.meta.tables).reduce((a, b) => a + b, 0)
  try {
    const hist = await getSettings(c.env, 'backup_history')
    const items = Array.isArray(hist.items) ? hist.items : []
    items.unshift({ at: data.meta.exported_at, by: user.email, rows: total, size: json.length, tables: data.meta.tables, kind: 'manual' })
    await sb(c.env, 'settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key: 'backup_history', value: { items: items.slice(0, 30) } }) })
  } catch (e) {}
  await audit(c.env, c, user, 'backup_export', 'all', null, null, { rows: total, size: json.length })
  const fname = `rahma-academy-backup-${data.meta.exported_at.slice(0, 19).replace(/[:T]/g, '-')}.json`
  return new Response(json, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}"`, 'Cache-Control': 'no-store' } })
})

// Historique + tailles actuelles
app.get('/api/admin/backup/status', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const hist = await getSettings(c.env, 'backup_history')
  const counts: Record<string, number> = {}
  await Promise.all(BACKUP_TABLES.map(async t => {
    const r = await yearCtx.run(null, () => sb(c.env, `${t}?select=${t === 'settings' ? 'key' : 'id'}${SOFT_DELETE_TABLES.includes(t) ? '&or=(deleted_at.is.null,deleted_at.not.is.null)' : ''}`))
    counts[t] = r.ok ? (Array.isArray(r.data) ? r.data.length : 0) : -1
  }))
  return c.json({ history: Array.isArray(hist.items) ? hist.items : [], counts, r2: false, tables: BACKUP_TABLES })
})

// Restauration d'UNE table depuis une sauvegarde JSON : { table, rows, mode: 'upsert' | 'replace' }
// - upsert : insère/met à jour par clé primaire (sans toucher aux autres lignes)
// - replace : vide la table puis réinsère (protégé par confirmation côté client)
app.post('/api/admin/backup/restore', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const table = String(b.table || '')
  if (!BACKUP_TABLES.includes(table) || table === 'audit_log') return c.json({ error: 'Table non restaurable' }, 400)
  const rows: any[] = Array.isArray(b.rows) ? b.rows : []
  if (!rows.length) return c.json({ error: 'Aucune ligne à restaurer' }, 400)
  if (table === 'user_accounts') for (const r of rows) if (!r.password_hash) delete r.password_hash // ne pas écraser les mots de passe
  const pk = table === 'settings' ? 'key' : 'id'
  const mode = b.mode === 'replace' ? 'replace' : 'upsert'
  if (mode === 'replace') {
    if (b.confirm !== table) return c.json({ error: `Confirmation requise : saisissez « ${table} »` }, 400)
    const del = await yearCtx.run(null, () => sb(c.env, `${table}?${pk}=not.is.null`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }))
    if (!del.ok) return c.json({ error: 'Échec du vidage de la table', detail: del.data }, 500)
  }
  let inserted = 0, updated = 0, skipped = 0; const errors: string[] = []
  if (mode === 'replace' || table === 'settings') {
    // Table vide (ou clé texte) : insertion directe. Les colonnes identity « GENERATED ALWAYS » refusent un id fourni :
    // on tente avec id (préserve les liaisons), sinon repli sans id (les liaisons par id seraient alors perdues -> signalé).
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      let r = await yearCtx.run(null, () => sb(c.env, `${table}?on_conflict=${pk}`, { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(chunk) }))
      if (!r.ok && table !== 'settings' && /identity|GENERATED ALWAYS|428C9/i.test(JSON.stringify(r.data))) {
        r = await yearCtx.run(null, () => sb(c.env, table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(chunk.map(({ id, ...rest }: any) => rest)) }))
        if (r.ok) errors.push('Identifiants régénérés (colonne id GENERATED ALWAYS) : les liaisons vers cette table peuvent être décalées')
      }
      if (r.ok) inserted += chunk.length; else errors.push(String(r.data?.message || r.data?.details || r.status))
    }
  } else {
    // Mode compléter : ligne par ligne — PATCH si l'id existe, sinon INSERT (sans id si identity ALWAYS). Jamais de doublon.
    const existing = new Set<string>()
    const ex = await yearCtx.run(null, () => sb(c.env, `${table}?select=${pk}${SOFT_DELETE_TABLES.includes(table) ? '&or=(deleted_at.is.null,deleted_at.not.is.null)' : ''}`))
    for (const e of (ex.data || [])) existing.add(String(e[pk]))
    for (const row of rows) {
      const id = row[pk]
      if (id != null && existing.has(String(id))) {
        const { [pk]: _k, ...rest } = row
        const r = await yearCtx.run(null, () => sb(c.env, `${table}?${pk}=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rest) }))
        if (r.ok) updated++; else errors.push(`#${id}: ${r.data?.message || r.status}`)
      } else {
        let r = await yearCtx.run(null, () => sb(c.env, table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }))
        if (!r.ok && /identity|GENERATED ALWAYS|428C9/i.test(JSON.stringify(r.data))) { const { [pk]: _k, ...rest } = row; r = await yearCtx.run(null, () => sb(c.env, table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rest) })) }
        if (r.ok) inserted++; else errors.push(`#${id ?? '?'}: ${r.data?.message || r.status}`)
      }
      if (errors.length > 20) { skipped = rows.length - inserted - updated; break }
    }
  }
  TC._currentYearCache = null
  const uniqErrors = Array.from(new Set(errors))
  await audit(c.env, c, user, 'backup_restore', table, null, null, { mode, rows: rows.length, inserted, updated, skipped, errors: uniqErrors.slice(0, 3) })
  return c.json({ ok: !uniqErrors.length, table, mode, inserted, updated, skipped, total: rows.length, errors: uniqErrors.slice(0, 5) })
})

export default app
