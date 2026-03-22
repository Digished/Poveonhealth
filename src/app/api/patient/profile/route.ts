export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function getPatientEmail(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("patient_token")?.value;
  if (!token) return null;
  const session = await prisma.patientSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;
  return session.patient_email;
}

// GET /api/patient/profile — fetch own profile (authenticated) OR lookup by email (for doctor auto-fill)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lookupEmail = searchParams.get("email");

  // Public lookup by email — used by DoctorRequestForm to auto-fill patient name
  if (lookupEmail) {
    const profile = await prisma.patientProfile.findUnique({ where: { email: lookupEmail.toLowerCase() } });
    if (!profile) return NextResponse.json({ success: false });
    return NextResponse.json({ success: true, name: profile.name, phone: profile.phone });
  }

  // Authenticated: return own profile
  const email = await getPatientEmail(req);
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const profile = await prisma.patientProfile.findUnique({ where: { email } });
  return NextResponse.json({ success: true, profile: profile ?? { name: null, phone: null } });
}

// PATCH /api/patient/profile — update own profile (authenticated)
const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional(),
});

export async function PATCH(req: NextRequest) {
  const email = await getPatientEmail(req);
  if (!email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const profile = await prisma.patientProfile.upsert({
    where: { email },
    update: parsed.data,
    create: { email, ...parsed.data },
  });

  return NextResponse.json({ success: true, profile });
}
