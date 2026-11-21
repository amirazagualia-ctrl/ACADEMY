// F71 : routes d'édition d'établissement.
// GET  /api/admin/editions → catalogue (demo / test / complete) + édition courante
// PUT  /api/admin/edition  → change l'édition de l'établissement (admin uniquement)
//
// Cette route est la SEULE écriture autorisée en édition démo (voir edition-rules.ts) :
// sans elle, un établissement passé en démo ne pourrait plus jamais revenir en « complete ».
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { getSettings, sb } from '../lib/supabase'
import { brandInvalidate } from '../lib/brand'
import { editionInvalidate, getEdition, listEditions, publicEdition } from '../lib/edition'
import { normalizeEditionCode } from '../lib/edition-rules'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/admin/editions', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  try {
    const [editions, current] = await Promise.all([listEditions(c.env), getEdition(c.env)])
    return c.json({ editions, current: publicEdition(current) })
  } catch {
    const current = await getEdition(c.env, true)
    return c.json({ editions: await listEditions(c.env), current: publicEdition(current) })
  }
})

app.put('/api/admin/edition', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (user.role !== 'admin') return c.json({ error: "Accès refusé : seul un administrateur peut changer l'édition" }, 403)

  const body = await c.req.json().catch(() => ({}))
  const code = normalizeEditionCode(body?.edition_code ?? body?.code)

  const prev = await getSettings(c.env, 'school')
  if (prev?.edition_code === code) {
    const same = await getEdition(c.env, true)
    return c.json({ ok: true, unchanged: true, current: publicEdition(same) })
  }

  const next = { ...(prev || {}), edition_code: code }
  const r = await sb(c.env, 'settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'school', value: next })
  })
  if (!r.ok) return c.json({ error: "Enregistrement de l'édition impossible", detail: r.data }, 500)

  editionInvalidate()
  brandInvalidate()
  const current = await getEdition(c.env, true)
  await audit(c.env, c, user, 'update', 'settings', 'school', { edition_code: prev?.edition_code || null }, { edition_code: code })
  return c.json({ ok: true, current: publicEdition(current) })
})

export default app
