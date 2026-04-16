/**
 * Optional SMS logging helper
 * Logs SMS sends to the database for tracking delivery status via webhooks
 * (fire-and-forget, never blocks request)
 */

import { prisma } from "@/lib/prisma";

export async function logSmsSend(params: {
  provider: "termii";
  toPhone: string;
  messageBody: string;
  messageId?: string;
  requestId?: string;
}): Promise<void> {
  try {
    await prisma.smsLog.create({
      data: {
        provider: params.provider,
        to_phone: params.toPhone,
        message_body: params.messageBody,
        provider_msg_id: params.messageId || null,
        request_id: params.requestId || null,
        status: "sent", // Mark as sent once accepted by provider
      },
    });
  } catch (error) {
    // Never block on logging errors
    console.error("[sms-log] Error logging SMS:", error);
  }
}
