/**
 * Twilio WhatsApp provider.
 *
 * Talks to the Twilio Messages REST API directly over fetch (same approach as
 * the Termii SMS provider) so no extra runtime dependency is pulled in.
 * Docs: https://www.twilio.com/docs/whatsapp/api
 *
 * Like the SMS provider this NEVER throws — a WhatsApp failure must not break
 * the request that triggered it. Callers get a result object and decide whether
 * to fall back to SMS.
 */

import crypto from "node:crypto";
import {
  twilioAuth,
  twilioAccountSid,
  whatsappFrom,
  messagingServiceSid,
  isWhatsAppConfigured,
  statusCallbackUrl,
} from "./config";
import { toWhatsAppAddress } from "./phone";

const API_BASE = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 8000;

export interface WhatsAppMessage {
  /**
   * Plain-text body. Always supply one: it is used inside an open 24-hour
   * session window, on the Twilio sandbox, and as the SMS fallback text.
   */
  body: string;
  /** Approved Content Template SID (HX…) for business-initiated messages. */
  contentSid?: string;
  /** Positional template variables, e.g. { "1": "Ada", "2": "PVN-1234" }. */
  contentVariables?: Record<string, string>;
  /** Public media URLs to attach (e.g. a result PDF). Max 10 per Twilio. */
  mediaUrls?: string[];
}

export interface WhatsAppSendResult {
  ok: boolean;
  messageId?: string;
  status?: string;
  errorCode?: number;
  error?: string;
  /** True when the failure means "this person can't be reached on WhatsApp". */
  shouldFallback: boolean;
}

/**
 * Twilio error codes that mean the message will never arrive on WhatsApp, so
 * the caller should fall back to SMS rather than retry.
 * https://www.twilio.com/docs/api/errors
 */
const FALLBACK_ERROR_CODES = new Set([
  21211, // Invalid 'To' phone number
  21606, // 'From' not a valid WhatsApp sender
  21610, // Recipient has opted out
  63003, // Channel could not find To address (no WhatsApp account)
  63005, // Channel did not accept the message
  63015, // Channel sandbox — recipient not opted in
  63016, // Free-form message outside the 24-hour window (no template used)
  63018, // Rate limit exceeded on the channel
  63024, // Invalid message body/parameters
  63032, // Recipient blocked the sender
  63051, // Recipient is not a WhatsApp user
]);

/**
 * Send a WhatsApp message.
 * Resolves with `{ ok: false, shouldFallback }` instead of throwing.
 */
export async function sendWhatsApp(to: string, message: WhatsAppMessage): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    console.warn("[twilio-wa] Not configured (missing TWILIO_ACCOUNT_SID / credentials / sender) — skipping");
    return { ok: false, error: "not_configured", shouldFallback: true };
  }

  const address = toWhatsAppAddress(to);
  if (!address) {
    console.warn(`[twilio-wa] Unusable phone number, skipping: ${to}`);
    return { ok: false, error: "invalid_phone", shouldFallback: false };
  }

  const auth = twilioAuth()!;
  const accountSid = twilioAccountSid()!;

  const form = new URLSearchParams();
  form.set("To", address);

  const serviceSid = messagingServiceSid();
  if (serviceSid) form.set("MessagingServiceSid", serviceSid);
  else form.set("From", whatsappFrom()!);

  if (message.contentSid) {
    form.set("ContentSid", message.contentSid);
    if (message.contentVariables && Object.keys(message.contentVariables).length > 0) {
      form.set("ContentVariables", JSON.stringify(message.contentVariables));
    }
  } else {
    form.set("Body", message.body);
  }

  for (const url of (message.mediaUrls ?? []).slice(0, 10)) form.append("MediaUrl", url);

  const callback = statusCallbackUrl();
  if (callback) form.set("StatusCallback", callback);

  const basic = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${API_BASE}/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* keep raw text */ }

    if (!res.ok) {
      const code = typeof json.code === "number" ? json.code : undefined;
      const detail = typeof json.message === "string" ? json.message : text || `HTTP ${res.status}`;
      console.error(`[twilio-wa] Send failed [${res.status}${code ? ` code=${code}` : ""}]: ${detail}`);
      return {
        ok: false,
        errorCode: code,
        error: detail,
        // Unknown/5xx failures are also worth an SMS — the notification matters
        // more than the channel.
        shouldFallback: code === undefined ? true : FALLBACK_ERROR_CODES.has(code),
      };
    }

    const sid = typeof json.sid === "string" ? json.sid : undefined;
    const status = typeof json.status === "string" ? json.status : undefined;
    console.log(`[twilio-wa] ✅ Queued to ${address} — sid=${sid ?? "?"} status=${status ?? "?"}`);
    return { ok: true, messageId: sid, status, shouldFallback: false };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[twilio-wa] Request timed out after ${TIMEOUT_MS / 1000}s`);
      return { ok: false, error: "timeout", shouldFallback: true };
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[twilio-wa] Send error:", detail);
    return { ok: false, error: detail, shouldFallback: true };
  }
}

/**
 * Flatten a webhook's form body into the plain string map the signature check
 * needs. Uses `forEach` rather than iteration because the project compiles to
 * ES5, where iterating FormData needs --downlevelIteration.
 */
export function formDataToParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}

/**
 * Verify the `X-Twilio-Signature` header on an incoming webhook.
 *
 * Twilio signs `url + <every POST param, sorted by key, concatenated as key+value>`
 * with HMAC-SHA1 keyed on the account auth token, base64-encoded.
 * https://www.twilio.com/docs/usage/security#validating-requests
 *
 * Returns false when no auth token is configured, so an unconfigured deploy
 * can never be tricked into trusting a forged callback.
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken || !signature) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(payload, "utf-8")).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
