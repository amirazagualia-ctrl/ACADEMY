// F75 : invitations — liens d'activation à usage unique (jamais de mot de passe par e-mail).
//
// Invariants :
//   1. Aucun mot de passe ne transite par e-mail : on envoie un LIEN, le destinataire choisit le sien.
//   2. Le jeton n'est jamais stocké en clair — seule son empreinte SHA-256 est conservée.
//   3. Un jeton est lié à UN établissement et UNE adresse : il ne peut pas servir ailleurs.
//   4. Un jeton expiré ou déjà utilisé est refusé (usage unique).
//   5. Une invitation ne crée aucun établissement et ne touche à aucune donnée métier
//      avant l'acceptation effective.
import { b64url, hashPassword, sha256Hex } from './crypto'
import { sb } from './supabase'
import { masterFetch, tenantCtx } from './tenant'
import type { TenantCfg } from './tenant'
import type { Bindings } from '../types/bindings'

export const INVITE_ROLES = ['admin', 'teacher', 'parent', 'student'] as const
export type InviteRole = typeof INVITE_ROLES[number]
export const INVITE_PURPOSES = ['invite', 'reset'] as const
export type InvitePurpose = typeof INVITE_PURPOSES[number]
export const INVITE_TTL_DAYS = 7
export const MIN_PASSWORD = 8

export type Invitation = {
  id: number; token_hash: string; tenant: string; email: string; name: string | null
  role: string; purpose: string; created_by: string | null
  created_at: string; expires_at: string; used_at: string | null
}

/** Nouveau jeton opaque (32 octets d'entropie, base64url : sûr dans une URL). */
export function newToken(): string { return b64url(crypto.getRandomValues(new Uint8Array(32))) }

/** Empreinte stockée en base — le jeton lui-même n'est jamais persisté. */
export function hashToken(token: string): Promise<string> { return sha256Hex(String(token || '')) }

/**
 * Un jeton est utilisable si : présent, non utilisé, non expiré.
 * Logique PURE (aucun accès base) → testable sur des dates fixes.
 */
export function invitationUsable(row: Pick<Invitation, 'used_at' | 'expires_at'> | null | undefined, now: number = Date.now()): boolean {
  if (!row) return false
  if (row.used_at) return false
  if (!row.expires_at) return false
  const exp = new Date(row.expires_at).getTime()
  if (!Number.isFinite(exp)) return false
  return exp > now
}

