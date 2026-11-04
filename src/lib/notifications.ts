// Notifications parents : codes élèves, reçus, ciblage, fil personnel
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { linkedIds, teacherAssignedIds } from './auth'
import { getBrand } from './brand'
import { CODE_CHARS, sha256Hex } from './crypto'
import { sendEmail, sendSMS, sendTelegram } from './notify'
import { getSettings, sb } from './supabase'
import { cfg } from './tenant'
import type { Bindings } from '../types/bindings'

// ---------- Quittance : lien sécurisé + envoi Telegram ----------
export async function receiptToken(env: Bindings, id: string | number) {
  return (await sha256Hex(`quittance::${cfg(env).jwt}::${id}`)).slice(0, 20)
} // sans I/O/0/1 (confusion)
export async function studentCode(env: Bindings, id: string | number) {
  const h = await sha256Hex(`eleve::${cfg(env).jwt}::${id}`)
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += CODE_CHARS[parseInt(h.slice(i * 2, i * 2 + 2), 16) % CODE_CHARS.length]
  return `RCF-${id}-${suffix}`
}
// Valide un code saisi ; retourne l'id élève ou null
export async function parseStudentCode(env: Bindings, raw: string): Promise<number | null> {
  const m = String(raw || '').trim().toUpperCase().replace(/\s+/g, '').match(/^(?:RCF-?)?(\d+)-?([A-Z2-9]{4})$/)
  if (!m) return null
  const id = Number(m[1])
  const expected = await studentCode(env, id)
  return expected.replace(/-/g, '') === `RCF${m[1]}${m[2]}` ? id : null
}

export async function sendReceiptTelegram(env: Bindings, origin: string, fee: any) {
  try {
    const st = await sb(env, `students?id=eq.${fee.student_id}&select=first_name,last_name,parent_phone,parent_name`)
    const student = st.data?.[0]
    if (!student) return
    const token = await receiptToken(env, fee.id)
    const link = `${origin}/quittance/${fee.id}?t=${token}`
    const brand = await getBrand(env)
    const text = `🧾 <b>Paiement confirmé — ${brand.name}</b>\n\nÉlève : <b>${student.first_name} ${student.last_name}</b>\n${fee.label} : <b>${Number(fee.amount)} ${brand.currency}</b>\nPayé le : ${fee.paid_date || new Date().toISOString().slice(0, 10)}\n\n📄 <b>Téléchargez votre quittance :</b>\n<a href="${link}">${link}</a>`
    const r = await sendTelegram(env, student.parent_phone, text)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: fee.student_id, type: 'frais', title: 'Quittance de paiement', message: `Quittance envoyée : ${link}`, recipient: student.parent_phone || student.parent_name, sent_via: 'telegram', status: r.sent ? 'sent' : 'logged' }) })
  } catch (e) { /* non bloquant */ }
}

// Créer notification + envoyer email/SMS selon les paramètres
export async function notifyParent(env: Bindings, studentId: number, type: string, title: string, message: string) {
  const st = await sb(env, `students?id=eq.${studentId}&select=id,first_name,last_name,parent_email,parent_phone,parent_name`)
  const student = st.data?.[0]
  if (!student) return
  const prefs = await getSettings(env, 'notifications')
  const typeKey = type === 'absence' || type === 'retard' ? 'absence' : type === 'frais' ? 'frais' : 'note'
  const results: string[] = []

  // Notification interne (toujours)
  await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_email || student.parent_phone, sent_via: 'app', status: 'sent' }) })

  // Email
  if (prefs[`email_${typeKey}`] !== false && student.parent_email) {
    const brand = await getBrand(env)
    const r = await sendEmail(env, student.parent_email, `[${brand.name}] ${title}`, `<div style="font-family:Arial"><h2 style="color:${brand.color_primary}">${brand.name}</h2><p>Cher(e) ${student.parent_name || 'parent'},</p><p>${message}</p><p style="color:#666;font-size:12px">Élève : ${student.first_name} ${student.last_name}</p></div>`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_email, sent_via: 'email', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`email:${r.sent}`)
  }
  // SMS
  if (prefs[`sms_${typeKey}`] === true && student.parent_phone) {
    const r = await sendSMS(env, student.parent_phone, `${(await getBrand(env)).name}: ${message}`)
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_phone, sent_via: 'sms', status: r.sent ? 'sent' : 'logged' }) })
    results.push(`sms:${r.sent}`)
  }
  // Telegram (gratuit)
  if (prefs[`telegram_${typeKey}`] !== false && student.parent_phone) {
    const r = await sendTelegram(env, student.parent_phone, `🏫 <b>${(await getBrand(env)).name}</b>\n<b>${title}</b>\n${message}\n\nÉlève : ${student.first_name} ${student.last_name}`)
    if (r.sent || r.reason !== 'parent_not_linked') {
      await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({ student_id: studentId, type, title, message, recipient: student.parent_phone, sent_via: 'telegram', status: r.sent ? 'sent' : 'logged' }) })
      results.push(`telegram:${r.sent}`)
    }
  }
  return results
}

