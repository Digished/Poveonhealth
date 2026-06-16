export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

/** Whole-years age from an ISO "YYYY-MM-DD" dob string, or null. */
function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Approximate ISO dob from an age in years (1 Jan of the birth year). */
function dobFromAge(age: number): string {
  return `${new Date().getFullYear() - age}-01-01`;
}

async function getPatientEmail(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("patient_token")?.value;
  if (!token) return null;
  const session = await prisma.patientSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;
  return session.patient_email;
}

// GET /api/patient/profile
// - ?email=X  → public lookup by email (for doctor form auto-fill)
// - ?phone=X  → public lookup by phone (for doctor form auto-fill)
// - no params → authenticated: return own full profile
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lookupEmail = searchParams.get("email");
  const lookupPhone = searchParams.get("phone");

  if (lookupEmail) {
    const profile = await prisma.patientProfile.findUnique({ where: { email: lookupEmail.toLowerCase() } });
    if (!profile) return NextResponse.json({ success: false });
    return NextResponse.json({ success: true, name: profile.name, phone: profile.phone, dob: profile.dob, age: ageFromDob(profile.dob), sex: profile.sex });
  }

  if (lookupPhone) {
    const digits = lookupPhone.replace(/\D/g, "");
    if (digits.length < 6) return NextResponse.json({ success: false });
    const profiles = await prisma.patientProfile.findMany({
      where: { phone: { not: null } },
      select: { email: true, name: true, phone: true, dob: true, sex: true },
    });
    const match = profiles.find((p) => {
      if (!p.phone) return false;
      const stored = p.phone.replace(/\D/g, "");
      return stored === digits || stored.endsWith(digits) || digits.endsWith(stored);
    });
    if (!match) return NextResponse.json({ success: false });
    return NextResponse.json({ success: true, name: match.name, phone: match.phone, dob: match.dob, age: ageFromDob(match.dob), sex: match.sex });
  }

  // Authenticated: return own full profile
  const email = await getPatientEmail(req);
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const profile = await prisma.patientProfile.findUnique({ where: { email } });
  return NextResponse.json({
    success: true,
    profile: profile ?? { name: null, phone: null, dob: null, sex: null, address: null },
  });
}

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  dob: z.string().max(20).optional(),
  // Age in years — stored as an approximate dob so the profile stays accurate over time.
  age: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).max(130).optional()
  ),
  sex: z.enum(["male", "female", "other"]).optional(),
  address: z.string().max(500).optional(),
});

// PATCH /api/patient/profile — update own profile (authenticated)
export async function PATCH(req: NextRequest) {
  const email = await getPatientEmail(req);
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // PatientProfile stores dob (not a plain age) so it stays valid over time —
  // fold a provided age into an approximate dob and drop the age key.
  const { age, ...rest } = parsed.data;
  const data = age != null ? { ...rest, dob: dobFromAge(age) } : rest;

  const profile = await prisma.patientProfile.upsert({
    where: { email },
    update: data,
    create: { email, ...data },
  });

  // Propagate name change to all existing Request records for this patient
  // so lab dashboards and reports reflect the patient's self-updated name
  if (parsed.data.name) {
    await prisma.request.updateMany({
      where: { patient_email: email },
      data: { patient_name: parsed.data.name },
    }).catch(() => null); // non-blocking — don't fail the profile save if this errors
  }

  return NextResponse.json({ success: true, profile });
}
