// F73 L5 : provisionnement des données de départ d'un établissement.
//
// GET  /api/admin/provision → état de la base + profil proposé par l'édition + aperçu du jeu
// POST /api/admin/provision → applique le jeu de données (admin de l'établissement)
//
// Sécurité : non destructif. Si la base contient déjà des élèves, rien n'est inséré.
// En édition démo (lecture seule), l'écriture est refusée en amont par edition-rules.ts.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { getEdition, publicEdition } from '../lib/edition'
import { buildSeed, applySeed, normalizeProfile, profileLabel, seedState, seedSummary, SEED_PROFILES } from '../lib/seed'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

async function adminOnly(c: any) {
  const user = await getUser(c)
  if (!user) return { error: c.json({ error: 'Non authentifié' }, 401) }
  if (user.role !== 'admin') return { error: c.json({ error: "Accès refusé : seul un administrateur peut provisionner l'établissement" }, 403) }
  return { user }
}

app.get('/api/admin/provision', async (c) => {
  const gate = await adminOnly(c)
  if (gate.error) return gate.error

  const [edition, state] = await Promise.all([getEdition(c.env), seedState(c.env)])
  const suggested = normalizeProfile(edition.seed_profile)

  return c.json({
    edition: publicEdition(edition),
    empty: state.empty,
    counts: state.counts,
    error: state.error || null,
    suggested,
    // Aperçu sans écrire : ce que produirait chaque profil sur une base vierge.
    profiles: SEED_PROFILES.map(code => ({
      code,
      label: profileLabel(code),
      summary: seedSummary(buildSeed(code))
    }))
  })
})

app.post('/api/admin/provision', async (c) => {
  const gate = await adminOnly(c)
  if (gate.error) return gate.error

  const body = await c.req.json().catch(() => ({}))
  // Le profil demandé prime ; à défaut on suit l'édition de l'établissement.
  const edition = await getEdition(c.env)
  const profile = normalizeProfile(body?.profile ?? edition.seed_profile)

  if (profile === 'none') {
    return c.json({ ok: true, applied: false, profile, reason: 'Profil « none » : aucune donnée à insérer.' })
  }

  const state = await seedState(c.env)
  if (state.error) return c.json({ error: state.error }, 400)
  if (!state.empty) {
    return c.json(
      {
        error: 'Cet établissement contient déjà des données : le provisionnement ne modifie jamais une base en service.',
        counts: state.counts
      },
      409
    )
  }

  const result = await applySeed(c.env, profile)
  if (result.error) return c.json({ error: result.error, counts: result.counts }, 400)

  await audit(c.env, c, gate.user, 'provision', 'settings', 'seed', null, {
    profile,
    applied: result.applied,
    counts: result.counts
  })

  return c.json({ ok: true, ...result })
})

export default app