// ---------- Notifications ciblées par rôle (cours / événements / examens) ----------
// Matrice de diffusion :
//   cours (courses, interactive_courses) -> élèves + parents + enseignants
//   evenement (events hors examen)       -> parents + enseignants
//   examen (events type=examen)          -> élèves + parents + enseignants
const AUDIENCE: Record<string, string[]> = {
  cours: ['student', 'parent', 'teacher'],
  evenement: ['parent', 'teacher'],
  examen: ['student', 'parent', 'teacher']
}
const TARGETED_TYPES = ['cours', 'evenement', 'examen']

// Notifications historiques (absence/note/frais...) : 1 ligne par élève. Notifications ciblées : 1 ligne par information.
// Retourne false si la migration 0006 n'est pas appliquée (colonne audience absente).
export async function targetedSupported(env: Bindings): Promise<boolean> {
  const probe = await sb(env, 'notifications?select=audience&limit=1')
  return probe.ok
}

export async function broadcastTargeted(env: Bindings, origin: string, opts: { type: string; title: string; message: string; level?: string | null; ref_table: string; ref_id: number; link: string; created_by?: number | null }) {
  const supported = await targetedSupported(env)
  const audience = AUDIENCE[opts.type] || ['parent', 'teacher']
  const level = opts.level || null
  if (supported) {
    await sb(env, 'notifications', { method: 'POST', body: JSON.stringify({
      student_id: null, type: opts.type, title: opts.title, message: opts.message,
      recipient: level ? `Niveau ${level}` : 'Toute l\'école', sent_via: 'app', status: 'sent',
      audience, level, ref_table: opts.ref_table, ref_id: opts.ref_id, link: opts.link, created_by: opts.created_by || null
    }) })
  }
  // Canaux externes (parents uniquement) selon préférences : Telegram par défaut, email optionnel
  if (!audience.includes('parent')) return
  const prefs = await getSettings(env, 'notifications')
  const wantTg = prefs[`telegram_${opts.type}`] !== false
  const wantEmail = prefs[`email_${opts.type}`] === true
  if (!wantTg && !wantEmail) return
  let q = `students?status=eq.actif&select=id,first_name,last_name,parent_name,parent_phone,parent_email`
  if (level) q += `&level=eq.${encodeURIComponent(level)}`
  const st = await sb(env, q)
  const fullLink = `${origin}/${opts.link}`
  const icon = opts.type === 'examen' ? '📝' : opts.type === 'cours' ? '📚' : '📅'
  for (const s of (st.data || []).slice(0, 200)) {
    try {
      if (wantTg && s.parent_phone) {
        await sendTelegram(env, s.parent_phone, `${icon} <b>${opts.title}</b>\n${opts.message}\n\n🔗 <a href="${fullLink}">Ouvrir dans l'application</a>\n\nÉlève : ${s.first_name} ${s.last_name}\n— ${(await getBrand(env)).name}`)
      }
      if (wantEmail && s.parent_email) {
        await sendEmail(env, s.parent_email, `[${(await getBrand(env)).name}] ${opts.title}`, `<div style="font-family:Arial"><h2 style="color:${(await getBrand(env)).color_primary}">${(await getBrand(env)).name}</h2><p>Cher(e) ${s.parent_name || 'parent'},</p><p>${opts.message}</p><p><a href="${fullLink}">Ouvrir dans l'application</a></p><p style="color:#666;font-size:12px">Élève : ${s.first_name} ${s.last_name}</p></div>`)
      }
    } catch (e) { /* non bloquant */ }
  }
}

// Déclencheurs : appelé après création (et pour events, après modification de la date d'un examen)
export async function notifyNewContent(env: Bindings, origin: string, table: string, row: any, user: any, updated = false) {
  if (!row?.id) return
  const fmtDate = (d: string) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) } catch { return d } }
  const lvl = row.level ? ` (${row.level})` : ''
  if (table === 'courses') {
    let sname = ''
    if (row.subject_id) { const s = await sb(env, `subjects?id=eq.${row.subject_id}&select=name`); sname = s.data?.[0]?.name || '' }
    await broadcastTargeted(env, origin, { type: 'cours', title: `Nouveau cours${sname ? ' — ' + sname : ''}${lvl}`, message: `« ${row.title} » est disponible dans Cours & Documents.${row.description ? ' ' + String(row.description).slice(0, 160) : ''}`, level: row.level, ref_table: 'courses', ref_id: Number(row.id), link: `#courses`, created_by: user?.id })
  } else if (table === 'interactive_courses') {
    const typeLabels: Record<string, string> = { quiz: 'Quiz', flashcards: 'Cartes mémoire', fillblank: 'Texte à trous', external: 'Application' }
    await broadcastTargeted(env, origin, { type: 'cours', title: `Nouveau cours interactif${lvl}`, message: `« ${row.title} » (${typeLabels[row.course_type] || 'Quiz'}) est disponible dans Cours interactifs.`, level: row.level, ref_table: 'interactive_courses', ref_id: Number(row.id), link: `#ic-${row.id}`, created_by: user?.id })
  } else if (table === 'events') {
    const isExam = row.type === 'examen'
    const typeLabel: Record<string, string> = { general: 'Événement', examen: 'Examen', vacances: 'Vacances', reunion: 'Réunion', activite: 'Activité' }
    const when = row.end_date && row.end_date !== row.date ? `du ${fmtDate(row.date)} au ${fmtDate(row.end_date)}` : `le ${fmtDate(row.date)}`
    const title = isExam ? (updated ? `Examen — date modifiée${lvl}` : `Examen programmé${lvl}`) : `${typeLabel[row.type] || 'Événement'}${updated ? ' — mis à jour' : ''}${lvl}`
    await broadcastTargeted(env, origin, { type: isExam ? 'examen' : 'evenement', title, message: `« ${row.title} » ${when}.${row.description ? ' ' + String(row.description).slice(0, 160) : ''}`, level: row.level, ref_table: 'events', ref_id: Number(row.id), link: `#calendar`, created_by: user?.id })
  }
}

