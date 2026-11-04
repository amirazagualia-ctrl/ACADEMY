// Routes school-years
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { currentYear, sb, yearSupported } from '../lib/supabase'
import { TC } from '../lib/tenant'
import { cycleOf, nextLevel, nextYearLabel } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Années scolaires : liste, création, année courante, assistant de passage ----------
app.get('/api/school-years', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await yearSupported(c.env))) return c.json({ supported: false, current: null, items: [] })
  const r = await sb(c.env, 'school_years?select=*&order=start_date.desc')
  const items = r.data || []
  return c.json({ supported: true, current: items.find((y: any) => y.is_current)?.label || null, items })
})

// Aperçu du passage : pour chaque élève actif, niveau actuel -> niveau proposé (ou sortant)
app.get('/api/school-years/rollover/preview', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const cy = await currentYear(c.env)
  if (!cy) return c.json({ error: 'Exécutez migrations/0009_school_years.sql' }, 400)
  const st = await sb(c.env, 'students?status=eq.actif&select=id,first_name,last_name,level,class_name&order=level.asc,last_name.asc')
  const students = (st.data || []).map((s: any) => ({ ...s, next_level: nextLevel(s.level), outcome: nextLevel(s.level) ? 'promu' : 'sortant' }))
  // Moyenne annuelle (si notes) pour aider la décision : < 10 -> suggestion redoublant
  const gr = await sb(c.env, `grades?school_year=eq.${cy}&select=student_id,score,max_score`)
  const agg: Record<number, { s: number; n: number }> = {}
  for (const g of (gr.data || [])) { const k = Number(g.student_id); agg[k] = agg[k] || { s: 0, n: 0 }; agg[k].s += Number(g.score) / (Number(g.max_score) || 20) * 20; agg[k].n++ }
  for (const s of students) { const a = agg[Number(s.id)]; s.average = a ? Math.round(a.s / a.n * 100) / 100 : null; if (s.average !== null && s.average < 10 && s.outcome === 'promu') s.outcome = 'redoublant' }
  return c.json({ current: cy, next: nextYearLabel(cy), students })
})

// Exécution du passage : clôture l'année courante, crée la suivante, applique les décisions
// body: { decisions: { [studentId]: 'promu' | 'redoublant' | 'sortant' }, start_date?, end_date?, confirm: '<label courant>' }
app.post('/api/school-years/rollover', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const cy = await currentYear(c.env)
  if (!cy) return c.json({ error: 'Exécutez migrations/0009_school_years.sql' }, 400)
  const b = await c.req.json()
  if (b.confirm !== cy) return c.json({ error: `Confirmation requise : saisissez « ${cy} » pour clôturer cette année.` }, 400)
  const ny = nextYearLabel(cy)
  const startY = Number(ny.split('-')[0])
  const start_date = b.start_date || `${startY}-09-01`, end_date = b.end_date || `${startY + 1}-06-30`
  const decisions: Record<string, string> = b.decisions || {}
  const st = await sb(c.env, 'students?status=eq.actif&select=id,level,class_name')
  const counts = { promu: 0, redoublant: 0, sortant: 0 }
  // 1) Historique de l'année clôturée + application des décisions
  for (const s of (st.data || [])) {
    const suggested = nextLevel(s.level) ? 'promu' : 'sortant'
    const d = (decisions[String(s.id)] || suggested) as keyof typeof counts
    counts[d] = (counts[d] || 0) + 1
    await sb(c.env, 'student_year_levels?on_conflict=student_id,school_year', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ student_id: s.id, school_year: cy, level: s.level, class_name: s.class_name, outcome: d }) })
    if (d === 'promu') { const nl = nextLevel(s.level)!; await sb(c.env, `students?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ level: nl, cycle: cycleOf(nl), class_name: null }) }) }
    else if (d === 'sortant') await sb(c.env, `students?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'inactif' }) })
    // redoublant : niveau inchangé
    if (d !== 'sortant') { const lvl = d === 'promu' ? nextLevel(s.level)! : s.level; await sb(c.env, 'student_year_levels?on_conflict=student_id,school_year', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ student_id: s.id, school_year: ny, level: lvl }) }) }
  }
  // 2) Clôture + nouvelle année courante
  await sb(c.env, `school_years?label=eq.${cy}`, { method: 'PATCH', body: JSON.stringify({ is_current: false, closed_at: new Date().toISOString() }) })
  const ins = await sb(c.env, 'school_years?on_conflict=label', { method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify({ label: ny, start_date, end_date, is_current: true, closed_at: null }) })
  if (!ins.ok) { await sb(c.env, `school_years?label=eq.${cy}`, { method: 'PATCH', body: JSON.stringify({ is_current: true, closed_at: null }) }); return c.json({ error: 'Impossible de créer la nouvelle année', detail: ins.data }, 500) }
  TC._currentYearCache = null
  // 3) Remise à zéro des verrous de maintenance (mensualités, rappels) pour la nouvelle année
  await sb(c.env, 'settings?key=in.(fees_maintenance,exam_reminders_maintenance)', { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await audit(c.env, c, user, 'rollover', 'school_years', ny, { closed: cy }, { opened: ny, ...counts })
  return c.json({ ok: true, closed: cy, opened: ny, ...counts })
})