/** Vérifie la robustesse minimale d'un mot de passe choisi par l'utilisateur. */
export function validatePassword(p: any): { error: string } | { value: string } {
  const v = String(p ?? '')
  if (v.length < MIN_PASSWORD) return { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.` }
  if (v.length > 200) return { error: 'Le mot de passe est trop long (200 caractères maximum).' }
  if (!/[a-zA-Z]/.test(v)) return { error: 'Ajoutez au moins une lettre.' }
  if (!/[0-9]/.test(v)) return { error: 'Ajoutez au moins un chiffre.' }
  return { value: v }
}

/** Échappement sûr aussi dans un attribut HTML (guillemets inclus). */
export function escAttr(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ---------------------------------------------------------------------------
// E-mail d'invitation (rendu PUR : testable sans réseau)
// ---------------------------------------------------------------------------
export type InviteEmailInput = {
  brandName: string; brandColor?: string; inviteeName?: string | null
  email: string; tenantName: string; url: string; purpose?: string
  invitedBy?: string | null; expiresDays?: number
}

export function buildInviteEmail(i: InviteEmailInput): { subject: string; html: string; text: string } {
  const reset = i.purpose === 'reset'
  const brand = i.brandName || 'Rahma Academy'
  const days = i.expiresDays || INVITE_TTL_DAYS
  const hello = i.inviteeName ? `Bonjour ${escAttr(i.inviteeName)},` : 'Bonjour,'
  const subject = reset
    ? `Réinitialisation de votre mot de passe — ${brand}`
    : `Votre accès à ${i.tenantName} — ${brand}`
  const intro = reset
    ? `Vous avez demandé à réinitialiser le mot de passe de votre compte sur <b>${escAttr(i.tenantName)}</b>.`
    : `Un espace vous a été créé sur <b>${escAttr(i.tenantName)}</b>.`
  const action = reset ? 'Choisir un nouveau mot de passe' : 'Activer mon accès'
  const colour = i.brandColor || '#2563eb'
  const html = `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="background:${escAttr(colour)};padding:20px 24px;color:#ffffff;font-size:18px;font-weight:bold">${escAttr(brand)}</td></tr>
    <tr><td style="padding:24px;color:#0f172a;font-size:15px;line-height:1.6">
      <p style="margin:0 0 12px">${hello}</p>
      <p style="margin:0 0 12px">${intro}</p>
      <p style="margin:0 0 20px">Cliquez sur le bouton ci-dessous pour choisir votre mot de passe. Ce lien ne fonctionne <b>qu'une seule fois</b> et expire dans <b>${days} jours</b>.</p>
      <p style="margin:0 0 24px;text-align:center">
        <a href="${escAttr(i.url)}" style="display:inline-block;background:${escAttr(colour)};color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:9px">${action}</a>
      </p>
      <p style="margin:0 0 6px;font-size:12px;color:#64748b">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
      <p style="margin:0 0 20px;font-size:12px;color:#334155;word-break:break-all">${escAttr(i.url)}</p>
      <p style="margin:0;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px">
        Ce message a été envoyé à <b>${escAttr(i.email)}</b>. Si vous n'êtes pas à l'origine de cette demande, ignorez-le : aucun mot de passe ne peut être changé sans ouvrir ce lien.
      </p>
    </td></tr>
    <tr><td style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:11px">${escAttr(brand)} — message automatique, merci de ne pas répondre.${i.invitedBy ? ` Invitation émise par ${escAttr(i.invitedBy)}.` : ''}</td></tr>
  </table>
</td></tr></table></body></html>`
  const text = [
    hello, '',
    reset ? `Réinitialisez votre mot de passe sur ${i.tenantName}.` : `Un espace vous a été créé sur ${i.tenantName}.`,
    '', `Ouvrez ce lien (usage unique, valable ${days} jours) :`, i.url,
    '', `Message destiné à ${i.email}. Si vous n'êtes pas concerné, ignorez-le.`, `— ${brand}`
  ].join('\n')
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Persistance (base MAÎTRE)
// ---------------------------------------------------------------------------
let _invSupported: { ok: boolean; at: number } | null = null

/** La table des invitations existe-t-elle ? (migration 0023 appliquée) */
export async function invitationsSupported(env: Bindings, force = false): Promise<boolean> {
  if (!force && _invSupported && Date.now() - _invSupported.at < 300000) return _invSupported.ok
  let ok = false
  try { const r = await masterFetch(env, 'tenant_invitations?select=id&limit=1'); ok = r.ok } catch { ok = false }
  _invSupported = { ok, at: Date.now() }
  return ok
}

/**
 * Émet (ou réémet) une invitation. Une seule invitation vivante par (établissement, e-mail) :
 * la précédente est supprimée — un lien réémis doit invalider l'ancien.
 * Retourne le JETON EN CLAIR (une seule fois, pour l'e-mail) : il n'est jamais relisible ensuite.
 */
export async function issueInvitation(env: Bindings, opts: {
  tenant: string; email: string; role?: string; name?: string | null
  purpose?: string; createdBy?: string | null; ip?: string | null
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!(await invitationsSupported(env))) return { ok: false, error: "Table des invitations absente : appliquez migrations/0023_invitations.sql sur la base maître." }
  const tenant = String(opts.tenant || '').toLowerCase().trim()
  const email = String(opts.email || '').toLowerCase().trim()
  if (!tenant) return { ok: false, error: 'Établissement manquant.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Adresse e-mail invalide.' }
  const role = INVITE_ROLES.includes(opts.role as InviteRole) ? opts.role! : 'admin'
  const purpose = INVITE_PURPOSES.includes(opts.purpose as InvitePurpose) ? opts.purpose! : 'invite'
  // Un seul lien vivant : l'ancien est supprimé (jamais marqué « utilisé », pour ne pas mentir dans l'historique)
  try { await masterFetch(env, `tenant_invitations?tenant=eq.${encodeURIComponent(tenant)}&email=eq.${encodeURIComponent(email)}&used_at=is.null`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }) } catch {}
  const token = newToken()
  const token_hash = await hashToken(token)
  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString()
  const row = {
    token_hash, tenant, email, role, purpose,
    name: opts.name ? String(opts.name).slice(0, 80) : null,
    created_by: opts.createdBy || null, expires_at: expires, ip: opts.ip || null
  }
  const r = await masterFetch(env, 'tenant_invitations', { method: 'POST', body: JSON.stringify(row) })
  if (!r.ok) return { ok: false, error: 'Enregistrement de l’invitation impossible.' }
  return { ok: true, token }
}

