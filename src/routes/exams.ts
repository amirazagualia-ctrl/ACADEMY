// Routes exams
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { broadcastTargeted } from '../lib/notifications'
import { getSettings, sb } from '../lib/supabase'
import { publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Rappels automatiques avant examen (J-3 et J-1) ----------
// Pour chaque événement de type examen dont la date est dans 3 jours ou demain : notification ciblée
// (élèves + parents + enseignants du niveau) + Telegram parents. Anti-doublon via settings.exam_reminders_sent.
const EXAM_REMINDER_OFFSETS = [3, 1]
async function sendExamReminders(env: Bindings, origin: string, force = false) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const sent = await getSettings(env, 'exam_reminders_sent') // { "<eventId>:<offset>": "YYYY-MM-DD" }
  const result = { checked: 0, sent: 0, skipped: 0, details: [] as string[] }
  for (const offset of EXAM_REMINDER_OFFSETS) {
    const target = new Date(today); target.setUTCDate(target.getUTCDate() + offset)
    const r = await sb(env, `events?type=eq.examen&date=eq.${iso(target)}&select=id,title,date,end_date,level,description`)
    for (const ev of (r.data || [])) {
      result.checked++
      const key = `${ev.id}:${offset}`
      if (sent[key] && !force) { result.skipped++; continue }
      const when = offset === 1 ? 'demain' : `dans ${offset} jours`
      const dateFr = new Date(ev.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      const lvl = ev.level ? ` (${ev.level})` : ''
      await broadcastTargeted(env, origin, {
        type: 'examen', title: `⏰ Rappel : examen ${when}${lvl}`,
        message: `« ${ev.title} » aura lieu ${when}, le ${dateFr}.${ev.description ? ' ' + String(ev.description).slice(0, 140) : ''} Bonne préparation ! — تذكير : امتحان ${offset === 1 ? 'غداً' : 'بعد ' + offset + ' أيام'}`,
        level: ev.level, ref_table: 'events', ref_id: Number(ev.id), link: '#calendar', created_by: null
      })
      sent[key] = iso(today)
      result.sent++
      result.details.push(`${ev.title} (J-${offset})`)
    }
  }
  // Nettoyage des clés de plus de 60 jours + sauvegarde
  const cutoff = new Date(today); cutoff.setUTCDate(cutoff.getUTCDate() - 60)
  for (const k of Object.keys(sent)) if (sent[k] < iso(cutoff)) delete sent[k]
  await sb(env, 'settings?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'exam_reminders_sent', value: sent }), headers: { Prefer: 'return=minimal,resolution=merge-duplicates' } })
  return result
}

// Maintenance quotidienne des rappels (verrou 1×/jour, déclenchée par les requêtes entrantes)
export async function dailyExamReminders(env: Bindings, origin: string) {
  const today = new Date().toISOString().slice(0, 10)
  const last = await getSettings(env, 'exam_reminders_maintenance')
  if (last.last_run === today) return null
  await sb(env, 'settings?on_conflict=key', { method: 'POST', body: JSON.stringify({ key: 'exam_reminders_maintenance', value: { last_run: today } }), headers: { Prefer: 'return=minimal,resolution=merge-duplicates' } })
  return sendExamReminders(env, origin)
}

// Route manuelle (admin) : lancer les rappels maintenant ; ?force=1 renvoie même si déjà envoyés
app.post('/api/exams/send-reminders', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const force = c.req.query('force') === '1'
  const r = await sendExamReminders(c.env, publicOrigin(c), force)
  await audit(c.env, c, user, 'exam_reminders', 'events', null, null, r)
  return c.json({ ok: true, ...r })
})

// Aperçu (admin) : examens à venir dans les 14 jours + état des rappels
app.get('/api/exams/upcoming', async (c) => {
  const user = await getUser(c)
  if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const r = await sb(c.env, `events?type=eq.examen&date=gte.${today}&date=lte.${end}&select=id,title,date,level&order=date.asc`)
  const sent = await getSettings(c.env, 'exam_reminders_sent')
  const items = (r.data || []).map((e: any) => ({ ...e, days_left: Math.round((new Date(e.date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000), reminders: { j3: sent[`${e.id}:3`] || null, j1: sent[`${e.id}:1`] || null } }))
  return c.json({ items, offsets: EXAM_REMINDER_OFFSETS })
})

export default app
