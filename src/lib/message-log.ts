/**
 * Outbound message logging (SMS + WhatsApp).
 *
 * Writes to the `sms_logs` table, which now carries a `channel` discriminator.
 * Fire-and-forget: a logging failure must never surface to the caller, and a
 * deploy whose migration hasn't run yet just logs a warning.
 */

import { prisma } from "@/lib/prisma";

export type MessageChannel = "sms" | "whatsapp";
export type MessageProvider = "termii" | "sendchamp" | "twilio_whatsapp";

export async function logMessageSend(params: {
  channel: MessageChannel;
  provider: MessageProvider;
  toPhone: string;
  messageBody: string;
  messageId?: string;
  /** Defaults to "sent" — the provider accepted it; webhooks refine it later. */
  status?: string;
  errorCode?: string | number;
  errorMessage?: string;
  requestId?: string;
}): Promise<void> {
  try {
    await prisma.smsLog.create({
      data: {
        channel: params.channel,
        provider: params.provider,
        to_phone: params.toPhone,
        message_body: params.messageBody,
        provider_msg_id: params.messageId || null,
        request_id: params.requestId || null,
        status: params.status ?? "sent",
        error_code: params.errorCode != null ? String(params.errorCode) : null,
        error_message: params.errorMessage || null,
      },
    });
  } catch (error) {
    console.error("[message-log] Error logging message:", error);
  }
}
