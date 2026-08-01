/**
 * Phone normalisation for WhatsApp.
 *
 * Twilio requires strict E.164 ("+2348012345678"). Unlike the Termii helper —
 * which force-prefixes 234 because that account is Nigeria-only — this keeps
 * an explicit country code when the caller supplied one, so referrals to
 * foreign numbers still work.
 */

import { DEFAULT_COUNTRY_CODE } from "./config";

/**
 * Convert a messy user-entered phone into E.164, or null when it can't be
 * salvaged into something plausibly dialable.
 *
 *   "08012345678"    → "+2348012345678"
 *   "+234 801 234 5678" → "+2348012345678"
 *   "2348012345678"  → "+2348012345678"
 *   "8012345678"     → "+2348012345678"
 *   "+1 415 523 8886"→ "+14155238886"
 *   "00234801..."    → "+234801..."
 */
export function toE164(raw: string | null | undefined, defaultCc = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hadPlus) {
    // Caller gave an explicit country code — trust it as-is.
    return isPlausible(digits) ? `+${digits}` : null;
  }

  // International access prefix ("00" / "011") written without a "+"
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("011") && digits.length > 12) digits = digits.slice(3);
  // National trunk prefix: 0801… → 234801…
  else if (digits.startsWith("0")) digits = `${defaultCc}${digits.slice(1)}`;
  // Bare subscriber number with no country code at all
  else if (digits.length === 10 && !digits.startsWith(defaultCc)) digits = `${defaultCc}${digits}`;

  return isPlausible(digits) ? `+${digits}` : null;
}

/** E.164 allows 8–15 digits including the country code. */
function isPlausible(digits: string): boolean {
  return digits.length >= 8 && digits.length <= 15;
}

/** Twilio's channel-qualified address: "whatsapp:+2348012345678". */
export function toWhatsAppAddress(raw: string | null | undefined): string | null {
  const e164 = toE164(raw);
  return e164 ? `whatsapp:${e164}` : null;
}

/** Strip the channel prefix from an inbound Twilio address. */
export function fromWhatsAppAddress(address: string): string {
  return address.replace(/^whatsapp:/i, "").trim();
}
