export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConsultSettings } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/consults/pharmacies — the partner pharmacies a member can use.
 *
 * Open to anyone: it's a directory of shops that honour the care code, and
 * showing it before someone joins is the point. Only public-facing columns are
 * returned — never the pharmacy's own customer book.
 *
 * Query params: `state`, `q`.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const params = req.nextUrl.searchParams;
    const state = (params.get("state") ?? "").trim();
    const q = (params.get("q") ?? "").trim();

    const where: Prisma.PharmacyWhereInput = { active: true };
    if (state) where.state = { equals: state, mode: "insensitive" };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ];
    }

    const [pharmacies, settings, allStates] = await Promise.all([
      prisma.pharmacy.findMany({
        where,
        orderBy: [{ state: "asc" }, { name: "asc" }],
        take: 300,
        select: {
          id: true, name: true, logo_url: true, phone: true, address: true,
          city: true, state: true, discount_percent: true,
        },
      }),
      getConsultSettings(),
      // The filter only offers states that actually have a partner in them.
      prisma.pharmacy.findMany({
        where: { active: true, state: { not: null } },
        distinct: ["state"],
        select: { state: true },
        orderBy: { state: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      default_discount: settings.pharmacy_discount_percent,
      states: allStates.map((s) => s.state).filter(Boolean),
      pharmacies: pharmacies.map((p) => ({
        ...p,
        discount_percent: p.discount_percent || settings.pharmacy_discount_percent,
      })),
    });
  } catch (err) {
    console.error("[consults/pharmacies]", err);
    return NextResponse.json({ error: "Could not load pharmacies." }, { status: 500 });
  }
}
