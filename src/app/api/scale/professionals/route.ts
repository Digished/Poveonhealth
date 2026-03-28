export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getMarketer(req: NextRequest) {
  const token = req.cookies.get("scale_token")?.value;
  if (!token) return null;
  const session = await prisma.marketerSession.findUnique({
    where: { id: token },
    include: { marketer: true },
  });
  if (!session || session.expires_at < new Date()) return null;
  return session.marketer;
}

/**
 * POST /api/scale/professionals
 * Marketer pre-creates a doctor profile.
 * Body: { email, full_name, prefix?, specialty?, phone?, hospitals?, bank_name?, account_number?, account_name? }
 */
export async function POST(req: NextRequest) {
  const marketer = await getMarketer(req);
  if (!marketer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (marketer.suspended) return NextResponse.json({ error: "Account suspended" }, { status: 403 });

  const body = await req.json();
  const { email, full_name, prefix, phone, hospitals, bank_name, account_number, account_name } = body;

  if (!email?.trim())     return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (!full_name?.trim()) return NextResponse.json({ error: "Full name is required." }, { status: 400 });

  const normalised = email.trim().toLowerCase();

  // Check if a profile already exists for this email
  const existing = await prisma.doctorProfile.findUnique({
    where: { email: normalised },
    select: { claimed: true, created_by_marketer_id: true },
  });
  if (existing?.claimed) {
    return NextResponse.json({ error: "A doctor with this email has already registered." }, { status: 409 });
  }
  // Another marketer already created an unclaimed profile for this email
  if (existing && existing.created_by_marketer_id && existing.created_by_marketer_id !== marketer.id) {
    return NextResponse.json({ error: "This email has already been added by another marketer." }, { status: 409 });
  }

  // Upsert the profile (create or overwrite an existing unclaimed draft)
  const profile = await prisma.doctorProfile.upsert({
    where: { email: normalised },
    create: {
      email:                  normalised,
      prefix:                 prefix?.trim()          || null,
      full_name:              full_name.trim(),
      phone:                  phone?.trim()            || null,
      hospitals:              Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
      bank_name:              bank_name?.trim()        || null,
      account_number:         account_number?.trim()   || null,
      account_name:           account_name?.trim()     || null,
      claimed:                false,
      created_by_marketer_id: marketer.id,
    },
    update: {
      prefix:                 prefix?.trim()          || null,
      full_name:              full_name.trim(),
      phone:                  phone?.trim()            || null,
      hospitals:              Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
      bank_name:              bank_name?.trim()        || null,
      account_number:         account_number?.trim()   || null,
      account_name:           account_name?.trim()     || null,
      claimed:                false,
      created_by_marketer_id: marketer.id,
    },
  });

  // Create the marketer-doctor link if not already present
  await prisma.doctorMarketerLink.upsert({
    where:  { doctor_email: normalised },
    create: { doctor_email: normalised, marketer_id: marketer.id },
    update: {}, // already linked — don't change ownership
  });

  return NextResponse.json({ success: true, profile });
}
