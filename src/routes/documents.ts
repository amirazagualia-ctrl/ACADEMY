// Routes documents
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getTeacherId, getUser } from '../lib/auth'
import { BRAND_DEFAULTS, getBrand } from '../lib/brand'
import type { Brand } from '../lib/brand'
import { docCode, sha256Bytes } from '../lib/crypto'
import { currentYear, sb } from '../lib/supabase'
import { TC, cfg } from '../lib/tenant'
import { publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Upload fichiers (photos élèves & cours) vers Supabase Storage ----------
// ---------- F60 : Upload sécurisé — filigrane serveur (PDF), empreinte SHA-256, registre d'authenticité, droits d'auteur ----------
// (per-tenant) let _docRegSupported: { ok: boolean; at: number } | null = null
async function docRegSupported(env: Bindings) {
  if (TC._docRegSupported && (TC._docRegSupported.ok || Date.now() - TC._docRegSupported.at < 300000)) return TC._docRegSupported.ok
  const p = await sb(env, 'document_registry?select=id&limit=1'); TC._docRegSupported = { ok: p.ok, at: Date.now() }; return p.ok
}
// Logo du filigrane : logo officiel « Rahma Academy » (public/static/logo-rahma.png), repli sur la copie Supabase
const WM_LOGO_URLS = ['/static/logo-rahma.png', 'https://nxtyizeoypolvrfhulpk.supabase.co/storage/v1/object/public/photos/logo-rahma.png']
// (per-tenant) let _wmLogoBytes: ArrayBuffer | null = null
// (per-tenant) let _wmLogoKey = ''
// F62 : le logo du filigrane est celui de l'établissement (brand.logo_url), repli sur le logo par défaut
async function wmLogoBytes(origin?: string, logoUrl?: string) {
  const key = logoUrl || ''
  if (TC._wmLogoBytes && TC._wmLogoKey === key) return TC._wmLogoBytes
  TC._wmLogoBytes = null; TC._wmLogoKey = key
  for (const u of [...(logoUrl ? [logoUrl] : []), ...WM_LOGO_URLS]) { try { const r = await fetch(u.startsWith('/') ? `${origin || ''}${u}` : u); if (r.ok) { TC._wmLogoBytes = await r.arrayBuffer(); break } } catch {} }
  return TC._wmLogoBytes
}
// QR code minimal (via API publique d'image) évité : on imprime l'URL de vérification + code en clair, lisible et vérifiable
async function watermarkPdfServer(bytes: Uint8Array, meta: { owner: string; code: string; verifyUrl: string; year: string; origin?: string; brand?: Brand }) {
  const BN = meta.brand?.name || BRAND_DEFAULTS.name
  const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib')
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const font = await pdf.embedFont(StandardFonts.HelveticaBold); const fontR = await pdf.embedFont(StandardFonts.Helvetica)
  const logoB = await wmLogoBytes(meta.origin, meta.brand?.logo_url && meta.brand.logo_url !== BRAND_DEFAULTS.logo_url ? meta.brand.logo_url : undefined); let logo: any = null
  if (logoB) { const u8 = new Uint8Array(logoB); try { logo = (u8[0] === 0x89 && u8[1] === 0x50) ? await pdf.embedPng(logoB) : await pdf.embedJpg(logoB) } catch { try { logo = await pdf.embedPng(logoB) } catch {} } }
  const copyright = `© ${meta.year} ${BN} — ${meta.owner}. Tous droits réservés. Reproduction et diffusion interdites sans autorisation.`
  const auth = `Document authentifié · Code ${meta.code} · Vérifier : ${meta.verifyUrl}`
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    // Logo central très transparent
    if (logo) { const lw = width * 0.55, lh = logo.height * lw / logo.width; page.drawImage(logo, { x: (width - lw) / 2, y: (height - lh) / 2, width: lw, height: lh, opacity: 0.12 }) }
    // Texte diagonal répété (anti-copie)
    const diag = `${BN.toUpperCase()} · ${meta.owner} · ${meta.code}`; const fs = Math.max(14, Math.min(26, width / 22))
    for (let y = -height * 0.2; y < height * 1.2; y += 140) for (let x = -width * 0.2; x < width * 1.2; x += 320) page.drawText(diag, { x, y, size: fs, font, color: rgb(0.2, 0.3, 0.5), opacity: 0.07, rotate: degrees(30) })
    // Bandeau pied de page : copyright + authentification
    page.drawRectangle({ x: 0, y: 0, width, height: 22, color: rgb(0.97, 0.97, 0.98), opacity: 0.9 })
    const s1 = Math.min(7.5, (width - 20) / (copyright.length * 0.5)); page.drawText(copyright, { x: 10, y: 12.5, size: s1, font: fontR, color: rgb(0.25, 0.25, 0.3) })
    const s2 = Math.min(7, (width - 20) / (auth.length * 0.5)); page.drawText(auth, { x: 10, y: 4, size: s2, font: fontR, color: rgb(0.1, 0.35, 0.65) })
  }
  pdf.setTitle(pdf.getTitle() || `Document ${BN}`); pdf.setAuthor(meta.owner); pdf.setProducer(`${BN} — filigrane & authentification`); pdf.setCreator('Rahma Academy')
  pdf.setSubject(`Code d'authentification ${meta.code} — ${meta.verifyUrl}`); pdf.setKeywords([BN, 'copyright', meta.code])
  return await pdf.save({ useObjectStreams: false })
}
app.post('/api/upload/:bucket', async (c) => {
  const user = await getUser(c)
  const bucket = c.req.param('bucket')
  if (!['photos', 'courses', 'homeworks', 'branding'].includes(bucket)) return c.json({ error: 'Bucket invalide' }, 400)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (bucket === 'branding' && user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (bucket !== 'homeworks' && !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  const b = await c.req.json() // { filename, contentType, data(base64), client_watermarked?, sha256_original? }
  if (bucket === 'homeworks') {
    if (!/^(application\/pdf|image\/(jpeg|png|webp)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(b.contentType || '')) return c.json({ error: 'Format non autorisé (PDF, JPG, PNG, WEBP, DOCX)' }, 400)
    if ((b.data || '').length * 0.75 > 10 * 1024 * 1024) return c.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, 400)
  }
  let bin = Uint8Array.from(atob(b.data), ch => ch.charCodeAt(0))
  const shaOriginal = b.sha256_original || await sha256Bytes(bin)
  const safe = (b.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
  const storeBucket = bucket === 'branding' ? 'photos' : bucket
  const path = bucket === 'branding' ? `branding/${Date.now()}_${safe}` : `${Date.now()}_${safe}`
  const { url, key } = cfg(c.env)
  const code = docCode(); const verifyUrl = `${publicOrigin(c)}/verifier/${code}`
  const year = (await currentYear(c.env)) || String(new Date().getFullYear())
  const brandUp = await getBrand(c.env)
  let ownerName = user.name || user.email || brandUp.name; let teacherId: number | null = null
  if (user.role === 'teacher') { try { teacherId = await getTeacherId(c.env, user); if (teacherId) { const t = (await sb(c.env, `teachers?id=eq.${teacherId}&select=first_name,last_name`)).data?.[0]; if (t) ownerName = `${t.first_name} ${t.last_name}` } } catch {} }
  const isPdf = (b.contentType === 'application/pdf') || /\.pdf$/i.test(safe)
  const isImg = /^image\//.test(b.contentType || '')
  let watermarked = !!b.client_watermarked
  // Filigrane serveur systématique pour les PDF (le client peut avoir échoué : PDF protégé, hors-ligne, SW…)
  if (isPdf && !(bucket === 'homeworks' && user.role !== 'admin' && user.role !== 'teacher')) {
    try { bin = (await watermarkPdfServer(bin, { owner: ownerName, code, verifyUrl, year, origin: publicOrigin(c), brand: brandUp })) as typeof bin; watermarked = true } catch (e: any) { console.warn('Filigrane PDF serveur impossible', e?.message) }
  }
  // Images : filigrane visuel appliqué côté client (canvas) ; le serveur l'exige pour les cours (documents pédagogiques)
  if (isImg && bucket === 'courses' && !watermarked) return c.json({ error: 'Filigrane requis : l\'image n\'a pas pu être filigranée dans le navigateur. Réessayez (connexion) ou convertissez en PDF.' }, 422)
  const res = await fetch(`${url}/storage/v1/object/${storeBucket}/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': b.contentType || 'application/octet-stream', 'x-upsert': 'false' },
    body: bin
  })
  if (!res.ok) return c.json({ error: 'Erreur upload', detail: await res.text() }, 500)
  const publicUrl = `${url}/storage/v1/object/public/${storeBucket}/${path}`
  const sha = await sha256Bytes(bin)
  let registered = false
  if (bucket !== 'branding' && await docRegSupported(c.env)) {
    const row = { code, bucket, path, url: publicUrl, filename: b.filename || safe, content_type: b.contentType || null, size_bytes: bin.length, sha256: sha, sha256_original: shaOriginal, watermarked, owner_user_id: user.id, owner_name: ownerName, owner_role: user.role, teacher_id: teacherId, school_year: year }
    const r = await sb(c.env, 'document_registry', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }); registered = r.ok
  }
  await audit(c.env, c, user, 'upload', bucket, null, null, { path, code, sha256: sha, watermarked, size: bin.length })
  return c.json({ url: publicUrl, path, code, verify_url: verifyUrl, sha256: sha, watermarked, registered, owner: ownerName })
})
// Vérification publique d'un document (par code imprimé, ou par empreinte SHA-256 du fichier)
app.get('/api/public/verify/:code', async (c) => {
  if (!(await docRegSupported(c.env))) return c.json({ error: 'Registre indisponible' }, 503)
  const code = String(c.req.param('code') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
  const q = /^[a-f0-9]{64}$/i.test(c.req.param('code')) ? `sha256=eq.${c.req.param('code').toLowerCase()}` : `code=eq.${code}`
  const r = await sb(c.env, `document_registry?${q}&select=code,bucket,filename,content_type,size_bytes,sha256,watermarked,owner_name,owner_role,license,school_year,created_at`)
  const d = r.data?.[0]
  if (!d) return c.json({ valid: false })
  return c.json({ valid: true, ...d })
})
// Enregistrement d'un fichier déjà existant (régularisation de documents antérieurs)
app.get('/api/admin/documents', async (c) => {
  const user = await getUser(c); if (!user || !['admin', 'teacher'].includes(user.role)) return c.json({ error: 'Accès refusé' }, 403)
  if (!(await docRegSupported(c.env))) return c.json({ supported: false, items: [] })
  let q = 'document_registry?select=*&order=created_at.desc&limit=500'
  if (user.role === 'teacher') q += `&owner_user_id=eq.${user.id}`
  const r = await sb(c.env, q); return c.json({ supported: true, items: r.data || [] })
})
// Régulariser : télécharge chaque fichier référencé (courses / evaluations) non encore au registre, le filigrane (PDF) et le ré-enregistre
app.post('/api/admin/documents/regularize', async (c) => {
  const user = await getUser(c); if (!user || user.role !== 'admin') return c.json({ error: 'Accès refusé' }, 403)
  if (!(await docRegSupported(c.env))) return c.json({ error: 'Exécutez d\'abord migrations/0018_document_registry.sql' }, 503)
  const { url, key } = cfg(c.env); const year = (await currentYear(c.env)) || String(new Date().getFullYear())
  const known = new Set(((await sb(c.env, 'document_registry?select=url')).data || []).map((x: any) => x.url))
  const courses = (await sb(c.env, 'courses?select=id,title,file_url,file_name,file_type,teacher_id,teachers(first_name,last_name)&file_url=not.is.null&deleted_at=is.null')).data || []
  const limit = Math.min(Number(c.req.query('limit')) || 10, 25); let done = 0, skipped = 0; const errors: string[] = []
  for (const co of courses) {
    if (done >= limit) break
    if (!co.file_url || known.has(co.file_url)) { skipped++; continue }
    try {
      const m = String(co.file_url).match(/\/object\/public\/([^/]+)\/(.+)$/); if (!m) { skipped++; continue }
      const [, bucket, path] = m
      const fr = await fetch(co.file_url); if (!fr.ok) { errors.push(`${co.id}: fichier introuvable`); continue }
      let bin = new Uint8Array(await fr.arrayBuffer()); const shaOriginal = await sha256Bytes(bin)
      const owner = co.teachers ? `${co.teachers.first_name} ${co.teachers.last_name}` : (await getBrand(c.env)).name
      const code = docCode(); const verifyUrl = `${publicOrigin(c)}/verifier/${code}`
      const isPdf = (co.file_type === 'application/pdf') || /\.pdf$/i.test(path); let watermarked = false
      if (isPdf) { try { bin = (await watermarkPdfServer(bin, { owner, code, verifyUrl, year, origin: publicOrigin(c), brand: await getBrand(c.env) })) as typeof bin; watermarked = true } catch (e: any) { errors.push(`${co.id}: ${e?.message}`) } }
      if (watermarked) {
        const up = await fetch(`${url}/storage/v1/object/${bucket}/${decodeURIComponent(path)}`, { method: 'PUT', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': co.file_type || 'application/pdf', 'x-upsert': 'true' }, body: bin })
        if (!up.ok) { errors.push(`${co.id}: réécriture refusée`); continue }
      }
      const sha = await sha256Bytes(bin)
      await sb(c.env, 'document_registry', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ code, bucket, path: decodeURIComponent(path), url: co.file_url, filename: co.file_name || path, content_type: co.file_type || null, size_bytes: bin.length, sha256: sha, sha256_original: shaOriginal, watermarked, owner_user_id: user.id, owner_name: owner, owner_role: 'teacher', teacher_id: co.teacher_id || null, school_year: year }) })
      known.add(co.file_url); done++
    } catch (e: any) { errors.push(`${co.id}: ${e?.message}`) }
  }
  await audit(c.env, c, user, 'regularize', 'document_registry', null, null, { done, skipped, errors: errors.length })
  return c.json({ ok: true, done, skipped, remaining: courses.filter((x: any) => x.file_url && !known.has(x.file_url)).length, errors })
})

export default app
