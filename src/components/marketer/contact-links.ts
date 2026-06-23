// Build WhatsApp / call / SMS deep links from a (possibly messy) phone number.
// Defaults a bare 0-prefixed 11-digit Nigerian number to +234.

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 11) digits = "234" + digits.slice(1);
  if (digits.length === 10) digits = "234" + digits; // missing leading 0
  return digits;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const d = normalizePhone(phone);
  if (!d) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function telLink(phone: string | null | undefined): string | null {
  const d = normalizePhone(phone);
  return d ? `tel:+${d}` : null;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]?.replace(/^dr\.?$/i, "").trim() || name;
}