/** Retrouve une invitation à partir du jeton en clair, sans jamais exposer l'empreinte au client. */
export async function findInvitation(env: Bindings, token: any): Promise<{ row: Invitation | null; usable: boolean; reason?: string }> {
  const t = String(token || '').trim()
  if (!t || t.length < 20 || t.length > 200) return { row: null, usable: false, reason: 'lien invalide' }
  if (!(await invitationsSupported(env))) return { row: null, usable: false, reason: 'invitations non installées' }
  const h = await hashToken(t)
  let row: Invitation | null = null
  try {
    const r = await masterFetch(env, `tenant_invitations?token_hash=eq.${encodeURIComponent(h)}&select=*&limit=1`)
    row = ((r.data || [])[0] || null) as Invitation | null
  } catch { return { row: null, usable: false, reason: 'erreur de lecture' } }
  if (!row) return { row: null, usable: false, reason: 'introuvable' }
  if (row.used_at) return { row, usable: false, reason: 'déjà utilisé' }
  if (!invitationUsable(row)) return { row, usable: false, reason: 'expiré' }
  return { row, usable: true }
}

/**
 * Consomme l'invitation (usage unique) : marque `used_at`.
 * Renvoie false si elle a été consommée entre-temps par une autre requête (course) —
 * l'appelant doit alors refuser, sinon un lien pourrait servir deux fois.
 */
export async function consumeInvitation(env: Bindings, row: Invitation): Promise<boolean> {
  try {
    const r = await masterFetch(env, `tenant_invitations?id=eq.${row.id}&used_at=is.null`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) })
    return r.ok && Array.isArray(r.data) && r.data.length > 0
  } catch { return false }
}

/**
 * Rend de nouveau utilisable une invitation consommée.
 * Appelé UNIQUEMENT si l'application du mot de passe a échoué (base de l'établissement
 * momentanément injoignable) : brûler un lien valide à cause d'une panne transitoire
 * obligerait à en réémettre un alors que rien n'a été modifié.
 */
export async function releaseInvitation(env: Bindings, id: number): Promise<void> {
  try { await masterFetch(env, `tenant_invitations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ used_at: null }) }) } catch {}
}

/** Crée ou met à jour le compte dans la base de l'ÉTABLISSEMENT de l'invitation. */
export async function applyInvitation(env: Bindings, tcfg: TenantCfg, row: Invitation, password: string): Promise<{ ok: boolean; created?: boolean; userId?: number | null; error?: string }> {
  const run = <T,>(fn: () => Promise<T>): Promise<T | null> => tenantCtx.run(tcfg, fn).catch(() => null)
  const existing = await run(() => sb(env, `user_accounts?email=ilike.${encodeURIComponent(row.email)}&select=id,role,status&limit=1`))
  if (!existing?.ok) return { ok: false, error: "Base de l'établissement injoignable." }
  const u = (existing.data || [])[0]
  const hash = await hashPassword(password)
  if (u) {
    // Réinitialisation : on ne change JAMAIS le rôle d'un compte existant (aucune promotion implicite).
    const r = await run(() => sb(env, `user_accounts?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ password_hash: hash, status: 'active' }) }))
    if (!r?.ok) return { ok: false, error: 'Mise à jour du compte impossible.' }
    return { ok: true, created: false, userId: u.id }
  }
  // purpose=reset sur un compte inexistant : on refuse, plutôt que de créer un compte inattendu.
  if (row.purpose === 'reset') return { ok: false, error: 'Aucun compte ne correspond à cette adresse dans cet établissement.' }
  const payload: any = {
    name: row.name || row.email.split('@')[0], email: row.email, password_hash: hash,
    role: INVITE_ROLES.includes(row.role as InviteRole) ? row.role : 'admin', status: 'active'
  }
  const r = await run(() => sb(env, 'user_accounts', { method: 'POST', body: JSON.stringify(payload) }))
  if (!r?.ok) return { ok: false, error: 'Création du compte impossible.' }
  return { ok: true, created: true, userId: r.data?.[0]?.id ?? null }
}
