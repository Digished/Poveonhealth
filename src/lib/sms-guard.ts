/**
 * SMS pumping fraud defences.
 *
 * Three independent layers:
 *  1. isValidNigerianPhone  – rejects non-NG numbers (kills international premium-route abuse)
 *  2. checkPhoneSmsRateLimit – per-phone hourly cap using the requests table (sync write, no race)
 *  3. checkDailySmsCap      – global circuit breaker using sms_logs (stops runaway spend)
 */

import { prisma } from "@/lib/prisma";
import { formatPhoneForTermii } from "@/lib/sms/termii";
import { dailyWhatsAppCap } from "@/lib/whatsapp/config";

// ── Nigerian prefix table (MTN / Airtel / Glo / 9mobile) ─────────────────────
const NG_PREFIXES = [
  "7025","7026","7028","7029",
  "703","704","705","706","708","709",
  "802","803","804","805","806","807","808","809",
  "810","811","812","813","814","815","816","817","818",
  "902","903","904","905","906","907","908","909","915","916",
];

export function isValidNigerianPhone(raw: string): boolean {
  const intl = formatPhoneForTermii(raw); // always "234xxxxxxxxxx"
  if (!intl.startsWith("234") || intl.length < 13) return false;
  const local = intl.slice(3); // 10 digits
  return NG_PREFIXES.some((p) => local.startsWith(p));
}

// All format variants for a phone (covers format-rotation attacks)
function phoneVariants(raw: string): string[] {
  const intl = formatPhoneForTermii(raw); // "2348012345678"
  const all = [
    raw.trim(),
    raw.replace(/[\s\-().+]/g, ""),
    intl,
    "+" + intl,
    "0" + intl.slice(3),
    intl.slice(3),
  ];
  return all.filter((v, i, a) => v && a.indexOf(v) === i);
}

/**
 * Per-phone hourly SMS rate limit.
 * Uses the requests table (synchronously written before SMS fires) so there's
 * no async race between the check and the log write.
 */
export async function checkPhoneSmsRateLimit(
  rawPhone: string,
  max = 3,
  windowMs = 60 * 60 * 1000,
): Promise<{ allowed: boolean; count: number }> {
  const variants = phoneVariants(rawPhone);
  try {
    const count = await prisma.request.count({
      where: {
        patient_phone: { in: variants },
        created_at: { gt: new Date(Date.now() - windowMs) },
      },
    });
    return { allowed: count < max, count };
  } catch (err) {
    console.warn("[sms-guard] checkPhoneSmsRateLimit failed, allowing send:", (err as Error).message);
    return { allowed: true, count: 0 };
  }
}

/**
 * Global daily SMS circuit breaker.
 * Uses sms_logs (indexed on created_at) for an accurate SMS-send count.
 * Configured via DAILY_SMS_CAP env var (default 500).
 * Fails open (allows send) if the table doesn't exist yet.
 */
export async function checkDailySmsCap(): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = parseInt(process.env.DAILY_SMS_CAP ?? "500", 10);
  try {
    const count = await prisma.smsLog.count({
      where: {
        channel: "sms",
        created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (count >= Math.floor(limit * 0.8)) {
      console.warn(`[sms-guard] ⚠️  Daily SMS ${count}/${limit} (${Math.round((count / limit) * 100)}%)`);
    }
    return { allowed: count < limit, count, limit };
  } catch (err) {
    // Table may not exist in this environment yet — fail open so SMS still sends
    console.warn("[sms-guard] checkDailySmsCap failed (table missing?), allowing send:", (err as Error).message);
    return { allowed: true, count: 0, limit };
  }
}

/**
 * Global daily WhatsApp circuit breaker — the WhatsApp twin of checkDailySmsCap.
 * Counted separately because WhatsApp conversations are priced differently from
 * SMS, so one channel running hot must not silence the other.
 * Configured via DAILY_WHATSAPP_CAP (default 1000). Fails open.
 */
export async function checkDailyWhatsAppCap(): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = dailyWhatsAppCap();
  try {
    const count = await prisma.smsLog.count({
      where: {
        channel: "whatsapp",
        created_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (count >= Math.floor(limit * 0.8)) {
      console.warn(`[sms-guard] ⚠️  Daily WhatsApp ${count}/${limit} (${Math.round((count / limit) * 100)}%)`);
    }
    return { allowed: count < limit, count, limit };
  } catch (err) {
    console.warn("[sms-guard] checkDailyWhatsAppCap failed (column missing?), allowing send:", (err as Error).message);
    return { allowed: true, count: 0, limit };
  }
}
