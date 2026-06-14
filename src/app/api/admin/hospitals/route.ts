export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { hospitalAccountCreated } from "@/lib/email/templates";
import { isKnownSpecialty } from "@/lib/specialties";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/hospitals — list all hospitals with doctor counts */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const hospitals = await prisma.hospital.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
  });

  // Count how many doctor profiles list each hospital
  const allProfiles = await prisma.doctorProfile.findMany({ select: { hospitals: true } });
  const countMap = new Map<string, number>();
  for (const p of allProfiles) {
    for (const h of p.hospitals) {
      countMap.set(h, (countMap.get(h) ?? 0) + 1);
    }
  }

  const hospitalsWithCount = hospitals.map((h) => ({
    ...h,
    doctor_count: countMap.get(h.name) ?? 0,
  }));

  return NextResponse.json({ success: true, hospitals: hospitalsWithCount });
}

/** POST /api/admin/hospitals — create a hospital (optionally with a referral portal account) */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, city, state, address, email, phone, specialties } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const normalisedEmail = email?.trim() ? String(email).trim().toLowerCase() : null;
  const cleanSpecialties = Array.isArray(specialties)
    ? specialties.map((s: unknown) => String(s).trim()).filter(isKnownSpecialty)
    : [];

  try {
    const hospital = await prisma.hospital.create({
      data: {
        name: name.trim(),
        city: city?.trim() || null,
        state: state?.trim() || null,
        address: address?.trim() || null,
        email: normalisedEmail,
        phone: phone?.trim() || null,
        specialties: cleanSpecialties,
      },
    });

    // Setting an email activates the hospital's referral portal account — invite them
    if (normalisedEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
      resend.emails
        .send({
          from: FROM_ADDRESS,
          to: normalisedEmail,
          subject: "Your hospital is now on the Poveon referral network",
          html: hospitalAccountCreated({
            hospitalName: hospital.name,
            email: normalisedEmail,
            loginUrl: `${appUrl}/hospital-login`,
          }),
        })
        .then(({ error }) => { if (error) console.error("[admin/hospitals] invite email:", JSON.stringify(error)); })
        .catch((e) => console.error("[admin/hospitals] invite email error:", e));
    }

    return NextResponse.json({ success: true, hospital });
  } catch {
    return NextResponse.json({ error: "Already exists or invalid data" }, { status: 409 });
  }
}
