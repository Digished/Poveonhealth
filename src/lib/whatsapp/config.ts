/**
 * WhatsApp (Twilio) configuration.
 *
 * Everything is read lazily from process.env so that a deploy without Twilio
 * credentials behaves exactly like the pre-WhatsApp build: `isWhatsAppEnabled()`
 * returns false and every caller silently falls back to SMS/email.
 */

/** Sender credentials. API key/secret is preferred; auth token is the fallback. */
export function twilioAuth(): { user: string; pass: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!accountSid) return null;

  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  if (apiKeySid && apiKeySecret) return { user: apiKeySid, pass: apiKeySecret };

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (authToken) return { user: accountSid, pass: authToken };

  return null;
}

export function twilioAccountSid(): string | undefined {
  return process.env.TWILIO_ACCOUNT_SID?.trim() || undefined;
}

/**
 * The WhatsApp-enabled sender. Accepts a bare number ("+14155238886") or an
 * already-prefixed value ("whatsapp:+14155238886"); always returns the prefixed
 * form Twilio expects.
 */
export function whatsappFrom(): string | undefined {
  const raw = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!raw) return undefined;
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
}

/** Optional Messaging Service SID — used instead of From when set. */
export function messagingServiceSid(): string | undefined {
  return process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined;
}

/** WhatsApp can send only when we have credentials AND a sender. */
export function isWhatsAppConfigured(): boolean {
  return !!twilioAuth() && (!!whatsappFrom() || !!messagingServiceSid());
}

/**
 * Master switch. Defaults to "on when configured" so that setting the Twilio
 * env vars is all that's needed; WHATSAPP_ENABLED=false force-disables it.
 */
export function isWhatsAppEnabled(): boolean {
  const flag = process.env.WHATSAPP_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return isWhatsAppConfigured();
}

/**
 * Send an SMS as well when WhatsApp could not be delivered (no WhatsApp
 * account on the number, template rejected, Twilio down). Defaults to on —
 * a patient must always get their code.
 */
export function smsFallbackEnabled(): boolean {
  const flag = process.env.WHATSAPP_SMS_FALLBACK?.trim().toLowerCase();
  return !(flag === "false" || flag === "0" || flag === "off");
}

/** Global daily WhatsApp send cap (spend circuit-breaker). */
export function dailyWhatsAppCap(): number {
  const parsed = parseInt(process.env.DAILY_WHATSAPP_CAP ?? "1000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

/** Default country code applied to local-format numbers (Nigeria). */
export const DEFAULT_COUNTRY_CODE = "234";

/**
 * Approved WhatsApp message template ("Content") SIDs, one per notification.
 *
 * WhatsApp only allows free-form text inside a 24-hour customer service window.
 * Business-initiated messages (which is what all of ours are) must use a
 * template approved in the Twilio Content Template Builder. When a SID is not
 * configured we still attempt a free-form send — that works on the Twilio
 * sandbox and inside an open session window, and fails cleanly otherwise.
 */
export type TemplateKey =
  | "requestCode"
  | "doctorRequest"
  | "resultsReady"
  | "referralCreated"
  | "referralStatus";

const TEMPLATE_ENV: Record<TemplateKey, string> = {
  requestCode: "TWILIO_WA_TEMPLATE_REQUEST_CODE",
  doctorRequest: "TWILIO_WA_TEMPLATE_DOCTOR_REQUEST",
  resultsReady: "TWILIO_WA_TEMPLATE_RESULTS_READY",
  referralCreated: "TWILIO_WA_TEMPLATE_REFERRAL_CREATED",
  referralStatus: "TWILIO_WA_TEMPLATE_REFERRAL_STATUS",
};

export function contentSidFor(key: TemplateKey): string | undefined {
  return process.env[TEMPLATE_ENV[key]]?.trim() || undefined;
}

/** Absolute URL Twilio posts delivery receipts to. */
export function statusCallbackUrl(): string | undefined {
  const explicit = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  // Twilio rejects non-public callbacks — skip localhost rather than error out.
  if (!appUrl || /localhost|127\.0\.0\.1/.test(appUrl)) return undefined;
  return `${appUrl}/api/webhooks/whatsapp/twilio`;
}
