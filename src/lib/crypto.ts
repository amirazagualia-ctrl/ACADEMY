// Primitives crypto (hash mots de passe PBKDF2, SHA-256, base64, codes documents)
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.

export const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u as ArrayBuffer)))
export const unb64 = (s: string) => Uint8Array.from(atob(s), ch => ch.charCodeAt(0))

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
// ---------- Mots de passe : PBKDF2-SHA256 (100 000 itérations, sel aléatoire 16 octets) ----------
// Format stocké : pbkdf2$<iterations>$<sel_hex>$<hash_hex>. Les anciens hash SHA-256 (sel fixe) sont
// encore vérifiés et migrés de façon transparente à la prochaine connexion réussie.
const PBKDF2_ITER = 100000
const toHex = (buf: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(buf as ArrayBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) => new Uint8Array((h.match(/.{1,2}/g) || []).map(x => parseInt(x, 16)))
async function pbkdf2Hex(password: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as ArrayBuffer, iterations: iter }, key, 256)
  return toHex(bits)
}
export async function hashPassword(p: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${PBKDF2_ITER}$${toHex(salt)}$${await pbkdf2Hex(p, salt, PBKDF2_ITER)}`
}
const legacyHash = (p: string) => sha256Hex('edusalt::' + p)
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
// Vérifie un mot de passe ; retourne { ok, needsUpgrade } (needsUpgrade = ancien format à migrer)
export async function verifyPassword(p: string, stored: string): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false }
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, hash] = stored.split('$')
    const h = await pbkdf2Hex(p, fromHex(salt), Number(iter) || PBKDF2_ITER)
    return { ok: safeEqual(h, hash), needsUpgrade: Number(iter) < PBKDF2_ITER }
  }
  const ok = safeEqual(await legacyHash(p), stored)
  return { ok, needsUpgrade: ok }
}

// ---------- Code élève : identifiant + code de liaison sécurisé ----------
// Format : RCF-<id>-<4 caractères> (dérivé cryptographiquement, impossible à deviner)
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function b64url(buf: ArrayBuffer | Uint8Array) { return btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
export async function sha256Bytes(data: Uint8Array) { const h = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('') }
export function docCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(12)); let s = ''; for (let i = 0; i < 12; i++) s += a[r[i] % a.length]; return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` }
