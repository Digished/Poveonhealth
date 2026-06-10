export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";
import { isKnownSpecialty } from "@/lib/specialties";

/** PATCH /api/hospital/profile — hospital updates its own contact info & specialties */
export async function PATCH(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.phone !== undefined) data.phone = String(body.phone).trim() || null;
    if (body.address !== undefined) data.address = String(body.address).trim() || null;
    if (body.city !== undefined) data.city = String(body.city).trim() || null;
    if (body.state !== undefined) data.state = String(body.state).trim() || null;
    if (body.specialties !== undefined) {
      if (!Array.isArray(body.specialties)) {
        return NextResponse.json({ error: "Specialties must be a list." }, { status: 400 });
      }
      const cleaned = body.specialties.map((s: unknown) => String(s).trim()).filter(isKnownSpecialty);
      data.specialties = cleaned;
    }

    const updated = await prisma.hospital.update({ where: { id: hospital.id }, data });
    return NextResponse.json({ success: true, hospital: updated });
  } catch (err) {
    console.error("[hospital/profile]", err);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
