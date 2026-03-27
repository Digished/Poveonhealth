export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/hospitals?q=Lagos — public search for hospital dropdown */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const hospitals = await prisma.hospital.findMany({
    where: {
      is_active: true,
      ...(q.length >= 1 ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, city: true },
  });

  return NextResponse.json({ success: true, hospitals });
}
