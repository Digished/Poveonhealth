import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";

/**
 * POST /api/validate/email
 * Body: { email: string }
 *
 * Returns:
 *  { valid: true }
 *  { valid: false, suggestion: string }   ← known domain typo, corrected
 *  { valid: false, reason: string }       ← bad format or MX lookup failed
 *
 * Strategy:
 *  1. Basic format check
 *  2. Known-typo table → suggest correction instantly
 *  3. DNS MX lookup → confirm domain can receive email (4 s timeout)
 */

// Common email domain typos mapped to their correct form
const TYPOS: Record<string, string> = {
  // Gmail
  "gmial.com":   "gmail.com",
  "gmal.com":    "gmail.com",
  "gmail.co":    "gmail.com",
  "gmail.con":   "gmail.com",
  "gnail.com":   "gmail.com",
  "gmali.com":   "gmail.com",
  "gmaill.com":  "gmail.com",
  "gamil.com":   "gmail.com",
  "gemail.com":  "gmail.com",
  "gmail.cm":    "gmail.com",
  // Yahoo
  "yahooo.com":  "yahoo.com",
  "yhoo.com":    "yahoo.com",
  "yahoo.con":   "yahoo.com",
  "yaho.com":    "yahoo.com",
  "yaahoo.com":  "yahoo.com",
  "ymail.con":   "ymail.com",
  // Hotmail
  "hotmal.com":  "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmali.com": "hotmail.com",
  "hotmall.com": "hotmail.com",
  "hotmaill.com":"hotmail.com",
  // Outlook
  "outlok.com":  "outlook.com",
  "outloook.com":"outlook.com",
  "outlook.con": "outlook.com",
  // iCloud
  "iclould.com": "icloud.com",
  "icould.com":  "icloud.com",
  "iclod.com":   "icloud.com",
  // Nigerian / common
  "rocketmail.con": "rocketmail.com",
};

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ valid: false, reason: "Missing email" }, { status: 400 });
    }

    const trimmed = email.trim().toLowerCase();
    const atIdx = trimmed.lastIndexOf("@");

    if (atIdx < 1 || !trimmed.slice(atIdx + 1).includes(".")) {
      return NextResponse.json({ valid: false, reason: "Invalid email format" });
    }

    const localPart = email.trim().slice(0, atIdx); // preserve original casing
    const domain = trimmed.slice(atIdx + 1);

    // ── 1. Known typo table ──────────────────────────────────────────────────
    const correction = TYPOS[domain];
    if (correction) {
      return NextResponse.json({
        valid: false,
        suggestion: `${localPart}@${correction}`,
      });
    }

    // ── 2. DNS MX lookup ─────────────────────────────────────────────────────
    try {
      const mx = await Promise.race<unknown[]>([
        dns.resolveMx(domain) as Promise<unknown[]>,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 4000)
        ),
      ]);

      if (!Array.isArray(mx) || mx.length === 0) {
        return NextResponse.json({ valid: false, reason: "This email domain cannot receive email" });
      }

      return NextResponse.json({ valid: true });
    } catch (err) {
      if (err instanceof Error && err.message === "timeout") {
        // DNS too slow — don't penalise the user, pass it as valid
        return NextResponse.json({ valid: true });
      }
      // NXDOMAIN or other DNS failure → domain likely doesn't exist
      return NextResponse.json({ valid: false, reason: "This email domain doesn't exist" });
    }
  } catch {
    return NextResponse.json({ valid: false, reason: "Server error" }, { status: 500 });
  }
}
