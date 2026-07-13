export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const Schema = z.object({
  doctor_email: z.string().email(),
  lab_id: z.string().uuid(),
});

/**
 * POST /api/perks/available
 * Given a doctor's email and a lab, return the active free-ride perks (with
 * uses remaining) the doctor may redeem for that lab. Drives the small,
 * non-disruptive "offer a free ride" prompt in the doctor request form (step 3).
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ perks: [] }, { headers: CORS_HEADERS });
    }
    const doctor_email = parsed.data.doctor_email.trim().toLowerCase();

    const perks = await prisma.doctorPerk.findMany({
      where: {
        doctor_email,
        lab_id: parsed.data.lab_id,
        is_active: true,
        remaining_uses: { gt: 0 },
      },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({
      perks: perks.map((p) => ({
        id: p.id,
        type: p.type,
        remaining_uses: p.remaining_uses,
        note: p.note,
      })),
    }, { headers: CORS_HEADERS });
  } catch (e) {
    console.error("[perks/available]", e);
    return NextResponse.json({ perks: [] }, { headers: CORS_HEADERS });
  }
}
