/**
 * SMS logging helper — thin wrapper over the shared message log.
 * Kept as its own module so existing SMS call sites don't have to care about
 * the channel discriminator introduced for WhatsApp.
 */

import { logMessageSend } from "@/lib/message-log";

export async function logSmsSend(params: {
  provider: "termii";
  toPhone: string;
  messageBody: string;
  messageId?: string;
  requestId?: string;
}): Promise<void> {
  return logMessageSend({ ...params, channel: "sms" });
}
