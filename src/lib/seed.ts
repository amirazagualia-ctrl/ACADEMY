// F73 L5 : données de départ d'un établissement (provisionnement).
// Le profil vient de l'édition choisie (migrations/0020_editions.sql → editions.seed_profile) :
//   demo     → jeu de démonstration complet (élèves, notes, présences, frais, devoirs)
//   minimal  → socle réel minimal (enseignants, classes, élèves) sans historique
//   none     → aucune donnée (édition « complete » : l'école saisit tout elle-même)
//
// Règle de sécurité : on n'insère JAMAIS dans une base qui contient déjà des élèves.
// Le provisionnement est donc idempotent et non destructif — un second appel ne fait rien.
import { sb } from './supabase'
import type { Bindings } from '../types/bindings'

export type SeedProfile = 'none' | 'minimal' | 'demo'
export const SEED_PROFILES: SeedProfile[] = ['none', 'minimal', 'demo']

/** Profil inconnu / absent → 'none' : on n'invente jamais de données. */
export function normalizeProfile(p: any): SeedProfile {
  const v = String(p ?? '').trim().toLowerCase()
  return (SEED_PROFILES as string[]).includes(v) ? (v as SeedProfile) : 'none'
}

export function profileLabel(p: SeedProfile): string {
  return { none: 'Aucune donnée', minimal: 'Socle minimal', demo: 'Démonstration' }[p] || p
}

// ---------- Jeux de données (purs, testables sans base) ----------
export type SeedTeacher = { first_name: string; last_name: string; email: string; subject: string; cycles: string }
export type SeedClass = { name: string; level: string; capacity: number; room: string; teacherIdx: number }
export type SeedStudent = { first_name: string; last_name: string; level: string; cycle: string; gender: string; classIdx: number; parent_name: string; parent_phone: string; parent_email: string }

const TEACHERS: SeedTeacher[] = [
  { first_name: 'Sonia', last_name: 'Ben Salah', email: 'sonia.bensalah@ecole.example', subject: 'Mathématiques', cycles: 'primaire' },
  { first_name: 'Karim', last_name: 'Trabelsi', email: 'karim.trabelsi@ecole.example', subject: 'Français', cycles: 'primaire' },
  { first_name: 'Ines', last_name: 'Gharbi', email: 'ines.gharbi@ecole.example', subject: 'Arabe', cycles: 'primaire' },
  { first_name: 'Mehdi', last_name: 'Ayari', email: 'mehdi.ayari@ecole.example', subject: 'Éveil scientifique', cycles: 'primaire' }
]

const CLASSES: SeedClass[] = [
  { name: '3AP-A', level: '3AP', capacity: 25, room: 'Salle 1', teacherIdx: 0 },
  { name: '4AP-A', level: '4AP', capacity: 25, room: 'Salle 2', teacherIdx: 1 },
  { name: '5AP-A', level: '5AP', capacity: 30, room: 'Salle 3', teacherIdx: 2 }
]

const STUDENTS: SeedStudent[] = [
  { first_name: 'Yassine', last_name: 'Ben Amor', level: '3AP', cycle: 'primaire', gender: 'M', classIdx: 0, parent_name: 'Hatem Ben Amor', parent_phone: '+21620000001', parent_email: 'hatem.benamor@example.tn' },
  { first_name: 'Mariem', last_name: 'Chaabane', level: '3AP', cycle: 'primaire', gender: 'F', classIdx: 0, parent_name: 'Leila Chaabane', parent_phone: '+21620000002', parent_email: 'leila.chaabane@example.tn' },
  { first_name: 'Adam', last_name: 'Bouazizi', level: '3AP', cycle: 'primaire', gender: 'M', classIdx: 0, parent_name: 'Nizar Bouazizi', parent_phone: '+21620000003', parent_email: 'nizar.bouazizi@example.tn' },
  { first_name: 'Lina', last_name: 'Ferchichi', level: '3AP', cycle: 'primaire', gender: 'F', classIdx: 0, parent_name: 'Amel Ferchichi', parent_phone: '+21620000004', parent_email: 'amel.ferchichi@example.tn' },
  { first_name: 'Ilyes', last_name: 'Jebali', level: '4AP', cycle: 'primaire', gender: 'M', classIdx: 1, parent_name: 'Sami Jebali', parent_phone: '+21620000005', parent_email: 'sami.jebali@example.tn' },
  { first_name: 'Nour', last_name: 'Haddad', level: '4AP', cycle: 'primaire', gender: 'F', classIdx: 1, parent_name: 'Rym Haddad', parent_phone: '+21620000006', parent_email: 'rym.haddad@example.tn' },
  { first_name: 'Rayan', last_name: 'Msakni', level: '4AP', cycle: 'primaire', gender: 'M', classIdx: 1, parent_name: 'Walid Msakni', parent_phone: '+21620000007', parent_email: 'walid.msakni@example.tn' },
  { first_name: 'Sarra', last_name: 'Khemiri', level: '4AP', cycle: 'primaire', gender: 'F', classIdx: 1, parent_name: 'Dorra Khemiri', parent_phone: '+21620000008', parent_email: 'dorra.khemiri@example.tn' },
  { first_name: 'Aziz', last_name: 'Riahi', level: '5AP', cycle: 'primaire', gender: 'M', classIdx: 2, parent_name: 'Mohamed Riahi', parent_phone: '+21620000009', parent_email: 'mohamed.riahi@example.tn' },
  { first_name: 'Yasmine', last_name: 'Sassi', level: '5AP', cycle: 'primaire', gender: 'F', classIdx: 2, parent_name: 'Hela Sassi', parent_phone: '+21620000010', parent_email: 'hela.sassi@example.tn' },
  { first_name: 'Bilel', last_name: 'Ouali', level: '5AP', cycle: 'primaire', gender: 'M', classIdx: 2, parent_name: 'Anis Ouali', parent_phone: '+21620000011', parent_email: 'anis.ouali@example.tn' },
  { first_name: 'Eya', last_name: 'Zouari', level: '5AP', cycle: 'primaire', gender: 'F', classIdx: 2, parent_name: 'Sana Zouari', parent_phone: '+21620000012', parent_email: 'sana.zouari@example.tn' }
]

