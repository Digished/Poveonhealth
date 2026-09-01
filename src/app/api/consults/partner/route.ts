export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/consults/partner?kind=pharmacy&code=PH-4K29Q
 *
 * Turns the code on a partner's QR poster into the provider the enrolment form
 * shows as already chosen. Public: it reveals only what the partner directory
 * already lists.
 */
export async function GET(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get("kind");
    const code = (req.nextUrl.searchParams.get("code") ?? "").trim();
    if (!code) return NextResponse.json({ error: "No partner given." }, { status: 400 });

    if (kind === "pharmacy") {
      const pharmacy = await prisma.pharmacy.findFirst({
        where: { code: { equals: code, mode: "insensitive" }, active: true },
        select: {
          id: true, name: true, logo_url: true, phone: true,
          address: true, city: true, state: true, discount_percent: true,
        },
      });
      if (!pharmacy) return NextResponse.json({ success: true, provider: null });
      return NextResponse.json({ success: true, provider: pharmacy });
    }

    if (kind === "lab") {
      // Labs have no public short code, so the QR carries the slug.
      const lab = await prisma.lab.findFirst({
        where: { slug: { equals: code, mode: "insensitive" }, hidden: false },
        select: { id: true, name: true, logo_url: true, address: true, city: true, state: true },
      });
      if (!lab) return NextResponse.json({ success: true, provider: null });
      return NextResponse.json({ success: true, provider: lab });
    }

    return NextResponse.json({ error: "Unknown partner type." }, { status: 400 });
  } catch (err) {
    console.error("[consults/partner]", err);
    return NextResponse.json({ error: "Could not look that up." }, { status: 500 });
  }
}
