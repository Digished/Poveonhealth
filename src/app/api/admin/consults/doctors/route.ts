export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { activeMemberWhere, getConsultSettings } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/consults/doctors — who a member can be assigned to.
 *
 * Approved doctors first with their current load, so reassigning is a choice
 * from a list rather than typing an email from memory. Unapproved doctors are
 * included but flagged: an admin may still assign one deliberately, and seeing
 * why they're not in the rotation is the useful part.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const profiles = await prisma.doctorProfile.findMany({
    where: {
      full_name: { not: null },
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      email: true, full_name: true, prefix: true, specialty: true,
      consult_approved: true, consult_accepting: true, consult_patient_cap: true,
    },
    orderBy: { full_name: "asc" },
    take: 300,
  });

  const emails = profiles.map((p) => p.email);
  const counts = emails.length
    ? await prisma.consultPatient.groupBy({
        by: ["doctor_email"],
        where: { doctor_email: { in: emails }, ...activeMemberWhere() },
        _count: { id: true },
      })
    : [];
  const load = new Map<string, number>();
  for (const c of counts) if (c.doctor_email) load.set(c.doctor_email, c._count.id);

  const settings = await getConsultSettings();

  const doctors = profiles.map((p) => {
    const members = load.get(p.email) ?? 0;
    const cap = p.consult_patient_cap ?? settings.default_doctor_cap;
    return {
      email: p.email,
      name: `${p.prefix ? `${p.prefix} ` : ""}${p.full_name ?? ""}`.trim() || p.email,
      specialty: p.specialty,
      approved: p.consult_approved,
      accepting: p.consult_accepting,
      members,
      cap,
      full: members >= cap,
    };
  });

  // Approved and with room first — that's who you almost always want.
  doctors.sort((a, b) => {
    if (a.approved !== b.approved) return a.approved ? -1 : 1;
    if (a.full !== b.full) return a.full ? 1 : -1;
    return a.members - b.members || a.name.localeCompare(b.name);
  });

  return NextResponse.json({ success: true, doctors });
}
