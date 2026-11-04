// Routes certificates
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser, linkedIds, teacherAssignedIds } from '../lib/auth'
import { BRAND_DEFAULTS } from '../lib/brand'
import { sha256Hex } from '../lib/crypto'
import { activeYear, getSettings, sb } from '../lib/supabase'
import { TC, cfg } from '../lib/tenant'
import { frDate, publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Certificats & attestations (PDF filigrané + QR de vérification) ----------
// (per-tenant) let _certSupported: { ok: boolean; at: number } | null = null
async function certSupported(env: Bindings) {
  if (TC._certSupported && (TC._certSupported.ok || Date.now() - TC._certSupported.at < 300000)) return TC._certSupported.ok
  const p = await sb(env, 'certificates?select=id&limit=1&deleted_at=is.null'); TC._certSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
export const CERT_LEVELS: Record<string, string> = { '1AP': '1ère année primaire', '2AP': '2ème année primaire', '3AP': '3ème année primaire', '4AP': '4ème année primaire', '5AP': '5ème année primaire', '6AP': '6ème année primaire', '7AB': '7ème année de base', '8AB': '8ème année de base', '9AB': '9ème année de base', '1AS': '1ère année secondaire', '2AS': '2ème année secondaire', '3AS': '3ème année secondaire', '4AS': '4ème année secondaire' }
const CERT_TYPES: Record<string, { title: string; prefix: string }> = {
  scolarite: { title: 'ATTESTATION DE SCOLARITÉ', prefix: 'ATS' },
  presence: { title: 'ATTESTATION DE PRÉSENCE', prefix: 'ATP' },
  reussite: { title: 'ATTESTATION DE RÉUSSITE', prefix: 'ATR' },
  inscription: { title: 'ATTESTATION D\u2019INSCRIPTION', prefix: 'ATI' },
  conduite: { title: 'CERTIFICAT DE BONNE CONDUITE', prefix: 'CBC' },
  autre: { title: 'ATTESTATION', prefix: 'ATT' }
}
function certBody(type: string, st: any, school: any, yr: string, extra: any) {
  const civ = st.gender === 'F' ? 'l\u2019élève' : 'l\u2019élève'
  const born = st.birth_date ? `, né${st.gender === 'F' ? 'e' : ''} le ${frDate(st.birth_date)}` : ''
  const lvl = CERT_LEVELS[st.level] || ((TC._brandCache?.value as any)?.scheme?.levels || []).find((l: any) => l.code === st.level)?.label || st.level
  const cls = st.class_name ? ` (classe ${st.class_name})` : ''
  const who = `${civ} ${st.first_name} ${st.last_name}${born}`
  const dir = `Je soussigné(e), ${extra?.signer || school.director_title || 'le Directeur'} de ${school.name || BRAND_DEFAULTS.name}, certifie que`
  switch (type) {
    case 'scolarite': return `${dir} ${who} est régulièrement inscrit${st.gender === 'F' ? 'e' : ''} dans notre établissement en ${lvl}${cls} pour l\u2019année scolaire ${yr}, et y suit assidûment les cours.`
    case 'presence': return `${dir} ${who}, inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls}, a été présent${st.gender === 'F' ? 'e' : ''} dans notre établissement${extra?.from && extra?.to ? ` du ${frDate(extra.from)} au ${frDate(extra.to)}` : ` durant l\u2019année scolaire ${yr}`}${extra?.presence_rate != null ? `, avec un taux de présence de ${extra.presence_rate} %${extra.absences != null ? ` (${extra.absences} absence(s))` : ''}` : ''}.`
    case 'reussite': return `${dir} ${who}, inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls} pour l\u2019année scolaire ${yr}, a satisfait aux exigences de son niveau${extra?.average != null ? ` avec une moyenne générale de ${Number(extra.average).toFixed(2)}/20${extra?.mention ? ` (mention ${extra.mention})` : ''}` : ''}${extra?.next_level ? ` et est admis${st.gender === 'F' ? 'e' : ''} en ${CERT_LEVELS[extra.next_level] || extra.next_level}` : ''}.`
    case 'inscription': return `${dir} ${who} est inscrit${st.gender === 'F' ? 'e' : ''} dans notre établissement en ${lvl}${cls} pour l\u2019année scolaire ${yr}.`
    case 'conduite': return `${dir} ${who}, inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls} pour l\u2019année scolaire ${yr}, a fait preuve d\u2019une bonne conduite et n\u2019a fait l\u2019objet d\u2019aucune sanction disciplinaire.`
    default: return extra?.custom_body || `${dir} ${who} est inscrit${st.gender === 'F' ? 'e' : ''} en ${lvl}${cls} pour l\u2019année scolaire ${yr}.`
  }
}
async function certToken(env: Bindings, number: string) { return (await sha256Hex(`certificat::${cfg(env).jwt}::${number}`)).slice(0, 20) }

// Émettre un certificat (admin) : figé + numéroté + jeton de vérification
app.post('/api/certificates', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!(await certSupported(c.env))) return c.json({ error: 'Module certificats non installé (migration 0012)' }, 501)
  const b = await c.req.json().catch(() => ({}))
  const type = CERT_TYPES[b.type] ? b.type : 'autre'
  const sid = Number(b.student_id)
  const st = (await sb(c.env, `students?id=eq.${sid}&select=*`)).data?.[0]
  if (!st) return c.json({ error: 'Élève introuvable' }, 404)
  const yr = b.school_year || activeYear() || TC._currentYearCache?.label || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
  const school = await getSettings(c.env, 'school')
  const extra = b.extra || {}
  // Présence : calcul automatique si période fournie et taux absent
  if (type === 'presence' && extra.from && extra.to && extra.presence_rate == null) {
    const at = await sb(c.env, `attendance?student_id=eq.${sid}&date=gte.${extra.from}&date=lte.${extra.to}&select=status&school_year=eq.${yr}`)
    const rows = at.data || []; const abs = rows.filter((r: any) => r.status === 'absent').length
    if (rows.length) { extra.presence_rate = Math.round((rows.length - abs) * 100 / rows.length); extra.absences = abs; extra.days = rows.length }
  }
  const title = b.title || CERT_TYPES[type].title
  const body = (b.body && String(b.body).trim()) || certBody(type, st, school, yr, extra)
  // Numéro séquentiel par année : PREFIX-YYYY-NNNNN
  const y = new Date().getFullYear()
  const last = (await sb(c.env, `certificates?number=like.${CERT_TYPES[type].prefix}-${y}-*&select=number&order=number.desc&limit=1&deleted_at=not.is.null`)).data?.[0]?.number
  const last2 = (await sb(c.env, `certificates?number=like.${CERT_TYPES[type].prefix}-${y}-*&select=number&order=number.desc&limit=1`)).data?.[0]?.number
  const seq = Math.max(Number((last || '').split('-').pop() || 0), Number((last2 || '').split('-').pop() || 0)) + 1
  const number = `${CERT_TYPES[type].prefix}-${y}-${String(seq).padStart(5, '0')}`
  const verify_token = await certToken(c.env, number)
  const fingerprint = await sha256Hex(`${number}|${sid}|${title}|${body}`)
  const row = { number, type, student_id: sid, school_year: yr, title, body, extra, issued_by: user.id, issued_by_name: user.name || null, verify_token, fingerprint }
  const r = await sb(c.env, 'certificates', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return c.json({ error: r.data?.message || 'Erreur' }, 500)
  const cert = Array.isArray(r.data) ? r.data[0] : r.data
  await audit(c.env, c, user, 'issue_certificate', 'certificates', cert.id, null, { number, type, student_id: sid })
  return c.json({ ok: true, certificate: { ...cert, students: st, school, verify_url: `${publicOrigin(c)}/verifier/${number}?t=${verify_token}` } })
})
// Liste (admin) / par élève (staff + famille)
app.get('/api/certificates', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await certSupported(c.env))) return c.json({ supported: false, items: [] })
  const sid = c.req.query('student_id')
  let q = `certificates?select=*,students(first_name,last_name,level,class_name)&order=issued_at.desc&limit=300`
  if (['parent', 'student'].includes(user.role)) { const ids = linkedIds(user); if (!ids.length) return c.json({ supported: true, items: [] }); q += `&student_id=in.(${ids.join(',')})&revoked_at=is.null` }
  else if (user.role === 'teacher') { const aids = await teacherAssignedIds(c.env, user); if (aids !== null) q += `&student_id=in.(${aids.length ? aids.join(',') : 0})` }
  if (sid) q += `&student_id=eq.${Number(sid)}`
  const r = await sb(c.env, q)
  const origin = publicOrigin(c)
  const items = (r.data || []).map((x: any) => ({ ...x, verify_url: `${origin}/verifier/${x.number}?t=${x.verify_token}` }))
  return c.json({ supported: true, items })
})
// Révoquer (admin)
app.post('/api/certificates/:id/revoke', async (c) => {
  const user = await getUser(c)
  if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const id = Number(c.req.param('id')); const b = await c.req.json().catch(() => ({}))
  const before = (await sb(c.env, `certificates?id=eq.${id}&select=*`)).data?.[0]
  if (!before) return c.json({ error: 'Introuvable' }, 404)
  const r = await sb(c.env, `certificates?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_reason: (b.reason || '').slice(0, 300) || null }) })
  if (!r.ok) return c.json({ error: 'Erreur' }, 500)
  await audit(c.env, c, user, 'revoke_certificate', 'certificates', id, before, { revoked_reason: b.reason })
  return c.json({ ok: true })
})
// Vérification publique (QR) : ne dévoile que le strict nécessaire
app.get('/api/public/verify/:number', async (c) => {
  const number = c.req.param('number'); const t = c.req.query('t') || ''
  if (!/^[A-Z]{3}-\d{4}-\d{5}$/.test(number) || t !== await certToken(c.env, number)) return c.json({ valid: false, error: 'Lien de vérification invalide' }, 403)
  const r = await sb(c.env, `certificates?number=eq.${number}&select=number,type,title,school_year,issued_at,issued_by_name,revoked_at,revoked_reason,fingerprint,students(first_name,last_name,level)`)
  const cert = r.data?.[0]
  if (!cert) return c.json({ valid: false, error: 'Document introuvable ou supprimé' }, 404)
  const school = await getSettings(c.env, 'school')
  return c.json({ valid: !cert.revoked_at, number: cert.number, title: cert.title, type: cert.type, school_year: cert.school_year, issued_at: cert.issued_at, issued_by: cert.issued_by_name, revoked_at: cert.revoked_at, revoked_reason: cert.revoked_reason, fingerprint: cert.fingerprint, student: `${cert.students?.first_name || ''} ${cert.students?.last_name || ''}`.trim(), level: CERT_LEVELS[cert.students?.level] || cert.students?.level, school: school.name || BRAND_DEFAULTS.name })
})

export default app
