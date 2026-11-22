// L2 : tests d'INTÉGRATION de la mécanique de session, avec une base Supabase simulée.
// Contrat vérifié : (a) login pose le cookie HttpOnly et ne renvoie AUCUN jeton dans le corps,
// (b) une requête sans cookie est refusée (401), (c) une session révoquée est refusée (401),
// (d) la déconnexion révoque la session + efface les cookies.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hashPassword } from '../src/lib/crypto'

// ----- Base simulée (PostgREST minimal) -----
type Row = Record<string, any>
const db: { users: Row[]; sessions: Row[]; audit: Row[]; attempts: Row[] } = { users: [], sessions: [], audit: [], attempts: [] }

const matchEq = (row: Row, qs: URLSearchParams) => {
  for (const [k, v] of qs.entries()) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue
    if (v.startsWith('eq.')) { const want = decodeURIComponent(v.slice(3)); if (String(row[k]) !== want) return false }
    else if (v.startsWith('ilike.')) { const want = decodeURIComponent(v.slice(6)).toLowerCase(); if (String(row[k] ?? '').toLowerCase() !== want) return false }
    else if (v === 'is.null') { if (row[k] != null) return false }
    else if (v === 'not.is.null') { if (row[k] == null) return false }
  }
  return true
}

function fakeSb(_env: any, path: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const [tbl, rawQs] = path.split('?')
  const qs = new URLSearchParams(rawQs || '')
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : null
  const store = (db as any)[tbl === 'login_attempts' ? 'attempts' : tbl === 'audit_log' ? 'audit' : tbl === 'user_accounts' ? 'users' : tbl]
  if (!store) return Promise.resolve({ ok: false, status: 404, data: { error: 'table inconnue' } })
  if (method === 'GET') {
    let rows = store.filter((r: Row) => matchEq(r, qs))
    const limit = Number(qs.get('limit') || 0); if (limit) rows = rows.slice(0, limit)
    return Promise.resolve({ ok: true, status: 200, data: rows })
  }
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body]
    const created = rows.map(r => ({ id: String(db.sessions.length + 1), ...r }))
    created.forEach(r => store.push(r))
    return Promise.resolve({ ok: true, status: 201, data: created })
  }
  if (method === 'PATCH') {
    const rows = store.filter((r: Row) => matchEq(r, qs))
    rows.forEach(r => Object.assign(r, body))
    return Promise.resolve({ ok: true, status: 204, data: rows })
  }
  if (method === 'DELETE') {
    const keep = store.filter((r: Row) => !matchEq(r, qs))
    store.length = 0; store.push(...keep)
    return Promise.resolve({ ok: true, status: 204, data: null })
  }
  return Promise.resolve({ ok: true, status: 200, data: null })
}

vi.mock('../src/lib/supabase', () => ({ sb: (env: any, path: string, opts: any) => fakeSb(env, path, opts) }))

const ENV = { SUPABASE_URL: 'https://exemple.test', SUPABASE_SERVICE_KEY: 'cle', JWT_SECRET: 'x'.repeat(40) }
const EMAIL = 'parent@ecole.test'
const PASSWORD = 'motdepasse123'

let app: any

beforeEach(async () => {
  db.users = [{
    id: 7, name: 'Parent Test', email: EMAIL, role: 'parent', status: 'active',
    password_hash: await hashPassword(PASSWORD), linked_student_id: 3, linked_student_ids: [3]
  }]
  db.sessions = []; db.audit = []; db.attempts = []
  if (!app) app = (await import('../src/routes/auth')).default
})

