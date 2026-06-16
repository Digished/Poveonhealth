import { NextRequest, NextResponse } from "next/server";
import { parseReferralText } from "@/lib/parse-referral";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, labId } = body as { text?: string; labId?: string };

    if (!text || typeof text !== "string" || text.trim().length < 3) {
      return NextResponse.json({ success: false, error: "Please dictate or type the referral first." }, { status: 400 });
    }
    if (text.length > 4000) {
      return NextResponse.json({ success: false, error: "That note is too long to parse." }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const { parsed, resolvedTests } = await parseReferralText(text, labId, baseUrl);
    return NextResponse.json({ success: true, parsed, resolvedTests });
  } catch (err) {
    console.error("[parse-text]", err);
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 429) {
      return NextResponse.json({ success: false, error: "AI service is busy. Type the details instead." }, { status: 429 });
    }
    return NextResponse.json({ success: false, error: "Parsing failed. Please type the details instead." }, { status: 500 });
  }
}
