export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parentSpecialtyOf } from "@/lib/specialties";

/**
 * GET /api/referrals/suggest?specialty=Interventional%20Cardiology&q=lagos
 * Public — suggests active referral-network hospitals offering a specialty.
 * For a sub-specialty, hospitals offering it exactly are listed first,
 * followed by hospitals offering the parent specialty generally.
 * Only hospitals with a login email are included (they can receive & respond).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const specialty = searchParams.get("specialty")?.trim();
    const q = searchParams.get("q")?.trim();
    const exclude = searchParams.get("exclude")?.trim(); // hospital id to leave out (e.g. when redirecting)

    const parent = specialty ? parentSpecialtyOf(specialty) : null;
    const conditions: object[] = [];
    if (specialty) {
      conditions.push(
        parent
          ? { OR: [{ specialties: { array_contains: [specialty] } }, { specialties: { array_contains: [parent] } }] }
          : { specialties: { array_contains: [specialty] } }
      );
    }
    if (q) {
      conditions.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { state: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const hospitals = await prisma.hospital.findMany({
      where: {
        is_active: true,
        email: { not: null },
        ...(exclude ? { id: { not: exclude } } : {}),
        AND: conditions,
      },
      orderBy: { name: "asc" },
      take: 30,
      select: { id: true, name: true, city: true, state: true, address: true, specialties: true },
    });

    // Exact sub-specialty matches first; parent-only matches after
    const withMatch = hospitals.map((h) => ({
      ...h,
      exact_match: !specialty || (Array.isArray(h.specialties) && (h.specialties as string[]).includes(specialty)),
    }));
    withMatch.sort((a, b) => Number(b.exact_match) - Number(a.exact_match) || a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, hospitals: withMatch });
  } catch (err) {
    console.error("[referrals/suggest]", err);
    return NextResponse.json({ error: "Failed to load hospitals." }, { status: 500 });
  }
}