const cookies = (res: Response) => (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [res.headers.get('set-cookie') || '']
const sessCookie = (res: Response) => cookies(res).find(c => c.startsWith('rahma_sess=')) || ''

describe('L2 — connexion : cookie, jamais de jeton dans le corps', () => {
  it('POST /api/auth/login pose un cookie HttpOnly et ne renvoie pas de token', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    }, ENV)
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.token).toBeUndefined()
    expect(body.user.email).toBe(EMAIL)
    const ck = sessCookie(res)
    expect(ck).toContain('rahma_sess=')
    expect(ck.toLowerCase()).toContain('httponly')
    expect(ck).toContain('SameSite=Lax')
    // Un jeton de rafraîchissement et un jeton CSRF lisible sont également posés.
    expect(cookies(res).some(c => c.startsWith('rahma_refresh='))).toBe(true)
    expect(cookies(res).some(c => c.startsWith('rahma_csrf='))).toBe(true)
    expect(db.sessions).toHaveLength(1)
    expect(db.sessions[0].user_id).toBe(7)
  })

  it('le mot de passe n’est jamais renvoyé', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    }, ENV)
    const txt = await res.text()
    expect(txt).not.toContain(PASSWORD)
    expect(txt).not.toContain('password_hash')
  })
})

describe('L2 — requête sans cookie = 401', () => {
  it('GET /api/auth/me sans cookie est refusé', async () => {
    const res = await app.request('/api/auth/me', {}, ENV)
    expect(res.status).toBe(401)
  })

  it('un Bearer fabriqué sans session vivante est refusé', async () => {
    const { sign } = await import('hono/jwt')
    const tok = await sign({ id: 7, role: 'parent', tenant: 'rahma', exp: Math.floor(Date.now() / 1000) + 3600 }, ENV.JWT_SECRET)
    const res = await app.request('/api/auth/me', { headers: { Authorization: 'Bearer ' + tok } }, ENV)
    expect(res.status).toBe(401)
  })
})

describe('L2 — session révoquée = 401', () => {
  const login = async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    }, ENV)
    return sessCookie(res).split(';')[0]
  }

  it('avec le cookie, la session est valide', async () => {
    const cookie = await login()
    const res = await app.request('/api/auth/me', { headers: { Cookie: cookie } }, ENV)
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.user.email).toBe(EMAIL)
  })

  it('après révocation, le même cookie est refusé', async () => {
    const cookie = await login()
    db.sessions[0].revoked_at = new Date().toISOString()
    const res = await app.request('/api/auth/me', { headers: { Cookie: cookie } }, ENV)
    expect(res.status).toBe(401)
  })

  it('la déconnexion révoque la session et efface les cookies', async () => {
    const cookie = await login()
    const res = await app.request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } }, ENV)
    expect(res.status).toBe(200)
    expect(db.sessions[0].revoked_at).toBeTruthy()
    // Les trois cookies sont vidés (Max-Age=0)
    expect(cookies(res).filter(c => c.includes('Max-Age=0')).length).toBe(3)
    const after = await app.request('/api/auth/me', { headers: { Cookie: cookie } }, ENV)
    expect(after.status).toBe(401)
  })
})

describe('L2 — sessions actives', () => {
  it('GET /api/auth/sessions liste l’appareil courant', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/120' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    }, ENV)
    const cookie = sessCookie(res).split(';')[0]
    const list = await app.request('/api/auth/sessions', { headers: { Cookie: cookie } }, ENV)
    expect(list.status).toBe(200)
    const data: any = await list.json()
    expect(data.supported).toBe(true)
    expect(data.items.length).toBe(1)
    expect(data.items[0].current).toBe(true)
    expect(data.items[0].device_label).toContain('Android')
  })

  it('une session appartenant à un autre compte ne peut pas être révoquée par un non-admin', async () => {
    const cookie = (await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    }, ENV).then(r => sessCookie(r))).split(';')[0]
    db.sessions.push({ id: 'etrangere', user_id: 99, tenant: 'rahma', revoked_at: null, expires_at: new Date(Date.now() + 1e7).toISOString() })
    const res = await app.request('/api/auth/sessions/etrangere', { method: 'DELETE', headers: { Cookie: cookie } }, ENV)
    expect(res.status).toBe(403)
    expect(db.sessions.find(s => s.id === 'etrangere')!.revoked_at).toBeNull()
  })
})
