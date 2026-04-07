/**
 * Termii SMS utility
 * Docs: https://developers.termii.com/send-message
 */

const BASE_URL = process.env.TERMII_BASE_URL ?? "https://v3.api.termii.com";
const SENDER_ID = process.env.TERMII_SENDER_ID ?? "Poveon";

/**
 * Normalise a phone number to international format expected by Termii.
 * Termii accepts numbers without the leading "+".
 * Examples:  "+2348001234567" → "2348001234567"
 *            "08001234567"    → "2348001234567"
 *            "+234 800 123 4567" → "2348001234567"
 */
export function formatPhoneForTermii(raw: string): string {
  // Strip spaces, dashes, parentheses
  let phone = raw.replace(/[\s\-().]/g, "");

  // Remove leading "+"
  if (phone.startsWith("+")) phone = phone.slice(1);

  // Nigerian shorthand: 08xx → 2348xx
  if (phone.startsWith("0")) phone = `234${phone.slice(1)}`;

  return phone;
}

/**
 * Send a plain-text SMS via Termii.
 * This is fire-and-forget safe — callers should not await this in critical paths.
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) {
    console.warn("[termii] TERMII_API_KEY not set — SMS skipped");
    return;
  }

  const phone = formatPhoneForTermii(to);

  const res = await fetch(`${BASE_URL}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      to: phone,
      from: SENDER_ID,
      sms: message,
      type: "plain",
      channel: "dnd", // DND channel works without an approved sender ID
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Termii SMS failed [${res.status}]: ${text}`);
  }
}

/** Build the SMS message sent to a patient when their request is created. */
export function buildPatientRequestSms(params: {
  patientName: string;
  labName: string;
  code: string;
}): string {
  const greeting = params.patientName ? `Hi ${params.patientName.split(" ")[0]}, ` : "";
  return (
    `${greeting}your lab request at ${params.labName} has been received.\n` +
    `Request Code: ${params.code}\n` +
    `Show this code at the lab reception.\n` +
    `- Poveon Health`
  );
}
