/**
 * WhatsApp module — public entry point.
 *
 * Wraps the Twilio provider with the guards and logging every send needs:
 * the master switch, the daily spend circuit-breaker, and a `sms_logs` row so
 * delivery receipts from the webhook have something to update.
 */

import { isWhatsAppEnabled } from "./config";
import { sendWhatsApp as sendViaTwilio, type WhatsAppMessage, type WhatsAppSendResult } from "./twilio";
import { toE164 } from "./phone";
import { logMessageSend } from "@/lib/message-log";
import { checkDailyWhatsAppCap } from "@/lib/sms-guard";

export type { WhatsAppMessage, WhatsAppSendResult };
export { isWhatsAppEnabled, isWhatsAppConfigured } from "./config";
export { toE164, toWhatsAppAddress } from "./phone";
export * as waTemplates from "./templates";

/**
 * Send a WhatsApp message, logging the outcome.
 * Never throws — inspect `ok` / `shouldFallback` to decide on an SMS fallback.
 */
export async function sendWhatsAppMessage(
  to: string | null | undefined,
  message: WhatsAppMessage,
  opts?: { requestId?: string; tag?: string }
): Promise<WhatsAppSendResult> {
  const tag = opts?.tag ? `[${opts.tag}] ` : "";

  if (!isWhatsAppEnabled()) {
    return { ok: false, error: "disabled", shouldFallback: true };
  }

  const e164 = toE164(to);
  if (!e164) {
    console.warn(`[whatsapp] ${tag}skipped — unusable phone: ${to ?? "(empty)"}`);
    return { ok: false, error: "invalid_phone", shouldFallback: false };
  }

  const daily = await checkDailyWhatsAppCap();
  if (!daily.allowed) {
    console.error(`[whatsapp] ${tag}blocked — daily cap reached (${daily.count}/${daily.limit})`);
    // The cap is a spend guard for WhatsApp specifically; SMS has its own.
    return { ok: false, error: "daily_cap", shouldFallback: true };
  }

  const result = await sendViaTwilio(e164, message);

  await logMessageSend({
    channel: "whatsapp",
    provider: "twilio_whatsapp",
    toPhone: e164,
    messageBody: message.body,
    messageId: result.messageId,
    status: result.ok ? result.status ?? "sent" : "failed",
    errorCode: result.errorCode,
    errorMessage: result.ok ? undefined : result.error,
    requestId: opts?.requestId,
  });

  return result;
}
