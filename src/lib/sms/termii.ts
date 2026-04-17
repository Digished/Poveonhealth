/**
 * Termii SMS provider
 * Docs: https://developer.termii.com/send-message
 *
 * Account is configured for Nigeria DND channel with sender ID "N-Alert".
 * All messages must use:  from: "N-Alert"  channel: "dnd"
 */

const BASE_URL = (process.env.TERMII_BASE_URL ?? "https://v3.api.termii.com").replace(/\/$/, "");
const API_KEY = process.env.TERMII_API_KEY;
const SENDER_ID = "N-Alert";
const CHANNEL = "dnd";

/**
 * Normalise a phone number to the format Termii expects for the DND channel.
 * Termii requires the international format WITHOUT a leading "+".
 * Examples:
 *   "08012345678"       → "2348012345678"
 *   "+2348012345678"    → "2348012345678"
 *   "2348012345678"     → "2348012345678"
 *   "8012345678"        → "2348012345678"
 */
export function formatPhoneForTermii(raw: string): string {
  // Strip whitespace, dashes, parentheses, dots
  let phone = raw.replace(/[\s\-().+]/g, "");

  // Nigerian local format: 0xxx → 234xxx
  if (phone.startsWith("0")) phone = `234${phone.slice(1)}`;

  // Bare 10-digit number (no country code)
  if (phone.length === 10 && !phone.startsWith("234")) phone = `234${phone}`;

  // Ensure country code is present
  if (!phone.startsWith("234")) phone = `234${phone}`;

  return phone;
}

/**
 * Send a plain-text SMS via Termii's DND channel.
 * Fire-and-forget safe — never throws; callers should not await in critical paths.
 * Returns the provider message ID when available (used for webhook tracking).
 */
export async function sendSms(to: string, message: string): Promise<{ messageId?: string }> {
  console.log(`[termii] sendSms() called → ${to}`);

  if (!API_KEY) {
    console.error("[termii] CRITICAL: TERMII_API_KEY is not set. SMS will not be sent.");
    return {};
  }

  const phone = formatPhoneForTermii(to);
  console.log(`[termii] Sending via ${CHANNEL} channel (${SENDER_ID}) to ${phone}`);

  const payload = {
    api_key: API_KEY,
    to: phone,
    from: SENDER_ID,
    sms: message,
    type: "plain",
    channel: CHANNEL,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${BASE_URL}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await res.text().catch(() => "");
    console.log(`[termii] HTTP ${res.status} — ${text}`);

    if (!res.ok) {
      let detail = text;
      try {
        const j = JSON.parse(text);
        detail = j.message ?? j.error ?? text;
      } catch { /* keep raw text */ }
      console.error(`[termii] Send failed [${res.status}]: ${detail}`);
      return {};
    }

    try {
      const json = JSON.parse(text);
      // Success response shape: { message_id, message: "Successfully Sent", balance, user }
      if (json.message_id) {
        console.log(`[termii] ✅ Sent to ${phone}. message_id: ${json.message_id}  balance: ${json.balance}`);
        return { messageId: String(json.message_id) };
      }
      // Some accounts return a different success shape
      if (json.message === "Successfully Sent" || json.code === "ok") {
        const id = json.message_id ?? json.id;
        console.log(`[termii] ✅ Sent to ${phone}.${id ? ` message_id: ${id}` : ""}`);
        return { messageId: id ? String(id) : undefined };
      }
      console.warn(`[termii] Unexpected response:`, JSON.stringify(json));
    } catch {
      console.error(`[termii] Could not parse response JSON`);
    }

    return {};
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[termii] Request timed out after 8 s");
    } else {
      console.error("[termii] SMS error:", err instanceof Error ? err.message : String(err));
    }
    // Never propagate — SMS failure must not break the request flow
    return {};
  }
}

/** Build the SMS body sent to a patient when their lab request is created. */
export function buildPatientRequestSms(params: {
  patientName: string;
  labName: string;
  code: string;
}): string {
  const first = params.patientName?.split(" ")[0];
  const greeting = first ? `Hi ${first}, ` : "";
  return (
    `${greeting}your lab request at ${params.labName} has been received.\n` +
    `Request Code: ${params.code}\n` +
    `Show this code at the lab reception.\n` +
    `- Poveon Health`
  );
}
