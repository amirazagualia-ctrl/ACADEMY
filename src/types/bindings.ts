// Variables d'environnement / secrets Cloudflare (type Bindings)
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import type { KVLike } from '../monitoring'

export type Bindings = {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_KEY?: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
  TWILIO_SID?: string
  TWILIO_TOKEN?: string
  TWILIO_FROM?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_ADMIN_CHAT_ID?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OPENAI_MODEL?: string
  AI_ALT_API_KEY?: string      // Moteur IA alternatif (compatible OpenAI : Groq, Mistral, Gemini, DeepSeek, Ollama…) — bascule automatique
  AI_ALT_BASE_URL?: string
  AI_ALT_MODEL?: string
  KONNECT_API_KEY?: string
  KONNECT_WALLET_ID?: string
  KONNECT_ENV?: string
  APP_ENV?: string
  TENANT_SECRET?: string      // F63 : clé de chiffrement des accès des établissements (32+ caractères)
  // Observabilité (src/monitoring.ts) — tous facultatifs
  LOG_LEVEL?: string; MONITORING_SAMPLE_RATE?: string; MONITORING_KV?: KVLike
  SLACK_WEBHOOK_URL?: string; ALERT_EMAIL_FROM?: string; ALERT_EMAIL_TO?: string; ALERT_WEBHOOK_URL?: string; ALERT_WEBHOOK_SECRET?: string
  SENTRY_DSN?: string; SENTRY_TRACES_SAMPLE_RATE?: string; SENTRY_RELEASE?: string; LOGS_WEBHOOK_URL?: string
}
