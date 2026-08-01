/**
 * Unified patient/doctor notification dispatch.
 *
 * WhatsApp first, SMS as the safety net:
 *   1. Try WhatsApp (skipped instantly when unconfigured or disabled).
 *   2. If that didn't land and an SMS body was supplied, send the SMS through
 *      the existing anti-pumping guards.
 *
 * Callers that previously sent an SMS directly keep the exact same guarantees —
 * the SMS still goes out whenever WhatsApp doesn't. Callers that only want
 * WhatsApp (doctors, who have never received SMS) simply omit `sms`.
 *
 * Never throws.
 */

import { sendWhatsAppMessage, type WhatsAppMessage } from "@/lib/whatsapp";
import { smsFallbackEnabled } from "@/lib/whatsapp/config";
import { sendSms } from "@/lib/sms";
import { logSmsSend } from "@/lib/sms/log-sms";
import { isValidNigerianPhone, checkPhoneSmsRateLimit, checkDailySmsCap } from "@/lib/sms-guard";

export interface NotifyResult {
  whatsapp: boolean;
  sms: boolean;
}

export interface NotifyOptions {
  /** Primary phone number. Used for both channels unless whatsappPhone is set. */
  phone?: string | null;
  /** Dedicated WhatsApp number, when the patient said their main line isn't on WhatsApp. */
  whatsappPhone?: string | null;
  /** The WhatsApp message (body + optional approved template). */
  whatsapp: WhatsAppMessage;
  /** SMS fallback body. Omit to make this a WhatsApp-only notification. */
  sms?: string | null;
  /** Also apply the per-phone hourly SMS cap (doctor-initiated request flows). */
  smsRateLimit?: boolean;
  requestId?: string;
  /** Short label for log lines, e.g. "request-code". */
  tag: string;
}

export async function notify(opts: NotifyOptions): Promise<NotifyResult> {
  const result: NotifyResult = { whatsapp: false, sms: false };
  const tag = opts.tag;

  const waTarget = opts.whatsappPhone?.trim() || opts.phone?.trim() || null;
  if (waTarget) {
    try {
      const wa = await sendWhatsAppMessage(waTarget, opts.whatsapp, { requestId: opts.requestId, tag });
      result.whatsapp = wa.ok;
      if (wa.ok) return result;
      if (wa.error && wa.error !== "disabled") {
        console.warn(`[notify] ${tag}: WhatsApp not delivered (${wa.errorCode ?? wa.error}) — trying SMS`);
      }
    } catch (e) {
      console.error(`[notify] ${tag}: WhatsApp threw:`, e instanceof Error ? e.message : String(e));
    }
  }

  const smsBody = opts.sms?.trim();
  const smsTarget = opts.phone?.trim();
  if (!smsBody || !smsTarget) return result;
  if (!smsFallbackEnabled()) {
    console.warn(`[notify] ${tag}: SMS fallback disabled — no message sent`);
    return result;
  }

  result.sms = await sendGuardedSms({
    phone: smsTarget,
    body: smsBody,
    rateLimit: opts.smsRateLimit ?? false,
    requestId: opts.requestId,
    tag,
  });

  return result;
}

/**
 * The SMS path with all three anti-pumping layers, extracted so every call site
 * enforces them identically.
 */
export async function sendGuardedSms(params: {
  phone: string;
  body: string;
  rateLimit?: boolean;
  requestId?: string;
  tag: string;
}): Promise<boolean> {
  const { phone, body, tag } = params;

  if (!isValidNigerianPhone(phone)) {
    console.warn(`[notify] ${tag}: SMS skipped — non-Nigerian phone: ${phone}`);
    return false;
  }

  try {
    if (params.rateLimit) {
      const phoneLimit = await checkPhoneSmsRateLimit(phone);
      if (!phoneLimit.allowed) {
        console.warn(`[notify] ${tag}: SMS skipped — phone rate limit (${phoneLimit.count}/hr): ${phone}`);
        return false;
      }
    }

    const daily = await checkDailySmsCap();
    if (!daily.allowed) {
      console.error(`[notify] ${tag}: SMS blocked — daily cap reached (${daily.count}/${daily.limit})`);
      return false;
    }

    const { messageId } = await sendSms(phone, body);
    await logSmsSend({ provider: "termii", toPhone: phone, messageBody: body, messageId, requestId: params.requestId });
    return true;
  } catch (e) {
    console.error(`[notify] ${tag}: SMS error:`, e instanceof Error ? e.message : String(e));
    return false;
  }
}
