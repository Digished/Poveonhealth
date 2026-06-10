export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/referrals/suggest?specialty=Cardiology&q=lagos
 * Public — suggests active referral-network hospitals offering a specialty.
 * Only hospitals with a login email are included (they can receive & respond).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const specialty = searchParams.get("specialty")?.trim();
    const q = searchParams.get("q")?.trim();
    const exclude = searchParams.get("exclude")?.trim(); // hospital id to leave out (e.g. when redirecting)

    const hospitals = await prisma.hospital.findMany({
      where: {
        is_active: true,
        email: { not: null },
        ...(exclude ? { id: { not: exclude } } : {}),
        ...(specialty ? { specialties: { array_contains: [specialty] } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { state: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 30,
      select: { id: true, name: true, city: true, state: true, address: true, specialties: true },
    });

    return NextResponse.json({ success: true, hospitals });
  } catch (err) {
    console.error("[referrals/suggest]", err);
    return NextResponse.json({ error: "Failed to load hospitals." }, { status: 500 });
  }
}
