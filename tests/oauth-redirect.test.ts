// F78 : tests de la résolution de l'origine publique et de l'URI de redirection OAuth.
//
// Défaut corrigé : l'URI était déduite de l'en-tête `Host`, donc elle variait selon la porte
// d'entrée (pages.dev, sandbox, domaine personnalisé, /e/<slug>). Google exige une URI FIXE
// et renvoyait : « Vous ne pouvez pas vous connecter à cette appli, car elle ne respecte pas
// le règlement OAuth 2.0 de Google » (redirect_uri_mismatch).
import { describe, expect, it } from 'vitest'
import { publicOrigin } from '../src/lib/utils'
import { DEFAULT_PUBLIC_ORIGIN, googleRedirectUri, isLocalOrigin } from '../src/routes/auth'

/** Faux contexte Hono : url + en-têtes + env. */
function ctx(url: string, headers: Record<string, string> = {}, env: Record<string, any> = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { req: { url, header: (n: string) => h[String(n).toLowerCase()] }, env }
}

describe('publicOrigin — déduction par défaut', () => {
  it('utilise l’en-tête Host et https hors localhost', () => {
    expect(publicOrigin(ctx('https://rahma-academy.pages.dev/api/x')))
      .toBe('https://rahma-academy.pages.dev')
  })

  it('force http sur localhost et 127.0.0.1', () => {
    expect(publicOrigin(ctx('http://localhost:3000/api/x'))).toBe('http://localhost:3000')
    expect(publicOrigin(ctx('http://127.0.0.1:3000/api/x'))).toBe('http://127.0.0.1:3000')
  })

  it('respecte X-Forwarded-Proto derrière un proxy', () => {
    expect(publicOrigin(ctx('http://interne/api/x', { 'X-Forwarded-Proto': 'https' })))
      .toBe('https://interne')
  })
})

describe('publicOrigin — origine épinglée (PUBLIC_ORIGIN)', () => {
  it('ignore le Host quand PUBLIC_ORIGIN est défini', () => {
    const c = ctx('https://sandbox-xyz.novita.ai/api/x', {}, { PUBLIC_ORIGIN: 'https://rahma-academy.pages.dev' })
    expect(publicOrigin(c)).toBe('https://rahma-academy.pages.dev')
  })

  it('retire les barres obliques finales', () => {
    const c = ctx('https://x/api', {}, { PUBLIC_ORIGIN: 'https://rahma-academy.pages.dev/' })
    expect(publicOrigin(c)).toBe('https://rahma-academy.pages.dev')
  })

  it('ignore une valeur vide ou blanche et retombe sur la déduction', () => {
    expect(publicOrigin(ctx('https://a.pages.dev/x', {}, { PUBLIC_ORIGIN: '' }))).toBe('https://a.pages.dev')
    expect(publicOrigin(ctx('https://a.pages.dev/x', {}, { PUBLIC_ORIGIN: '   ' }))).toBe('https://a.pages.dev')
  })
})

describe('googleRedirectUri — URI stable exigée par Google', () => {
  it('produit la même URI depuis n’importe quelle porte d’entrée quand l’origine est épinglée', () => {
    const env = { PUBLIC_ORIGIN: 'https://rahma-academy.pages.dev' }
    const a = googleRedirectUri(ctx('https://rahma-academy.pages.dev/api/auth/google', {}, env))
    const b = googleRedirectUri(ctx('https://sandbox.novita.ai/api/auth/google', {}, env))
    const c = googleRedirectUri(ctx('https://ecole.exemple.tn/api/auth/google', {}, env))
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBe('https://rahma-academy.pages.dev/api/auth/google/callback')
  })

  it('privilégie GOOGLE_REDIRECT_URI quand elle est fournie, telle quelle', () => {
    const c = ctx('https://sandbox.novita.ai/api/auth/google', {}, {
      PUBLIC_ORIGIN: 'https://rahma-academy.pages.dev',
      GOOGLE_REDIRECT_URI: 'https://login.rahma.tn/api/auth/google/callback'
    })
    expect(googleRedirectUri(c)).toBe('https://login.rahma.tn/api/auth/google/callback')
  })

  it('SANS aucune configuration, retombe sur l’origine codée en dur — l’URI ne peut plus diverger', () => {
    // C'est le cœur du correctif : avant F78, ces trois portes d'entrée produisaient trois
    // URI différentes et Google refusait deux d'entre elles (redirect_uri_mismatch).
    const a = googleRedirectUri(ctx('https://rahma-academy.pages.dev/api/auth/google'))
    const b = googleRedirectUri(ctx('https://sandbox.novita.ai/api/auth/google'))
    const c = googleRedirectUri(ctx('https://ecole.exemple.tn/api/auth/google'))
    expect(a).toBe('https://rahma-academy.pages.dev/api/auth/google/callback')
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(a).toBe(`${DEFAULT_PUBLIC_ORIGIN}/api/auth/google/callback`)
  })

  it('un Host étranger ne peut pas détourner l’URI de production', () => {
    // Garde-fou : même atteint par un domaine inconnu, le serveur annonce l'URI déclarée.
    const uri = googleRedirectUri(ctx('https://attaquant.example/api/auth/google'))
    expect(uri).toBe('https://rahma-academy.pages.dev/api/auth/google/callback')
    expect(uri).not.toContain('attaquant.example')
  })

  it('en local, produit une URI http://localhost utilisable en développement', () => {
    expect(googleRedirectUri(ctx('http://localhost:3000/api/auth/google')))
      .toBe('http://localhost:3000/api/auth/google/callback')
    expect(googleRedirectUri(ctx('http://127.0.0.1:8788/api/auth/google')))
      .toBe('http://127.0.0.1:8788/api/auth/google/callback')
  })

  it('le développement local n’est pas confondu avec un domaine public trompeur', () => {
    // « localhost.attaquant.example » ne doit PAS être reconnu comme du développement local.
    expect(isLocalOrigin('http://localhost:3000')).toBe(true)
    expect(isLocalOrigin('http://127.0.0.1:8788')).toBe(true)
    expect(isLocalOrigin('https://localhost.attaquant.example')).toBe(false)
    expect(isLocalOrigin('https://notlocalhost.example')).toBe(false)
    expect(isLocalOrigin('https://rahma-academy.pages.dev')).toBe(false)
  })
})
