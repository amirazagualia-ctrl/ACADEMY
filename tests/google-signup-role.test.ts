// F79 : un compte créé via Google peut être Parent, Élève OU Enseignant (et non plus
// « parent » en dur), puis l'enfant est lié par son code élève.
//
// Contrat vérifié ici — ce sont les garanties de sécurité, pas des détails d'implémentation :
//   (a) seules 3 valeurs de rôle sont acceptées, « admin » retombe sur « parent » ;
//   (b) le rôle choisi arrive au callback par le `state` SIGNÉ (non falsifiable) ;
//   (c) le rôle est réellement honoré à la création du compte ;
//   (d) un enseignant est créé INACTIF (Google ne prouve pas la qualité d'enseignant) ;
//   (e) le rôle d'un compte EXISTANT n'est jamais écrasé par le paramètre d'URL ;
//   (f) un code élève valide crée la liaison, un code invalide est ignoré sans bloquer.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------- Base simulée (PostgREST minimal) ----------
type Row = Record<string, any>
const db: { users: Row[]; students: Row[]; teachers: Row[]; audit: Row[]; sessions: Row[]; attempts: Row[] } =
  { users: [], students: [], teachers: [], audit: [], sessions: [], attempts: [] }

const matchEq = (row: Row, qs: URLSearchParams) => {
  for (const [k, v] of qs.entries()) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue
    if (v.startsWith('eq.')) { if (String(row[k]) !== decodeURIComponent(v.slice(3))) return false }
    else if (v.startsWith('ilike.')) { if (String(row[k] ?? '').toLowerCase() !== decodeURIComponent(v.slice(6)).toLowerCase()) return false }
    else if (v === 'is.null') { if (row[k] != null) return false }
  }
  return true
}

function fakeSb(_env: any, path: string, options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const [tbl, rawQs] = path.split('?')
  const qs = new URLSearchParams(rawQs || '')
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : null
  const map: Record<string, keyof typeof db> = { user_accounts: 'users', students: 'students', teachers: 'teachers', audit_log: 'audit', sessions: 'sessions', login_attempts: 'attempts' }
  const store = db[map[tbl]]
  if (!store) return Promise.resolve({ ok: true, status: 200, data: [] })
  if (method === 'GET') return Promise.resolve({ ok: true, status: 200, data: store.filter((r: Row) => matchEq(r, qs)) })
  if (method === 'POST') {
    const rows = (Array.isArray(body) ? body : [body]).map((r: Row) => ({ id: store.length + 1, ...r }))
    rows.forEach(r => store.push(r))
    return Promise.resolve({ ok: true, status: 201, data: rows })
  }
  if (method === 'PATCH') {
    const rows = store.filter((r: Row) => matchEq(r, qs))
    rows.forEach((r: Row) => Object.assign(r, body))
    return Promise.resolve({ ok: true, status: 204, data: rows })
  }
  return Promise.resolve({ ok: true, status: 200, data: null })
}

vi.mock('../src/lib/supabase', () => ({ sb: (env: any, path: string, opts: any) => fakeSb(env, path, opts) }))

const ENV = {
  SUPABASE_URL: 'https://exemple.test', SUPABASE_SERVICE_KEY: 'cle', JWT_SECRET: 'j'.repeat(40),
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret-google'
}

// ---------- Identité Google simulée ----------
let nextGoogle: { email: string; sub?: string; name?: string; verified?: boolean } =
  { email: 'nouveau@ecole.test', sub: 'g-sub-1', name: 'Nouvel Utilisateur' }
// Le `nonce` réel revient DANS l'id_token : le simulacre doit donc renvoyer celui du state.
let currentNonce = ''

function mockGoogle() {
  vi.stubGlobal('fetch', async (url: any) => {
    const u = String(url)
    // ATTENTION : « …/tokeninfo » COMMENCE par « …/token » — tester tokeninfo d'abord.
    if (u.includes('/tokeninfo')) {
      return {
        ok: true, json: async () => ({
          aud: ENV.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com',
          email: nextGoogle.email, sub: nextGoogle.sub || 'g-sub-1',
          name: nextGoogle.name || 'Nouvel Utilisateur',
          email_verified: nextGoogle.verified === false ? 'false' : 'true',
          nonce: currentNonce
        })
      }
    }
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ id_token: 'jeton-google' }) }
    }
    return { ok: false, json: async () => ({}) }
  })
}

