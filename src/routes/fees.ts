// Routes fees
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { getUser, linkedIds, teacherAssignedIds } from '../lib/auth'
import { notifyParent } from '../lib/notifications'
import { getSettings, sb } from '../lib/supabase'
import { MONTH_LABELS_FR } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

async function generateMonthlyFees(env: Bindings) {
  const now = new Date()
  const period = now.toISOString().slice(0, 7) // YYYY-MM
  const label = `Mensualité ${MONTH_LABELS_FR[now.getMonth()]} ${now.getFullYear()}`
  const feeCfg = await getSettings(env, 'fees')
  const defaultAmount = Number(feeCfg.monthly_amount) > 0 ? Number(feeCfg.monthly_amount) : 60
  const dueDate = `${period}-10`

  // Élèves actifs (monthly_fee si la colonne existe)
  let hasCols = true
  let st = await sb(env, `students?status=eq.actif&select=id,monthly_fee`)
  if (!st.ok) { hasCols = false; st = await sb(env, `students?status=eq.actif&select=id`) }
  const students = st.data || []
  if (!students.length) return { created: 0, period }

  // Mensualités déjà générées ce mois-ci
  let existing = await sb(env, `fees?period=eq.${period}&select=student_id`)
  if (!existing.ok) { hasCols = false; existing = await sb(env, `fees?label=eq.${encodeURIComponent(label)}&select=student_id`) }
  const done = new Set((existing.data || []).map((f: any) => Number(f.student_id)))

  const rows = students.filter((s: any) => !done.has(Number(s.id))).map((s: any) => ({
    student_id: s.id, label,
    amount: Number(s.monthly_fee) > 0 ? Number(s.monthly_fee) : defaultAmount,
    due_date: dueDate, status: 'pending',
    ...(hasCols ? { period } : {})
  }))
  if (!rows.length) return { created: 0, period }

  let ins = await sb(env, 'fees', { method: 'POST', body: JSON.stringify(rows) })
  // Repli : colonne period absente (migration 0005 non appliquée)
  if (!ins.ok && ins.data?.code === 'PGRST204') {
    for (const r of rows) delete (r as any).period
    ins = await sb(env, 'fees', { method: 'POST', body: JSON.stringify(rows) })
  }
  return { created: ins.ok ? rows.length : 0, period, error: ins.ok ? undefined : ins.data }
}

// Marque en retard les frais échus + notifie les tuteurs. maxNotify limite les envois par passage.
async function sweepOverdueFees(env: Bindings, maxNotify = 50) {
  const today = new Date().toISOString().slice(0, 10)
  const r = await sb(env, `fees?status=eq.pending&due_date=lt.${today}&select=*`)
  const overdue = r.data || []
  let notified = 0
  for (const fee of overdue) {
    await sb(env, `fees?id=eq.${fee.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'overdue' }) })
    if (notified < maxNotify) {
      await notifyParent(env, fee.student_id, 'frais', 'Rappel de paiement', `⚠️ Le paiement « ${fee.label} » de ${fee.amount} DT était dû le ${fee.due_date}. Merci de régulariser la situation auprès de l'administration.`)
      notified++
    }
  }
  return { overdue: overdue.length, notified }
}

// Maintenance quotidienne automatique (déclenchée par les requêtes entrantes, 1×/jour) :
// génère les mensualités du mois + bascule les frais échus en retard avec rappel.
export async function dailyFeesMaintenance(env: Bindings) {
  const today = new Date().toISOString().slice(0, 10)
  const lastRun = await getSettings(env, 'fees_maintenance')
  if (lastRun.last_run === today) return null
  // Verrou optimiste : enregistrer la date AVANT le traitement pour éviter les doubles passages
  await sb(env, 'settings?on_conflict=key', {
    method: 'POST', body: JSON.stringify({ key: 'fees_maintenance', value: { last_run: today } }),
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' }
  })
  const gen = await generateMonthlyFees(env)
  const sweep = await sweepOverdueFees(env)
  return { ...gen, ...sweep }
}

// Route manuelle : générer les mensualités du mois maintenant (admin)
app.post('/api/fees/generate-monthly', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const gen = await generateMonthlyFees(c.env)
  return c.json({ ok: true, ...gen })
})

// ---------- Vérification des frais en retard + relances ----------
app.post('/api/fees/check-overdue', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const result = await sweepOverdueFees(c.env)
  return c.json({ checked: true, ...result })
})

// ---------- Historique de paiement d'un élève ----------
app.get('/api/fees/history/:studentId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const sid = Number(c.req.param('studentId'))
  if ((user.role === 'parent' || user.role === 'student') && !linkedIds(user).includes(sid)) return c.json({ error: 'Accès refusé' }, 403)
  if (user.role === 'teacher') {
    const aids = await teacherAssignedIds(c.env, user)
    if (aids !== null && !aids.includes(sid)) return c.json({ error: 'Accès refusé : élève non affecté' }, 403)
  }
  const [st, fees] = await Promise.all([
    sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name,monthly_fee,status`),
    sb(c.env, `fees?student_id=eq.${sid}&select=*&order=due_date.desc.nullslast,created_at.desc`)
  ])
  // Repli : colonne monthly_fee absente
  let student = st.data?.[0]
  if (!st.ok) {
    const st2 = await sb(c.env, `students?id=eq.${sid}&select=id,first_name,last_name,level,class_name,status`)
    student = st2.data?.[0]
  }
  if (!student) return c.json({ error: 'Élève introuvable' }, 404)
  const list = fees.data || []
  const totals = {
    paid: list.filter((f: any) => f.status === 'paid').reduce((s: number, f: any) => s + Number(f.amount), 0),
    pending: list.filter((f: any) => f.status === 'pending').reduce((s: number, f: any) => s + Number(f.amount), 0),
    overdue: list.filter((f: any) => f.status === 'overdue').reduce((s: number, f: any) => s + Number(f.amount), 0)
  }
  return c.json({ student, fees: list, totals })
})

export default app