// Niveaux scolaires visibles par l'utilisateur (parent/élève : niveaux des enfants liés ; enseignant : niveaux de ses élèves affectés)
export async function userLevels(env: Bindings, user: any): Promise<string[] | null> {
  if (user.role === 'admin') return null // tout
  let ids: number[] = []
  if (user.role === 'teacher') { const a = await teacherAssignedIds(env, user); if (a === null) return null; ids = a }
  else ids = linkedIds(user)
  if (!ids.length) return []
  const r = await sb(env, `students?id=in.(${ids.join(',')})&select=level`)
  return Array.from(new Set((r.data || []).map((s: any) => s.level).filter(Boolean)))
}

// Filtre PostgREST des notifications ciblées visibles par l'utilisateur
export async function targetedFilter(env: Bindings, user: any): Promise<string> {
  const lv = await userLevels(env, user)
  let f = `audience=cs.["${user.role}"]`
  if (user.role === 'admin') f = `audience=not.is.null`
  if (lv !== null) {
    if (lv.length) f += `&or=(level.is.null,level.in.(${lv.map(l => `"${l}"`).join(',')}))`
    else f += `&level=is.null`
  }
  return f
}

// Fil de notifications de l'utilisateur connecté : ciblées (par rôle/niveau) + historiques (parents/élèves : leurs enfants ; staff : leurs élèves)
export async function buildFeed(env: Bindings, user: any, limit: number, type: string) {
  const supported = await targetedSupported(env)
  const sel = 'select=id,student_id,type,title,message,recipient,sent_via,status,created_at' + (supported ? ',audience,level,ref_table,ref_id,link,created_by' : '') + ',students(first_name,last_name)'
  const lists: any[][] = []
  // 1) Ciblées
  if (supported && (!type || TARGETED_TYPES.includes(type))) {
    let q = `notifications?${sel}&${await targetedFilter(env, user)}&order=created_at.desc&limit=${limit}`
    if (type) q += `&type=eq.${type}`
    const r = await sb(env, q)
    if (r.ok) lists.push((r.data || []).filter((n: any) => !(n.created_by && Number(n.created_by) === Number(user.id) && user.role !== 'admin')))
  }
  // 2) Historiques (liées à un élève, type != chat)
  if (!type || !TARGETED_TYPES.includes(type)) {
    let ids: number[] | null = null
    if (user.role === 'parent' || user.role === 'student') ids = linkedIds(user)
    else if (user.role === 'teacher') ids = await teacherAssignedIds(env, user)
    if (!(ids && !ids.length)) {
      let q = `notifications?${sel}&type=neq.chat&sent_via=eq.app&order=created_at.desc&limit=${limit}`
      q += supported ? '&audience=is.null' : ''
      if (ids) q += `&student_id=in.(${ids.join(',')})`
      else if (user.role !== 'admin') q += `&student_id=not.is.null`
      if (type) q += `&type=eq.${type}`
      const r = await sb(env, q)
      if (r.ok) lists.push(r.data || [])
    }
  }
  let all = lists.flat().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit)
  // Lu / non lu
  let readSet = new Set<number>()
  if (supported && all.length) {
    const rr = await sb(env, `notification_reads?user_id=eq.${user.id}&notification_id=in.(${all.map(n => n.id).join(',')})&select=notification_id`)
    if (rr.ok) readSet = new Set((rr.data || []).map((x: any) => Number(x.notification_id)))
  }
  // Sans migration 0006 (pas de suivi de lecture), tout est considéré lu pour éviter un compteur figé
  all = all.map(n => ({ ...n, read: supported ? readSet.has(Number(n.id)) : true }))
  return { items: all, unread: all.filter(n => !n.read).length, supported }
}
