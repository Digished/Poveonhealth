export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConsultSettings } from "@/lib/consult";

/**
 * GET /api/consults/labs — partner labs a member can be sent to.
 *
 * The public lab directory, trimmed to what the care plan needs and filtered
 * by state the same way the pharmacy directory is.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const state = (params.get("state") ?? "").trim();
    const q = (params.get("q") ?? "").trim();

    const where: Prisma.LabWhereInput = { hidden: false, search_hidden: false };
    if (state) where.state = { equals: state, mode: "insensitive" };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ];
    }

    const [labs, settings, states] = await Promise.all([
      prisma.lab.findMany({
        where,
        orderBy: [{ state: "asc" }, { name: "asc" }],
        take: 300,
        select: { id: true, name: true, logo_url: true, address: true, city: true, state: true, phones: true },
      }),
      getConsultSettings(),
      prisma.lab.findMany({
        where: { hidden: false, search_hidden: false, state: { not: null } },
        distinct: ["state"],
        select: { state: true },
        orderBy: { state: "asc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      discount_percent: settings.lab_discount_percent,
      states: states.map((s) => s.state).filter(Boolean),
      labs,
    });
  } catch (err) {
    console.error("[consults/labs]", err);
    return NextResponse.json({ error: "Could not load labs." }, { status: 500 });
  }
}