// Annuler le dernier passage d'année (dans les 30 jours, si la nouvelle année n'a pas encore de données) — admin
app.get('/api/school-years/rollback/preview', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const info = await rollbackInfo(c.env)
  return c.json(info)
})
async function rollbackInfo(env: Bindings) {
  const cy = await currentYear(env)
  if (!cy) return { possible: false, reason: 'Migration 0009 non appliquée' }
  const prevLabel = `${Number(cy.split('-')[0]) - 1}-${Number(cy.split('-')[0])}`
  const prev = (await sb(env, `school_years?label=eq.${prevLabel}&select=*`)).data?.[0]
  if (!prev || !prev.closed_at) return { possible: false, reason: `Aucune année clôturée juste avant ${cy} (${prevLabel}).`, current: cy }
  const days = (Date.now() - new Date(prev.closed_at).getTime()) / 86400000
  // Données déjà saisies dans la nouvelle année (hors mensualités auto) ?
  const counts: Record<string, number> = {}
  for (const t of ['grades', 'attendance', 'events', 'homeworks', 'registrations']) { const r = await sb(env, `${t}?school_year=eq.${cy}&select=id&limit=1`); counts[t] = (r.data || []).length }
  const feesPaid = (await sb(env, `fees?school_year=eq.${cy}&status=eq.paid&select=id&limit=1`)).data?.length || 0
  const blocking = Object.entries(counts).filter(([, n]) => n > 0).map(([t]) => t).concat(feesPaid ? ['paiements encaissés'] : [])
  const hist = (await sb(env, `student_year_levels?school_year=eq.${prevLabel}&outcome=not.is.null&select=student_id,level,class_name,outcome`)).data || []
  return { possible: blocking.length === 0 && days <= 30 && hist.length > 0, current: cy, previous: prevLabel, closed_at: prev.closed_at, days: Math.floor(days), blocking, students: hist.length, outcomes: { promu: hist.filter((h: any) => h.outcome === 'promu').length, redoublant: hist.filter((h: any) => h.outcome === 'redoublant').length, sortant: hist.filter((h: any) => h.outcome === 'sortant').length }, reason: blocking.length ? `Des données existent déjà dans ${cy} : ${blocking.join(', ')}. Annulation impossible sans les supprimer d'abord.` : days > 30 ? 'Le passage date de plus de 30 jours.' : !hist.length ? 'Aucun historique de passage trouvé.' : null }
}
app.post('/api/school-years/rollback', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json().catch(() => ({}))
  const info = await rollbackInfo(c.env)
  if (!info.possible) return c.json({ error: info.reason || 'Annulation impossible' }, 400)
  if (b.confirm !== info.previous) return c.json({ error: `Confirmation requise : saisissez « ${info.previous} ».` }, 400)
  const cy = info.current!, py = info.previous!
  const hist = (await sb(c.env, `student_year_levels?school_year=eq.${py}&outcome=not.is.null&select=student_id,level,class_name,outcome`)).data || []
  let restored = 0
  for (const h of hist) {
    const patch: any = { level: h.level, cycle: cycleOf(h.level), class_name: h.class_name || null }
    if (h.outcome === 'sortant') patch.status = 'actif'
    const r = await sb(c.env, `students?id=eq.${h.student_id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (r.ok) restored++
  }
  // Effacer les décisions (l'année redevient "en cours") et les lignes de parcours de la nouvelle année
  await sb(c.env, `student_year_levels?school_year=eq.${py}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ outcome: null }) })
  await sb(c.env, `student_year_levels?school_year=eq.${cy}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  // Mensualités générées automatiquement pour la nouvelle année (non payées) → supprimées définitivement
  await sb(c.env, `fees?school_year=eq.${cy}&status=neq.paid`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  // Années : l'ancienne redevient courante, la nouvelle est supprimée
  await sb(c.env, `school_years?label=eq.${py}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_current: true, closed_at: null }) })
  await sb(c.env, `school_years?label=eq.${cy}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  TC._currentYearCache = null
  await sb(c.env, 'settings?key=in.(fees_maintenance,exam_reminders_maintenance)', { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await audit(c.env, c, user, 'rollback_rollover', 'school_years', py, { current: cy }, { restored_current: py, students_restored: restored })
  return c.json({ ok: true, current: py, removed: cy, restored })
})

// Rouvrir une année clôturée comme courante (correction d'erreur) — admin
app.post('/api/school-years/set-current', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  if (!/^\d{4}-\d{4}$/.test(b.label || '')) return c.json({ error: 'Libellé invalide' }, 400)
  await sb(c.env, 'school_years?is_current=eq.true', { method: 'PATCH', body: JSON.stringify({ is_current: false }) })
  const r = await sb(c.env, `school_years?label=eq.${b.label}`, { method: 'PATCH', body: JSON.stringify({ is_current: true, closed_at: null }) })
  TC._currentYearCache = null
  await audit(c.env, c, user, 'set_current_year', 'school_years', b.label, null, r.data?.[0] || null)
  return c.json({ ok: r.ok && !!r.data?.length })
})

export default app
