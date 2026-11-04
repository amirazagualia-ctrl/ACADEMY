// Routes payments
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { audit, getUser, linkedIds } from '../lib/auth'
import { getBrand } from '../lib/brand'
import { notifyParent, receiptToken } from '../lib/notifications'
import { sb } from '../lib/supabase'
import { TC } from '../lib/tenant'
import { publicOrigin } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Paiement en ligne — Konnect (cartes bancaires tunisiennes/internationales, D17, Flouci, wallet) ----------
// Docs : https://api.konnect.network — sandbox : https://api.sandbox.konnect.network/api/v2 ; prod : https://api.konnect.network/api/v2
function konnectBase(env: Bindings) { return (env.KONNECT_ENV || 'sandbox') === 'production' ? 'https://api.konnect.network/api/v2' : 'https://api.sandbox.konnect.network/api/v2' }
function payEnabled(env: Bindings) { return !!(env.KONNECT_API_KEY && env.KONNECT_WALLET_ID) }
// (per-tenant) let _paySupported: { ok: boolean; at: number } | null = null
async function paySupported(env: Bindings) {
  if (TC._paySupported && (TC._paySupported.ok || Date.now() - TC._paySupported.at < 300000)) return TC._paySupported.ok
  const p = await sb(env, 'online_payments?select=id&limit=1'); TC._paySupported = { ok: p.ok, at: Date.now() }; return p.ok
}
app.get('/api/payments/status', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  return c.json({ enabled: payEnabled(c.env), supported: await paySupported(c.env), env: c.env.KONNECT_ENV || 'sandbox', provider: 'konnect', methods: ['carte bancaire', 'e-DINAR', 'Flouci', 'D17 / wallet Konnect'] })
})
// Le parent lance le paiement d'un frais → URL de paiement Konnect
app.post('/api/payments/init', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!payEnabled(c.env)) return c.json({ error: 'Paiement en ligne non activé : l\u2019école doit renseigner ses identifiants Konnect (KONNECT_API_KEY, KONNECT_WALLET_ID).' }, 503)
  if (!(await paySupported(c.env))) return c.json({ error: 'Module paiement non installé (migration 0013)' }, 501)
  const b = await c.req.json().catch(() => ({}))
  const feeId = Number(b.fee_id)
  const fee = (await sb(c.env, `fees?id=eq.${feeId}&select=*,students(id,first_name,last_name,parent_name,parent_email,parent_phone)`)).data?.[0]
  if (!fee) return c.json({ error: 'Frais introuvable' }, 404)
  if (['parent', 'student'].includes(user.role) && !linkedIds(user).includes(fee.student_id)) return c.json({ error: 'Accès refusé' }, 403)
  if (fee.status === 'paid') return c.json({ error: 'Ce frais est déjà payé' }, 400)
  // Paiement en attente récent → réutiliser
  const pend = (await sb(c.env, `online_payments?fee_id=eq.${feeId}&status=eq.pending&order=initiated_at.desc&limit=1`)).data?.[0]
  if (pend && pend.pay_url && Date.now() - new Date(pend.initiated_at).getTime() < 20 * 60000) return c.json({ ok: true, pay_url: pend.pay_url, payment_ref: pend.payment_ref, reused: true })
  const amount = Math.round(Number(fee.amount) * 1000)
  if (amount < 1000) return c.json({ error: 'Montant invalide' }, 400)
  const origin = publicOrigin(c)
  const st = fee.students || {}
  const [firstName, ...rest] = String(st.parent_name || user.name || 'Parent').trim().split(/\s+/)
  const payload: any = {
    receiverWalletId: c.env.KONNECT_WALLET_ID, token: 'TND', amount,
    type: 'immediate', description: `${fee.label} — ${st.first_name || ''} ${st.last_name || ''} (${(await getBrand(c.env)).name})`.slice(0, 120),
    acceptedPaymentMethods: ['wallet', 'bank_card', 'e-DINAR', 'flouci'],
    lifespan: 20, checkoutForm: false, addPaymentFeesToAmount: false,
    firstName: firstName || 'Parent', lastName: rest.join(' ') || '-', phoneNumber: (st.parent_phone || user.phone || '').replace(/\s+/g, ''), email: st.parent_email || user.email || undefined,
    orderId: `FEE-${fee.id}-${Date.now().toString(36)}`,
    webhook: `${origin}/api/payments/webhook`, silentWebhook: true,
    successUrl: `${origin}/paiement/retour?fee=${fee.id}&ok=1`, failUrl: `${origin}/paiement/retour?fee=${fee.id}&ok=0`, theme: 'light'
  }
  let j: any
  try {
    const res = await fetch(`${konnectBase(c.env)}/payments/init-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.env.KONNECT_API_KEY! }, body: JSON.stringify(payload) })
    j = await res.json().catch(() => ({}))
    if (!res.ok || !j.payUrl) return c.json({ error: `Konnect : ${j?.errors?.[0]?.message || j?.message || res.status}` }, 502)
  } catch (e: any) { return c.json({ error: `Konnect injoignable : ${e?.message}` }, 502) }
  const row = { fee_id: fee.id, student_id: fee.student_id, provider: 'konnect', payment_ref: j.paymentRef, amount_millimes: amount, status: 'pending', pay_url: j.payUrl, initiated_by: user.id, raw: { init: j } }
  const ins = await sb(c.env, 'online_payments', { method: 'POST', body: JSON.stringify(row) })
  if (!ins.ok) return c.json({ error: 'Erreur enregistrement paiement' }, 500)
  await audit(c.env, c, user, 'payment_init', 'online_payments', j.paymentRef, null, { fee_id: fee.id, amount })
  return c.json({ ok: true, pay_url: j.payUrl, payment_ref: j.paymentRef })
})
// Vérifie auprès de Konnect et valide le frais (idempotent). Appelé par le webhook ET par la page de retour.
async function payVerify(env: Bindings, paymentRef: string, origin: string): Promise<{ status: string; fee_id?: number; error?: string }> {
  const op = (await sb(env, `online_payments?payment_ref=eq.${encodeURIComponent(paymentRef)}&select=*`)).data?.[0]
  if (!op) return { status: 'unknown', error: 'Paiement inconnu' }
  if (op.status === 'completed') return { status: 'completed', fee_id: op.fee_id }
  let j: any
  try { const res = await fetch(`${konnectBase(env)}/payments/${encodeURIComponent(paymentRef)}`, { headers: { 'x-api-key': env.KONNECT_API_KEY! } }); j = await res.json().catch(() => ({})) } catch (e: any) { return { status: op.status, error: e?.message } }
  const p = j?.payment || {}
  const kst = String(p.status || '').toLowerCase() // pending | completed | failed | expired
  const paidAmount = Number(p.amountDue ?? p.amount ?? 0)
  if (kst === 'completed' && (paidAmount === 0 || paidAmount >= op.amount_millimes || (p.transactions || []).some((t: any) => String(t.status).toLowerCase() === 'success'))) {
    const today = new Date().toISOString().slice(0, 10)
    await sb(env, `online_payments?id=eq.${op.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString(), raw: { ...(op.raw || {}), verify: p } }) })
    await sb(env, `fees?id=eq.${op.fee_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_date: today, method: 'en_ligne', online_payment_id: op.id }) })
    // Quittance + notification au parent (lien public)
    try {
      const fee = (await sb(env, `fees?id=eq.${op.fee_id}&select=id,label,amount,student_id,students(first_name,last_name)`)).data?.[0]
      if (fee) { const t = await receiptToken(env, fee.id); await notifyParent(env, fee.student_id, 'frais', `✅ Paiement reçu — ${fee.label}`, `Votre paiement en ligne de ${Number(fee.amount).toFixed(3)} DT pour ${fee.students?.first_name || ''} a bien été reçu. Quittance : ${origin}/quittance/${fee.id}?t=${t}`) }
    } catch {}
    return { status: 'completed', fee_id: op.fee_id }
  }
  if (['failed', 'expired', 'cancelled'].includes(kst)) { await sb(env, `online_payments?id=eq.${op.id}`, { method: 'PATCH', body: JSON.stringify({ status: kst, raw: { ...(op.raw || {}), verify: p } }) }); return { status: kst, fee_id: op.fee_id } }
  return { status: 'pending', fee_id: op.fee_id }
}
// Webhook Konnect : GET ?payment_ref=...
app.get('/api/payments/webhook', async (c) => {
  const ref = c.req.query('payment_ref') || ''
  if (!ref || !payEnabled(c.env)) return c.json({ ok: false }, 400)
  const r = await payVerify(c.env, ref, publicOrigin(c))
  return c.json({ ok: true, status: r.status })
})
// Vérification côté client après retour (parent connecté) ou par l'admin
app.post('/api/payments/verify', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  const b = await c.req.json().catch(() => ({}))
  let ref = String(b.payment_ref || '')
  if (!ref && b.fee_id) ref = (await sb(c.env, `online_payments?fee_id=eq.${Number(b.fee_id)}&order=initiated_at.desc&limit=1&select=payment_ref`)).data?.[0]?.payment_ref || ''
  if (!ref) return c.json({ error: 'Référence manquante' }, 400)
  const r = await payVerify(c.env, ref, publicOrigin(c))
  if (r.fee_id && ['parent', 'student'].includes(user.role)) { const fee = (await sb(c.env, `fees?id=eq.${r.fee_id}&select=student_id`)).data?.[0]; if (fee && !linkedIds(user).includes(fee.student_id)) return c.json({ error: 'Accès refusé' }, 403) }
  return c.json(r)
})
// Historique des paiements en ligne (admin) / mes paiements (parent)
app.get('/api/payments', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: 'Non authentifié' }, 401)
  if (!(await paySupported(c.env))) return c.json({ supported: false, items: [] })
  let q = `online_payments?select=*,fees(label,amount,status),students(first_name,last_name,level)&order=initiated_at.desc&limit=300`
  if (['parent', 'student'].includes(user.role)) { const ids = linkedIds(user); if (!ids.length) return c.json({ supported: true, items: [] }); q += `&student_id=in.(${ids.join(',')})` }
  else if (user.role === 'teacher') return c.json({ error: 'Accès refusé' }, 403)
  const r = await sb(c.env, q)
  return c.json({ supported: true, items: (r.data || []).map((x: any) => { const { raw, ...rest } = x; return rest }) })
})

export default app
