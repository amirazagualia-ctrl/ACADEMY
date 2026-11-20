// Routes brand
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser } from '../lib/auth'
import { BRAND_DEFAULTS, BRAND_TYPES, LEVEL_PRESETS, TYPE_PRESET, brandInvalidate, getBrand, normalizeScheme } from '../lib/brand'
import { getSettings, sb } from '../lib/supabase'
import { resolveTenant, tenantCtx, tenantSlug } from '../lib/tenant'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- F62 : API identité de l'établissement ----------
// Lecture publique (page d'accueil, PWA, pages publiques) — aucune donnée sensible
app.get('/api/brand', async (c) => {
  const b = await getBrand(c.env)
  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ ...b, types: BRAND_TYPES, presets: Object.fromEntries(Object.entries(LEVEL_PRESETS).map(([k, v]) => [k, { label: v.label, cycles: v.cycles, levels: v.levels }])), type_preset: TYPE_PRESET, defaults: { name: BRAND_DEFAULTS.name, logo_url: BRAND_DEFAULTS.logo_url } })
})
// Écriture (admin) : fusionne avec l'existant, valide les couleurs, invalide le cache
app.put('/api/admin/brand', async (c) => {
  const user = await getUser(c)
  if (user?.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json()
  const hex = (v: any, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d)
  const str = (v: any, max = 200) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, max))
  const prev = await getSettings(c.env, 'school')
  const next: any = { ...prev }
  // logo_url et favicon_url : 500 car. (URL R2 du bucket branding) ; icônes PWA générées côté client
  for (const k of ['name', 'name_ar', 'short_name', 'tagline', 'tagline_ar', 'logo_url', 'logo_light_url', 'favicon_url', 'icon_192_url', 'icon_512_url', 'icon_maskable_url', 'apple_touch_url', 'address', 'address_ar', 'phone', 'email', 'website', 'country', 'currency', 'currency_ar', 'locale', 'director', 'director_title', 'legal_id', 'legal_text', 'doc_prefix']) {
    const v = str(b[k], k === 'legal_text' ? 2000 : ['logo_url', 'logo_light_url', 'favicon_url', 'icon_192_url', 'icon_512_url', 'icon_maskable_url', 'apple_touch_url'].includes(k) ? 500 : 300)
    if (v !== undefined) next[k] = v
  }
  if (b.type && BRAND_TYPES[b.type]) next.type = b.type
  if (b.color_primary !== undefined) next.color_primary = hex(b.color_primary, BRAND_DEFAULTS.color_primary)
  if (b.color_accent !== undefined) next.color_accent = hex(b.color_accent, BRAND_DEFAULTS.color_accent)
  if (b.color_dark !== undefined) next.color_dark = hex(b.color_dark, BRAND_DEFAULTS.color_dark)
  // F67 : palette nommée — clé courte alphanumérique (les teintes vivent dans theme-palettes.js)
  if (b.color_palette !== undefined) next.color_palette = /^[a-z][a-z0-9_-]{0,23}$/.test(String(b.color_palette)) ? String(b.color_palette) : ''
  if (b.registration_fee !== undefined) next.registration_fee = Math.max(0, Number(b.registration_fee) || 0)
  if (b.social && typeof b.social === 'object') next.social = { ...(prev.social || {}), ...Object.fromEntries(Object.entries(b.social).map(([k, v]) => [k, str(v, 300) || ''])) }
  if (b.landing && typeof b.landing === 'object') next.landing = { ...(prev.landing || {}), ...b.landing }
  if (b.levels !== undefined) {
    if (b.levels === null || b.levels === '') delete next.levels
    else if (typeof b.levels === 'object' && b.levels.preset && !b.levels.levels && LEVEL_PRESETS[b.levels.preset]) next.levels = { preset: b.levels.preset }
    else { const sch = normalizeScheme(b.levels); if (!sch) return c.json({ error: 'Structure des niveaux invalide : au moins un cycle et un niveau (code + libellé) rattaché à un cycle existant' }, 400); next.levels = sch }
  }
  if (b.modules && typeof b.modules === 'object') next.modules = { ...(prev.modules || {}), ...Object.fromEntries(Object.entries(b.modules).map(([k, v]) => [k, !!v])) }
  // Nom court : suit le nom si non saisi explicitement (ou s'il valait l'ancien nom)
  if (!b.short_name || b.short_name === prev.name || b.short_name === prev.short_name && b.name !== prev.name && prev.short_name === prev.name) next.short_name = next.name
  if (!next.name) return c.json({ error: "Le nom de l'établissement est obligatoire" }, 400)
  const r = await sb(c.env, 'settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' }, body: JSON.stringify({ key: 'school', value: next }) })
  if (!r.ok) return c.json({ error: 'Enregistrement impossible', detail: r.data }, 500)
  brandInvalidate()
  await audit(c.env, c, user, 'update', 'settings', 'school', prev, next)
  return c.json({ ok: true, brand: await getBrand(c.env, true) })
})
// Manifest PWA dynamique — UNE application installable PAR ÉTABLISSEMENT.
// Sur une origine unique, c'est le champ `id` (identifiant de l'app) qui distingue deux installations :
// `/` pour l'établissement par défaut, `/e/<slug>` pour les autres. Le `start_url` ouvre directement
// le bon établissement (cookie posé par /e/:slug), et les icônes viennent du logo téléversé.
app.get('/manifest.json', async (c) => {
  const t = await resolveTenant(c)
  return tenantCtx.run(t, async () => {
    const b = await getBrand(c.env)
    const slug = tenantSlug()
    const isDefault = !t || t.isDefault
    const appId = isDefault ? '/' : `/e/${slug}`
    const startUrl = isDefault ? '/' : `/e/${slug}`
    const fallback = [
      { src: '/static/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/static/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
    const custom = !!b.logo_url && b.logo_url !== BRAND_DEFAULTS.logo_url
    // Icônes générées depuis le logo (client) ; à défaut, le logo ; à défaut, les icônes par défaut.
    const icons = (custom || b.icon_512_url)
      ? [
          { src: b.icon_192_url || b.logo_url, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: b.icon_512_url || b.logo_url, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: b.icon_maskable_url || b.icon_512_url || b.logo_url, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      : fallback
    c.header('Cache-Control', 'public, max-age=60')
    return c.json({
      id: appId,
      name: `${b.name} - ${b.tagline}`,
      short_name: b.short_name || b.name,
      description: `${b.name} : élèves, présence, notes, bulletins, frais, cours et notifications.`,
      start_url: startUrl,
      scope: '/',
      display: 'standalone',
      display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
      orientation: 'any',
      lang: b.locale === 'ar' ? 'ar' : 'fr',
      dir: b.locale === 'ar' ? 'rtl' : 'ltr',
      background_color: b.color_dark,
      theme_color: b.color_dark,
      categories: ['education', 'productivity'],
      prefer_related_applications: false,
      icons,
      shortcuts: [
        { name: 'Tableau de bord', url: `${startUrl}#dashboard` },
        { name: 'Présence', url: `${startUrl}#attendance` },
        { name: 'Inscription', url: isDefault ? '/inscription' : `/e/${slug}#inscription` }
      ]
    })
  })
})

export default app