export type SeedPlan = {
  profile: SeedProfile
  teachers: SeedTeacher[]
  classes: SeedClass[]
  students: SeedStudent[]
  /** true → historique complet (notes, présences, frais, devoir, événement) */
  history: boolean
}

export function buildSeed(profile: SeedProfile): SeedPlan {
  if (profile === 'none') return { profile, teachers: [], classes: [], students: [], history: false }
  const minimal = profile === 'minimal'
  return {
    profile,
    teachers: TEACHERS.slice(0, minimal ? 2 : 4),
    classes: CLASSES.slice(0, minimal ? 2 : 3),
    students: STUDENTS.slice(0, minimal ? 4 : 12),
    history: !minimal
  }
}

/** Compte attendu, affiché avant validation dans l'interface. */
export function seedSummary(plan: SeedPlan): Record<string, number> {
  const out: Record<string, number> = {
    teachers: plan.teachers.length,
    classes: plan.classes.length,
    students: plan.students.length
  }
  if (!plan.history) return out
  out.student_year_levels = plan.students.length
  out.fees = plan.students.length * 2
  out.grades = plan.students.length * 2
  out.attendance = plan.students.length * 5
  out.events = 1
  out.homeworks = 1
  return out
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10)
}

function currentYearLabel(now = new Date()): string {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}-${y + 1}`
}

// ---------- Application en base ----------
export type SeedResult = {
  profile: SeedProfile
  applied: boolean
  reason?: string
  error?: string
  counts: Record<string, number>
}

/**
 * Insère le jeu de données du profil dans la base de l'établissement courant
 * (doit être appelé dans le contexte du tenant).
 * Non destructif : si des élèves existent déjà, rien n'est inséré.
 */
export async function applySeed(env: Bindings, profile: any): Promise<SeedResult> {
  const p = normalizeProfile(profile)
  const counts: Record<string, number> = {}
  if (p === 'none') return { profile: p, applied: false, counts, reason: 'Profil « none » : aucune donnée de départ à insérer.' }

  const probe = await sb(env, 'students?select=id&limit=1')
  if (!probe.ok) return { profile: p, applied: false, counts, error: 'Base de l’établissement indisponible.' }
  if ((probe.data || []).length) {
    return { profile: p, applied: false, counts, reason: 'Des élèves existent déjà : aucune donnée ajoutée (le provisionnement ne modifie jamais une base en service).' }
  }

  const plan = buildSeed(p)

  let year = ''
  try {
    const ys = await sb(env, 'school_years?is_current=eq.true&select=label&limit=1')
    year = ys.data?.[0]?.label || ''
  } catch { /* migration 0009 absente */ }
  if (!year) year = currentYearLabel()

  const tRes = await sb(env, 'teachers', { method: 'POST', body: JSON.stringify(plan.teachers) })
  if (!tRes.ok) return { profile: p, applied: false, counts, error: 'Insertion des enseignants impossible.' }
  const teacherIds: number[] = (tRes.data || []).map((t: any) => Number(t.id))
  counts.teachers = teacherIds.length

  const classRows = plan.classes.map(c => ({
    name: c.name,
    level: c.level,
    capacity: c.capacity,
    room: c.room,
    teacher_id: teacherIds[c.teacherIdx] ?? null
  }))
  const cRes = await sb(env, 'classes', { method: 'POST', body: JSON.stringify(classRows) })
  counts.classes = cRes.ok ? (cRes.data || []).length : 0

  const studentRows = plan.students.map(s => ({
    first_name: s.first_name,
    last_name: s.last_name,
    level: s.level,
    cycle: s.cycle,
    gender: s.gender,
    class_name: plan.classes[s.classIdx]?.name || null,
    parent_name: s.parent_name,
    parent_phone: s.parent_phone,
    parent_email: s.parent_email,
    status: 'actif'
  }))
  const sRes = await sb(env, 'students', { method: 'POST', body: JSON.stringify(studentRows) })
  if (!sRes.ok) return { profile: p, applied: false, counts, error: 'Insertion des élèves impossible.' }
  const studentIds: number[] = (sRes.data || []).map((s: any) => Number(s.id))
  counts.students = studentIds.length

  // Parcours : niveau de chaque élève pour l'année courante (migration 0009)
  const syl = plan.students.map((s, i) => ({
    student_id: studentIds[i],
    school_year: year,
    level: s.level,
    class_name: plan.classes[s.classIdx]?.name || null
  })).filter(r => r.student_id)
  if (syl.length) {
    const r = await sb(env, 'student_year_levels', { method: 'POST', body: JSON.stringify(syl) })
    if (r.ok) counts.student_year_levels = syl.length
  }

  if (!plan.history) return { profile: p, applied: true, counts }

  // --- Historique de démonstration ---
  const subRes = await sb(env, 'subjects?select=id&cycle=eq.primaire&order=id&limit=2')
  const subjectIds: number[] = (subRes.data || []).map((s: any) => Number(s.id))

  const fees: any[] = []
  for (const id of studentIds) {
    fees.push({
      student_id: id, label: "Frais d'inscription", amount: 40,
      due_date: isoDay(30), status: id % 3 === 0 ? 'paid' : 'pending',
      period: null, school_year: year
    })
    fees.push({
      student_id: id, label: 'Mensualité', amount: 120,
      due_date: isoDay(-5), status: id % 2 ? 'pending' : 'paid',
      period: isoDay(0).slice(0, 7), school_year: year
    })
  }
  const fRes = await sb(env, 'fees', { method: 'POST', body: JSON.stringify(fees) })
  counts.fees = fRes.ok ? (fRes.data || []).length : 0

  const grades: any[] = []
  studentIds.forEach((id, i) => {
    for (const sid of subjectIds) {
      grades.push({
        student_id: id, subject_id: sid, trimester: 1,
        score: 10 + ((i * 3 + sid) % 10), max_score: 20, exam_type: 'controle',
        teacher_id: teacherIds[i % Math.max(teacherIds.length, 1)] ?? null,
        school_year: year
      })
    }
  })
  if (grades.length) {
    const gRes = await sb(env, 'grades', { method: 'POST', body: JSON.stringify(grades) })
    counts.grades = gRes.ok ? (gRes.data || []).length : 0
  }

  const att: any[] = []
  for (let d = 1; d <= 5; d++) {
    const day = isoDay(d)
    studentIds.forEach((id, i) => {
      const status = (i + d) % 11 === 0 ? 'absent' : (i + d) % 7 === 0 ? 'retard' : 'present'
      att.push({ student_id: id, date: day, status, school_year: year })
    })
  }
  const aRes = await sb(env, 'attendance', { method: 'POST', body: JSON.stringify(att) })
  counts.attendance = aRes.ok ? (aRes.data || []).length : 0

  const eRes = await sb(env, 'events', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Réunion des parents',
      description: 'Rencontre trimestrielle avec les enseignants.',
      date: isoDay(7), type: 'reunion', school_year: year
    })
  })
  if (eRes.ok) counts.events = 1

  const hRes = await sb(env, 'homeworks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Exercices de révision',
      instructions: 'Faire les exercices 1 à 5 de la fiche distribuée.',
      level: plan.students[0]?.level || '3AP',
      due_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      max_points: 20, status: 'published', trimester: 1, school_year: year,
      teacher_id: teacherIds[0] ?? null
    })
  })
  if (hRes.ok) counts.homeworks = 1

  return { profile: p, applied: true, counts }
}

/** État du provisionnement : la base est-elle encore vierge ? */
export async function seedState(env: Bindings): Promise<{ empty: boolean; counts: Record<string, number>; error?: string }> {
  const counts: Record<string, number> = {}
  let empty = true
  for (const [key, table] of [['students', 'students'], ['teachers', 'teachers'], ['classes', 'classes']] as const) {
    const r = await sb(env, `${table}?select=id&limit=1`)
    if (!r.ok) return { empty: false, counts, error: 'Base de l’établissement indisponible.' }
    if ((r.data || []).length) { empty = false; counts[key] = 1 }
  }
  if (counts.students) {
    const r = await sb(env, 'students?select=id')
    if (r.ok) counts.students = (r.data || []).length
  }
  if (counts.teachers) {
    const r = await sb(env, 'teachers?select=id')
    if (r.ok) counts.teachers = (r.data || []).length
  }
  if (counts.classes) {
    const r = await sb(env, 'classes?select=id')
    if (r.ok) counts.classes = (r.data || []).length
  }
  return { empty, counts }
}
