// F74 : Portail d'entrée public (aucune session requise, limité en débit).
//
//   GET  /api/portal/lookup?email=…   → « à quel(s) établissement(s) cet e-mail est-il rattaché ? »
//   POST /api/portal/request          → demande de création d'établissement (file d'attente humaine)
//
// Ce module ne délivre AUCUN secret, ne vérifie AUCUN mot de passe et ne crée AUCUN établissement.
// Voir src/lib/portal.ts pour les invariants.
import { Hono } from 'hono'
import { getBrand } from '../lib/brand'
import { healthNotify } from '../lib/notify'
import { lookupDirectory, normEmail, validateRequest } from '../lib/portal'
import { DEFAULT_TENANT, masterFetch, tenantsSupported } from '../lib/tenant'
import { clientIp, escapeHtml, rateLimit } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// Types d'établissement acceptés dans une demande (miroir de BRAND_TYPES, tolérant)
const REQ_TYPES = ['ecole', 'academie', 'college', 'lycee', 'jardin', 'centre', 'institut', 'universite', 'club', 'autre']

// ---------------------------------------------------------------------------
// 1) Routage par e-mail : quelles portes afficher ?
// ---------------------------------------------------------------------------
app.get('/api/portal/lookup', async (c) => {
  const ip = clientIp(c)
  // 30 recherches / 10 min / IP : suffisant pour un humain, freine l'énumération d'annuaire.
  if (!rateLimit(`portal-lookup:${ip}`, 30, 600_000).ok) {
    return c.json({ error: 'Trop de recherches. Réessayez dans quelques minutes.' }, 429)
  }
  const email = normEmail(c.req.query('email'))
  if (!email) return c.json({ error: 'Adresse e-mail invalide.' }, 400)
  const found = await lookupDirectory(c.env, email)
  let defaultName = DEFAULT_TENANT
  try { defaultName = (await getBrand(c.env)).name || DEFAULT_TENANT } catch {}
  return c.json({
    ok: true,
    email: found.email,
    known: found.known,
    degraded: found.degraded,           // annuaire non installé : l'interface propose la voie de secours
    default_slug: DEFAULT_TENANT,
    default_name: defaultName,
    items: found.items.map(t => ({ slug: t.slug, name: t.name, type: t.type, logo_url: t.logo_url, role: t.role, status: t.status }))
  })
})

// ---------------------------------------------------------------------------
// 2) Demande de création d'établissement (file d'attente, aucune création auto)
// ---------------------------------------------------------------------------
app.post('/api/portal/request', async (c) => {
  const env = c.env
  const ip = clientIp(c)
  if (!rateLimit(`portal-request:${ip}`, 5, 3600_000).ok) {
    return c.json({ error: 'Trop de demandes depuis cette connexion. Réessayez dans une heure.' }, 429)
  }
  const b: any = await c.req.json().catch(() => ({}))
  // Piège à robots : un champ caché rempli ⇒ on répond « ok » sans rien enregistrer.
  if (String(b.website || b.hp || '').trim()) return c.json({ ok: true, queued: true, spam: true })
  if (!(await tenantsSupported(env))) {
    return c.json({ error: "Le registre des établissements n'est pas encore installé sur cette plateforme." }, 503)
  }
  const v = validateRequest(b)
  if ('error' in v) return c.json({ error: v.error }, 400)
  const d = v.value
  if (!REQ_TYPES.includes(d.type)) d.type = 'ecole'

  // Doublon : une demande ouverte pour ce directeur ⇒ réponse neutre (pas d'erreur, pas de doublon)
  try {
    const dup = await masterFetch(env, `tenant_requests?director_email=eq.${encodeURIComponent(d.director_email)}&status=in.(nouvelle,en_cours)&select=id&limit=1`)
    if (dup.ok && (dup.data || []).length) return c.json({ ok: true, queued: true, duplicate: true })
  } catch { /* file indisponible : on tente l'insertion, l'index unique fera le tri */ }

  const row = {
    name: d.name, type: d.type, city: d.city, director_name: d.director_name,
    director_email: d.director_email, phone: d.phone, expected_students: d.expected_students,
    message: d.message, status: 'nouvelle', ip
  }
  const ins = await masterFetch(env, 'tenant_requests', { method: 'POST', body: JSON.stringify(row) })
  if (!ins.ok) {
    // 23505 = violation d'unicité (demande ouverte existante) : ce n'est pas une erreur pour l'utilisateur
    if (String(ins.data?.code || '') === '23505') return c.json({ ok: true, queued: true, duplicate: true })
    return c.json({ error: "L'enregistrement de la demande a échoué. Réessayez dans un instant." }, 500)
  }
  // Notification à l'équipe (best effort, jamais bloquant)
  try {
    await healthNotify(env, `📩 <b>Demande d'établissement</b> : ${escapeHtml(d.name)} (${escapeHtml(d.type)})\nDirecteur : ${escapeHtml(d.director_name)} — ${escapeHtml(d.director_email)}${d.phone ? `\nTéléphone : ${escapeHtml(d.phone)}` : ''}${d.city ? `\nVille : ${escapeHtml(d.city)}` : ''}${d.expected_students ? `\nÉlèves attendus : ${d.expected_students}` : ''}\n\nÀ traiter dans Paramètres → Établissements.`)
  } catch {}
  return c.json({ ok: true, queued: true })
})

export default app
