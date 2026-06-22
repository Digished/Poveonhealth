export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";
import { generateHospitalNumber } from "@/lib/emr/server";

/** GET — list / search patients for the hospital */
export async function GET(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    const patients = await prisma.hospitalPatient.findMany({
      where: {
        hospital_id: hospital.id,
        ...(q
          ? {
              OR: [
                { full_name: { contains: q, mode: "insensitive" } },
                { hospital_number: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, patients });
  } catch (err) {
    console.error("[emr/patients GET]", err);
    return NextResponse.json({ error: "Failed to load patients." }, { status: 500 });
  }
}

/** POST — register a new patient (super admin path; onboarding clerk uses /api/emr/onboarding) */
export async function POST(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await req.json();
    const full_name = String(body.full_name ?? "").trim();
    if (!full_name) return NextResponse.json({ error: "Patient name is required." }, { status: 400 });

    const hospital_number = await generateHospitalNumber(hospital.id);

    const patient = await prisma.hospitalPatient.create({
      data: {
        hospital_id: hospital.id,
        hospital_number,
        full_name,
        age: body.age != null && body.age !== "" ? parseInt(body.age, 10) : null,
        sex: body.sex || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        occupation: body.occupation || null,
        marital_status: body.marital_status || null,
        blood_group: body.blood_group || null,
        genotype: body.genotype || null,
        allergies: body.allergies || null,
        known_conditions: body.known_conditions || null,
        next_of_kin_name: body.next_of_kin_name || null,
        next_of_kin_relationship: body.next_of_kin_relationship || null,
        next_of_kin_phone: body.next_of_kin_phone || null,
        next_of_kin_address: body.next_of_kin_address || null,
        insurance_provider: body.insurance_provider || null,
        insurance_number: body.insurance_number || null,
        created_by: hospital.email ?? "super_admin",
      },
    });

    return NextResponse.json({ success: true, patient });
  } catch (err) {
    console.error("[emr/patients POST]", err);
    return NextResponse.json({ error: "Failed to register patient." }, { status: 500 });
  }
}
