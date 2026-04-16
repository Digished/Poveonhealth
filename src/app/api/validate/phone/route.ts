import { NextRequest, NextResponse } from "next/server";
import { formatPhoneForTermii } from "@/lib/sms/termii";

/**
 * POST /api/validate/phone
 * Body: { phone: string }
 *
 * Returns:
 *  { valid: true,  network: string, formatted: string }
 *  { valid: false, reason: string }
 *
 * Strategy:
 *  1. Normalise + check against known Nigerian mobile prefixes (instant, no I/O)
 *  2. Optionally call Termii Insights to confirm the number is live and get
 *     the confirmed network name (times out in 4 s, gracefully falls back).
 */

// Nigerian mobile prefixes (first 4 local digits, e.g. "0803")
const NETWORK: Record<string, string> = {
  // MTN
  "0703": "MTN", "0706": "MTN",
  "0803": "MTN", "0806": "MTN", "0810": "MTN", "0813": "MTN", "0814": "MTN", "0816": "MTN",
  "0903": "MTN", "0906": "MTN", "0913": "MTN", "0916": "MTN",
  // Airtel
  "0701": "Airtel", "0708": "Airtel",
  "0802": "Airtel", "0808": "Airtel", "0812": "Airtel",
  "0901": "Airtel", "0902": "Airtel", "0904": "Airtel", "0907": "Airtel",
  // Glo
  "0805": "Glo", "0807": "Glo", "0811": "Glo", "0815": "Glo",
  "0905": "Glo", "0915": "Glo",
  // 9mobile
  "0809": "9mobile", "0817": "9mobile", "0818": "9mobile",
  "0908": "9mobile", "0909": "9mobile",
};

/** Normalise any Nigerian phone variant to local 11-digit "0xxx" form. */
function toLocal(raw: string): string | null {
  let p = raw.replace(/[\s\-().+]/g, "");
  if (p.startsWith("234")) p = "0" + p.slice(3);
  if (!p.startsWith("0")) {
    // Bare 10-digit number without leading zero
    if (p.length === 10) p = "0" + p;
    else return null;
  }
  return p.length === 11 ? p : null;
}

/** Format "08012345678" → "0801 234 5678" */
function prettyLocal(local: string): string {
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ valid: false, reason: "Missing phone" }, { status: 400 });
    }

    const local = toLocal(phone);
    if (!local) {
      return NextResponse.json({ valid: false, reason: "Not a valid 11-digit Nigerian number" });
    }

    const prefix = local.slice(0, 4);
    const prefixNetwork = NETWORK[prefix];
    if (!prefixNetwork) {
      return NextResponse.json({ valid: false, reason: "Unrecognised Nigerian network prefix" });
    }

    // Try Termii Insights for live network confirmation (optional, non-blocking)
    const API_KEY = process.env.TERMII_API_KEY;
    let confirmedNetwork = prefixNetwork;

    if (API_KEY) {
      try {
        const intl = formatPhoneForTermii(phone); // "2348012345678"
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const res = await fetch("https://v3.api.termii.com/api/insight/number/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: API_KEY,
            phone_number: intl,
            network_country_code: "NG",
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.network) confirmedNetwork = data.network;
        }
      } catch {
        // Timeout or API not available on this plan — use prefix-based network
      }
    }

    return NextResponse.json({
      valid: true,
      network: confirmedNetwork,
      formatted: prettyLocal(local),
    });
  } catch {
    return NextResponse.json({ valid: false, reason: "Server error" }, { status: 500 });
  }
}
