/**
 * Twilio SMS provider
 * Docs: https://www.twilio.com/docs
 * Simple, reliable, works everywhere
 */

import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

if (!ACCOUNT_SID || !AUTH_TOKEN || !TWILIO_PHONE) {
  console.error("[twilio] Missing environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER");
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

/**
 * Send SMS via Twilio
 * Twilio accepts phone numbers in E.164 format (e.g. +2348001234567)
 */
export async function sendSms(to: string, message: string): Promise<{ messageId?: string }> {
  console.log(`[twilio] sendSms() called with phone: ${to}`);

  if (!ACCOUNT_SID || !AUTH_TOKEN || !TWILIO_PHONE) {
    console.error("[twilio] CRITICAL: Missing Twilio credentials in environment!");
    return {};
  }

  try {
    console.log(`[twilio] Sending SMS from ${TWILIO_PHONE} to ${to}`);
    const result = await client.messages.create({
      from: TWILIO_PHONE,
      to: to,
      body: message,
    });

    console.log(`[twilio] API response SID: ${result.sid}`);
    console.log(`[twilio] Message status: ${result.status}`);

    if (result.sid) {
      console.log(`[twilio] ✅ SMS sent successfully to ${to}. Message ID: ${result.sid}`);
      return { messageId: result.sid };
    } else {
      console.warn(`[twilio] SMS response but no SID returned`);
      return {};
    }
  } catch (err) {
    console.error("[twilio] SMS error:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error) {
      console.error("[twilio] Full error:", err);
    }
    // Don't throw - SMS failures should not block main request
    return {};
  }
}

/**
 * Build SMS message for patient
 */
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
