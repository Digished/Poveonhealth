/**
 * Sendchamp SMS utility
 * Docs: https://sendchamp.com/docs
 * Sendchamp is ideal for Africa/Nigeria - no sender ID registration required
 */

const BASE_URL = "https://api.sendchamp.com/api/v1";
const API_KEY = process.env.SENDCHAMP_API_KEY;
const SENDER_ID = process.env.SENDCHAMP_SENDER_ID ?? "SAlert";

/**
 * Normalise a phone number to international format expected by Sendchamp.
 * Sendchamp accepts E.164 format with leading "+".
 * Examples:  "08001234567"    → "+2348001234567"
 *            "2348001234567"  → "+2348001234567"
 *            "+234 800 123 4567" → "+2348001234567"
 */
export function formatPhoneForSendchamp(raw: string): string {
  // Strip spaces, dashes, parentheses
  let phone = raw.replace(/[\s\-().]/g, "");

  // Remove leading "+" if present
  if (phone.startsWith("+")) phone = phone.slice(1);

  // Nigerian shorthand: 08xx → 2348xx
  if (phone.startsWith("0")) phone = `234${phone.slice(1)}`;

  // Ensure it starts with country code
  if (!phone.startsWith("234")) {
    // Assume Nigerian number if no country code
    phone = `234${phone}`;
  }

  // Add leading "+"
  return `+${phone}`;
}

/**
 * Send a plain-text SMS via Sendchamp.
 * This is fire-and-forget safe — callers should not await this in critical paths.
 * Returns the provider message ID if available (for webhook tracking).
 *
 * Docs: https://sendchamp.com/docs/api/sms/send
 */
export async function sendSms(to: string, message: string): Promise<{ messageId?: string }> {
  console.log(`[sendchamp] Attempting to send SMS to ${to}`);

  if (!API_KEY) {
    console.error("[sendchamp] SENDCHAMP_API_KEY not set — SMS skipped");
    return {};
  }

  const phone = formatPhoneForSendchamp(to);
  console.log(`[sendchamp] Formatted phone: ${phone}, Provider: ${SENDER_ID}`);

  try {
    const res = await fetch(`${BASE_URL}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        phone_number: phone,
        message: message,
        sender_name: SENDER_ID,
        type: "text",
        route: "dnd",
      }),
    });

    const responseText = await res.text().catch(() => "");

    if (!res.ok) {
      let errorMsg = responseText;
      try {
        const json = JSON.parse(responseText);
        errorMsg = json.message || json.error || json.errors?.message || responseText;
      } catch {}

      console.error(`[sendchamp] SMS send failed for ${phone}: [${res.status}] ${errorMsg}`);
      throw new Error(`Sendchamp SMS failed [${res.status}]: ${errorMsg}`);
    }

    // Parse response and extract message ID
    try {
      const json = JSON.parse(responseText);
      if (json.status === "success" || json.code === 200) {
        const messageId = json.data?.id || json.id;
        console.log(`[sendchamp] SMS sent successfully. Message ID: ${messageId}`);
        return { messageId };
      } else {
        console.warn(`[sendchamp] SMS status: ${json.status || json.code} - ${json.message}`);
      }
    } catch {}

    return {};
  } catch (err) {
    // SMS failures should not block the main request flow
    console.error("[sendchamp] SMS error:", err instanceof Error ? err.message : String(err));
    throw err;
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
