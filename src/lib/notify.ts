// Canaux de notification (e-mail, SMS, Telegram) et santé de la base
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { BRAND_DEFAULTS, getBrand } from './brand'
import { sb } from './supabase'
import { TC } from './tenant'
import { escapeHtml, normPhone } from './utils'
import type { Bindings } from '../types/bindings'

export async function sendEmail(env: Bindings, to: string, subject: string, html: string, opts: { from?: string; replyTo?: string } = {}) {
  if (!env.RESEND_API_KEY || !to) return { sent: false, reason: 'no_api_key_or_recipient' }
  try {
    // Expéditeur : RESEND_FROM s'il est défini (domaine vérifié chez Resend), sinon le domaine de
    // test de Resend qui n'autorise l'envoi que vers l'adresse du compte. Le nom affiché reste
    // celui de l'établissement.
    const brand = await getBrand(env)
    const addr = opts.from || env.RESEND_FROM || 'onboarding@resend.dev'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${brand.name} <${addr}>`, to: [to], subject, html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

export async function sendSMS(env: Bindings, to: string, body: string) {
  if (!env.TWILIO_SID || !env.TWILIO_TOKEN || !env.TWILIO_FROM || !to) return { sent: false, reason: 'twilio_not_configured' }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}

// ---------- Monitoring : état Supabase + alerte Telegram admin ----------
// État en mémoire du Worker (par isolat) : suffisant pour dédoublonner les alertes ; 1 alerte / 6 h max, message de rétablissement.
export const _health = { down: false, since: 0, lastAlert: 0, lastError: '', lastOkAt: 0, failures: 0 }
const HEALTH_ALERT_EVERY_MS = 6 * 60 * 60 * 1000
export function healthReport(env: Bindings, ok: boolean, err?: string) {
  const now = Date.now()
  if (ok) {
    _health.lastOkAt = now; _health.failures = 0
    if (_health.down) {
      const mins = Math.round((now - _health.since) / 60000)
      _health.down = false
      healthNotify(env, `✅ <b>${(TC._brandCache?.value || BRAND_DEFAULTS).name} — base de données rétablie</b>\nSupabase répond de nouveau (indisponibilité ≈ ${mins} min).`).catch(() => {})
    }
    return
  }
  _health.failures++; _health.lastError = String(err || '').slice(0, 200)
  if (!_health.down) { _health.down = true; _health.since = now }
  if (now - _health.lastAlert > HEALTH_ALERT_EVERY_MS) {
    _health.lastAlert = now
    healthNotify(env, `🚨 <b>${BRAND_DEFAULTS.name} — base de données inaccessible</b>\nErreur : <code>${escapeHtml(_health.lastError)}</code>\n\nLe projet Supabase est probablement <b>en pause</b> (plan gratuit). Ouvrez supabase.com/dashboard et cliquez sur « Restore project ».\n\nUne nouvelle alerte sera envoyée au plus tôt dans 6 h si le problème persiste.`).catch(() => {})
  }
}
// Destinataires : chat_id admin explicite (TELEGRAM_ADMIN_CHAT_ID) ou chats Telegram des numéros des comptes admin.
// Ne passe PAS par sb() pour ne pas boucler quand la base est en panne : utilise le cache des chats admin.
// (per-tenant) let _adminChatsCache: { at: number; ids: string[] } | null = null
export async function adminTelegramChats(env: Bindings): Promise<string[]> {
  const ids = new Set<string>()
  if ((env as any).TELEGRAM_ADMIN_CHAT_ID) String((env as any).TELEGRAM_ADMIN_CHAT_ID).split(',').map(x => x.trim()).filter(Boolean).forEach(x => ids.add(x))
  if (TC._adminChatsCache && Date.now() - TC._adminChatsCache.at < 3600_000) TC._adminChatsCache.ids.forEach((x: string) => ids.add(x))
  return [...ids]
}
export async function refreshAdminChatsCache(env: Bindings) {
  try {
    const admins = await sb(env, `user_accounts?role=eq.admin&status=eq.active&select=phone`)
    const chats = await getTelegramChats(env)
    const ids = (admins.data || []).map((a: any) => chats[normPhone(a.phone)]).filter(Boolean)
    TC._adminChatsCache = { at: Date.now(), ids }
  } catch {}
}
export async function healthNotify(env: Bindings, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return
  const chats = await adminTelegramChats(env)
  for (const chat_id of chats) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' })
    }).catch(() => {})
  }
} // 8 derniers chiffres (numéro tunisien)

export async function getTelegramChats(env: Bindings): Promise<Record<string, string>> {
  const r = await sb(env, `settings?key=eq.telegram_chats&select=value`)
  return r.data?.[0]?.value || {}
}

export async function sendTelegram(env: Bindings, parentPhone: string, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !parentPhone) return { sent: false, reason: 'telegram_not_configured' }
  const chats = await getTelegramChats(env)
  const chatId = chats[normPhone(parentPhone)]
  if (!chatId) return { sent: false, reason: 'parent_not_linked' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    })
    return { sent: res.ok, reason: res.ok ? 'ok' : await res.text() }
  } catch (e: any) { return { sent: false, reason: e.message } }
}