let app: any
let studentCode: any

beforeEach(async () => {
  db.users = []; db.students = []; db.teachers = []; db.audit = []; db.sessions = []; db.attempts = []
  nextGoogle = { email: 'nouveau@ecole.test', sub: 'g-sub-1', name: 'Nouvel Utilisateur' }
  mockGoogle()
  const mod = await import('../src/routes/auth')
  app = mod.default
  const notif = await import('../src/lib/notifications')
  studentCode = notif.studentCode
})

const env = (extra: Record<string, any> = {}) => ({ ...ENV, ...extra })

/** Parcourt le départ OAuth → reçoit l'URL Google avec son state → rejoue le callback. */
async function googleSignup(query: string, e = env()) {
  const start = await app.request(`/api/auth/google${query}`, { redirect: 'manual' }, e)
  expect(start.status).toBe(302)
  const state = new URL(start.headers.get('Location')!).searchParams.get('state')!
  expect(state).toBeTruthy()
  // Google renvoie le nonce du state DANS l'id_token : le simulacre doit en faire autant.
  const { verify } = await import('hono/jwt')
  currentNonce = String((await verify(state, ENV.JWT_SECRET, 'HS256') as any).nonce || '')
  const cb = await app.request(`/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, { redirect: 'manual' }, e)
  return { state, location: cb.headers.get('Location') || '', status: cb.status }
}

describe('F79 — valeurs de rôle acceptées', () => {
  it('n’accepte que parent / student / teacher', async () => {
    const { googleSignupRole } = await import('../src/routes/auth')
    for (const ok of ['parent', 'student', 'teacher', 'Teacher', ' STUDENT ']) {
      expect(googleSignupRole(ok)).toBe(ok.trim().toLowerCase())
    }
  })

  it('« admin » et les valeurs inconnues retombent sur parent', async () => {
    const { googleSignupRole } = await import('../src/routes/auth')
    for (const bad of ['admin', 'ADMIN', 'root', '', null, undefined, 'superadmin']) {
      expect(googleSignupRole(bad)).toBe('parent')
    }
  })
})

describe('F79 — le rôle voyage dans le state signé', () => {
  it('le state contient le rôle et le code élève demandés', async () => {
    const { verify } = await import('hono/jwt')
    const start = await app.request('/api/auth/google?role=student&code=rcf-12-abcd', { redirect: 'manual' }, env())
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!
    const st: any = await verify(state, ENV.JWT_SECRET, 'HS256')
    expect(st.role).toBe('student')
    expect(st.code).toBe('RCF-12-ABCD')
  })

  it('un state bricolé (signature invalide) est rejeté', async () => {
    const cb = await app.request('/api/auth/google/callback?code=abc&state=forgefaux', { redirect: 'manual' }, env())
    expect(cb.headers.get('Location')).toContain('google_error=')
    expect(db.users.length).toBe(0)
  })

  it('un « ret » externe ne produit pas de redirection ouverte', async () => {
    const start = await app.request('/api/auth/google?ret=//attaquant.example/x', { redirect: 'manual' }, env())
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!
    const { verify } = await import('hono/jwt')
    const st: any = await verify(state, ENV.JWT_SECRET, 'HS256')
    expect(st.ret).toBe('/')
  })
})

describe('F79 — création du compte Google selon le rôle', () => {
  it('rôle parent → compte actif, rôle parent', async () => {
    await googleSignup('?role=parent')
    expect(db.users.length).toBe(1)
    expect(db.users[0].role).toBe('parent')
    expect(db.users[0].status).toBe('active')
    expect(db.users[0].auth_provider).toBe('google')
  })

  it('rôle élève → compte actif, rôle student', async () => {
    await googleSignup('?role=student')
    expect(db.users[0].role).toBe('student')
    expect(db.users[0].status).toBe('active')
  })

  it('rôle enseignant → compte INACTIF (validation admin requise)', async () => {
    nextGoogle = { email: 'prof@ecole.test', sub: 'g-prof', name: 'Prof Test' }
    const r = await googleSignup('?role=teacher&subject=Fran%C3%A7ais')
    expect(db.users[0].role).toBe('teacher')
    expect(db.users[0].status).toBe('inactive')
    // La fiche `teachers` est créée avec la matière et rattachée au compte
    expect(db.teachers.length).toBe(1)
    expect(db.teachers[0].subject).toBe('Français')
    expect(db.users[0].linked_teacher_id).toBe(db.teachers[0].id)
    // Aucune session n'est ouverte tant que l'administration n'a pas validé
    expect(db.sessions.length).toBe(0)
    expect(r.location).toContain('google_error=')
  })

  it('« role=admin » ne crée JAMAIS un administrateur', async () => {
    await googleSignup('?role=admin')
    expect(db.users[0].role).toBe('parent')
  })

  it('un email Google non vérifié est refusé', async () => {
    nextGoogle = { email: 'nonverifie@ecole.test', sub: 'g-x', verified: false }
    const r = await googleSignup('?role=parent')
    expect(db.users.length).toBe(0)
    expect(r.location).toContain('google_error=')
  })
})

describe('F79 — le rôle d’un compte existant n’est pas écrasé', () => {
  it('un enseignant existant qui revient par Google avec ?role=parent reste enseignant', async () => {
    db.users.push({ id: 1, name: 'Prof Existant', email: 'prof@ecole.test', role: 'teacher', status: 'active', linked_student_ids: [] })
    nextGoogle = { email: 'prof@ecole.test', sub: 'g-prof-2', name: 'Prof Existant' }
    await googleSignup('?role=parent')
    expect(db.users.length).toBe(1)
    expect(db.users[0].role).toBe('teacher')
  })
})

describe('F79 — liaison de l’enfant par code élève', () => {
  it('un code valide rattache l’élève au compte créé', async () => {
    db.students.push({ id: 12, first_name: 'Ali', last_name: 'Ben Salah', status: 'actif' })
    const code = await studentCode(env(), 12)
    await googleSignup(`?role=parent&code=${encodeURIComponent(code)}`)
    expect(db.users[0].linked_student_ids).toEqual([12])
    expect(db.users[0].linked_student_id).toBe(12)
  })

  it('le code est accepté sans préfixe et sans tirets', async () => {
    db.students.push({ id: 12, first_name: 'Ali', last_name: 'Ben Salah', status: 'actif' })
    const code: string = await studentCode(env(), 12)
    const compact = code.replace(/-/g, '')
    await googleSignup(`?role=student&code=${encodeURIComponent(compact)}`)
    expect(db.users[0].linked_student_ids).toEqual([12])
  })

  it('un code invalide ne bloque pas la création et le signale', async () => {
    const r = await googleSignup('?role=parent&code=RCF-99-ZZZZ')
    expect(db.users.length).toBe(1)
    expect(db.users[0].linked_student_ids).toEqual([])
    expect(r.location).toContain('google_warn=code')
  })

  it('un élève inactif n’est pas rattaché', async () => {
    db.students.push({ id: 15, first_name: 'Inactif', last_name: 'Test', status: 'inactif' })
    const code = await studentCode(env(), 15)
    const r = await googleSignup(`?role=parent&code=${encodeURIComponent(code)}`)
    expect(db.users[0].linked_student_ids).toEqual([])
    expect(r.location).toContain('google_warn=code')
  })

  it('aucun doublon quand l’élève est déjà lié', async () => {
    db.students.push({ id: 12, first_name: 'Ali', last_name: 'Ben Salah', status: 'actif' })
    db.users.push({ id: 1, name: 'Parent', email: 'nouveau@ecole.test', role: 'parent', status: 'active', linked_student_ids: [12] })
    const code = await studentCode(env(), 12)
    await googleSignup(`?role=parent&code=${encodeURIComponent(code)}`)
    expect(db.users[0].linked_student_ids).toEqual([12])
  })
})
