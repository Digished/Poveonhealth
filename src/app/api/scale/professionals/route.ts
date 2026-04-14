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
 * Marketer creates a new doctor profile or assigns an existing one to themselves.
 * Body: { email, full_name?, prefix?, phone?, hospitals?, bank_name?, account_number?, account_name? }
 *
 * Outcomes:
 * - Doctor profile doesn't exist            → creates profile + marketer link (full_name required)
 * - Profile exists, not linked in same lab  → creates/reassigns marketer link (claimed or unclaimed)
 * - Profile exists, already linked to me    → idempotent success
 * - Profile exists, linked to same-lab peer → 409 with peer's name
 */
export async function POST(req: NextRequest) {
  const marketer = await getMarketer(req);
  if (!marketer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (marketer.suspended) return NextResponse.json({ error: "Account suspended" }, { status: 403 });

  const body = await req.json();
  const { email, full_name, prefix, phone, hospitals, bank_name, account_number, account_name } = body;

  if (!email?.trim()) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const normalised = email.trim().toLowerCase();

  // Check if a profile already exists for this email
  const existing = await prisma.doctorProfile.findUnique({
    where: { email: normalised },
    select: { claimed: true },
  });

  if (existing) {
    // Profile exists (claimed or unclaimed) — only need to manage the marketer link

    // Already linked to this marketer — idempotent success
    const myLink = await prisma.doctorMarketerLink.findFirst({
      where: { doctor_email: normalised, marketer_id: marketer.id },
    });
    if (myLink) {
      const profile = await prisma.doctorProfile.findUnique({ where: { email: normalised } });
      return NextResponse.json({ success: true, profile });
    }

    // Check if a same-lab peer already has this doctor (team conflict)
    const myLabIds = (
      await prisma.labMarketer.findMany({
        where: { marketer_id: marketer.id },
        select: { lab_id: true },
      })
    ).map((l) => l.lab_id);

    if (myLabIds.length > 0) {
      const otherLink = await prisma.doctorMarketerLink.findFirst({
        where: { doctor_email: normalised },
        include: { marketer: { select: { name: true } } },
      });
      if (otherLink) {
        const otherInSameLab = await prisma.labMarketer.findFirst({
          where: { marketer_id: otherLink.marketer_id, lab_id: { in: myLabIds } },
        });
        if (otherInSameLab) {
          return NextResponse.json(
            { error: `This doctor is already assigned to ${otherLink.marketer.name} in your team.` },
            { status: 409 }
          );
        }
      }
    }

    // No same-lab conflict — assign this doctor to the current marketer
    await prisma.doctorMarketerLink.upsert({
      where:  { doctor_email: normalised },
      create: { doctor_email: normalised, marketer_id: marketer.id },
      update: { marketer_id: marketer.id },
    });

    const profile = await prisma.doctorProfile.findUnique({ where: { email: normalised } });
    return NextResponse.json({ success: true, profile });
  }

  // New profile — full_name is required
  if (!full_name?.trim()) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  // Upsert the profile (create or update an existing unclaimed draft)
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
      created_by_marketer_id: marketer.id,
    },
  });

  // Create the marketer-doctor link
  await prisma.doctorMarketerLink.upsert({
    where:  { doctor_email: normalised },
    create: { doctor_email: normalised, marketer_id: marketer.id },
    update: {}, // if somehow a link already exists, leave it unchanged
  });

  return NextResponse.json({ success: true, profile });
}
