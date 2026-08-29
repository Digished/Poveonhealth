export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { activeMemberWhere, getConsultSettings } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const PAGE_SIZE = 25;

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/consults/members — every care-plan member, with revenue. */
export async function GET(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const where: Prisma.ConsultPatientWhereInput = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { full_name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { doctor_email: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, members, revenue, activeCount, unassigned] = await Promise.all([
    prisma.consultPatient.count({ where }),
    prisma.consultPatient.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, code: true, full_name: true, email: true, phone: true,
        conditions: true, status: true, doctor_email: true,
        subscribed_at: true, expires_at: true, amount_paid: true,
        messages_used: true, message_allowance: true,
      },
    }),
    prisma.consultPatient.aggregate({ where: activeMemberWhere(), _sum: { amount_paid: true } }),
    prisma.consultPatient.count({ where: activeMemberWhere() }),
    prisma.consultPatient.count({ where: { ...activeMemberWhere(), doctor_email: null } }),
  ]);

  const settings = await getConsultSettings();
  const committed = activeCount * settings.doctor_share_naira;

  return NextResponse.json({
    success: true,
    total,
    page,
    has_more: page * PAGE_SIZE < total,
    summary: {
      active_members: activeCount,
      unassigned: unassigned,
      gross_revenue: Math.round(Number(revenue._sum.amount_paid ?? 0)),
      committed_to_doctors: committed,
    },
    members: members.map((m) => ({ ...m, amount_paid: m.amount_paid ? Number(m.amount_paid) : null })),
  });
}

const AssignSchema = z.object({
  patient_id: z.string().min(1),
  doctor_email: z.string().email().nullable(),
});

/**
 * PATCH /api/admin/consults/members — move a member to a different doctor.
 *
 * The entitlement moves with them, so the new doctor's pool (and monthly
 * figure) picks up what the old doctor's loses.
 */
export async function PATCH(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = AssignSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid assignment." }, { status: 400 });
  const { patient_id, doctor_email } = parsed.data;

  const patient = await prisma.consultPatient.findUnique({ where: { id: patient_id } });
  if (!patient) return NextResponse.json({ error: "Member not found." }, { status: 404 });

  if (doctor_email) {
    const doctor = await prisma.doctorProfile.findUnique({ where: { email: doctor_email }, select: { email: true } });
    if (!doctor) return NextResponse.json({ error: "That doctor has no Poveon profile." }, { status: 404 });
  }

  const settings = await getConsultSettings();

  await prisma.consultPatient.update({
    where: { id: patient_id },
    data: { doctor_email, assigned_at: doctor_email ? new Date() : null },
  });

  if (doctor_email && patient.status === "active") {
    // The entitlement follows the member, so the new doctor's pool picks up
    // exactly what the old doctor's loses — already-released money stays put.
    const open = await prisma.consultEarning.findFirst({
      where: { patient_id, status: "pending" },
      select: { id: true },
    });
    if (open) {
      await prisma.consultEarning.update({ where: { id: open.id }, data: { doctor_email } });
    } else {
      await prisma.consultEarning.create({
        data: { doctor_email, patient_id, total_naira: settings.doctor_share_naira },
      });
    }
  }

  return NextResponse.json({ success: true });
}
