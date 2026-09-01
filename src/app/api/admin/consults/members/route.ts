export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { activeMemberWhere, getConsultSettings } from "@/lib/consult";
import { memberEconomics, yearlyCommitment } from "@/lib/doctor-pay";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const PAGE_SIZE = 25;

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}


/**
 * Poveon's margin per member, for a set of members.
 *
 * Two sources, both real money already received: the medication margin frozen
 * onto each paid order, and the lab commission on the request a test order
 * became. Gathered in grouped queries rather than one per member, because this
 * runs for a whole page of the admin list and again for every active member.
 */
async function marginFor(patientIds: string[]): Promise<Map<string, { medication: number; test: number }>> {
  const out = new Map<string, { medication: number; test: number }>();
  if (patientIds.length === 0) return out;

  const [medMargin, testOrders] = await Promise.all([
    prisma.medicationOrder.groupBy({
      by: ["patient_id"],
      // Only money that actually arrived. A pending order is a hope.
      where: { patient_id: { in: patientIds }, status: { in: ["paid", "ready", "collected"] } },
      _sum: { poveon_naira: true },
    }),
    // Lab commission lives on the request a test order became, so the two have
    // to be joined through it.
    prisma.consultTestOrder.findMany({
      where: { patient_id: { in: patientIds }, request_id: { not: null } },
      select: { patient_id: true, request_id: true },
    }),
  ]);

  const requestIds = Array.from(
    new Set(
      (testOrders as { request_id: string | null }[])
        .map((t) => t.request_id)
        .filter((r): r is string => !!r)
    )
  );
  const requests = requestIds.length
    ? await prisma.request.findMany({
        where: { id: { in: requestIds } },
        select: { id: true, poveon_amount: true },
      })
    : [];
  const poveonByRequest = new Map(
    (requests as { id: string; poveon_amount: unknown }[]).map((r) => [r.id, Number(r.poveon_amount ?? 0)])
  );

  const get = (id: string) => {
    let row = out.get(id);
    if (!row) { row = { medication: 0, test: 0 }; out.set(id, row); }
    return row;
  };
  for (const g of medMargin as { patient_id: string; _sum: { poveon_naira: unknown } }[]) {
    get(g.patient_id).medication = Number(g._sum.poveon_naira ?? 0);
  }
  for (const t of testOrders as { patient_id: string; request_id: string | null }[]) {
    if (!t.request_id) continue;
    get(t.patient_id).test += poveonByRequest.get(t.request_id) ?? 0;
  }
  return out;
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
  // A year of doctor pay for every member currently active. The retired lump
  // sum used to stand in for this; it is now derived from the monthly rate, so
  // the number moves when the rate does.
  const committed =
    activeCount * yearlyCommitment(settings.doctor_monthly_naira, settings.release_months);

  // ── What each member has earned Poveon, against what they cost ──────────
  // The programme's premise is that the joining fee does not pay the doctor —
  // the margin on refills, dispensing and tests does. That is checkable per
  // member, so it is checked: on this page's rows, and once across every
  // active member for the count at the top.
  const [pageMargin, carried] = await Promise.all([
    marginFor(members.map((m: { id: string }) => m.id)),
    (async () => {
      const live = await prisma.consultPatient.findMany({
        where: activeMemberWhere(),
        select: { id: true, subscribed_at: true },
      });
      const margin = await marginFor(live.map((m: { id: string }) => m.id));
      return live.filter((m: { id: string; subscribed_at: Date | null }) => {
        const row = margin.get(m.id);
        return memberEconomics({
          medicationNaira: row?.medication ?? 0,
          testNaira: row?.test ?? 0,
          subscribedAt: m.subscribed_at,
          doctorMonthlyNaira: settings.doctor_monthly_naira,
        }).belowDoctorFee;
      }).length;
    })(),
  ]);

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
      // Active members whose margin has not yet reached their doctor's fee.
      below_doctor_fee: carried,
      doctor_monthly_naira: settings.doctor_monthly_naira,
    },
    doctor_monthly_naira: settings.doctor_monthly_naira,
    members: members.map((m: (typeof members)[number]) => ({
      ...m,
      amount_paid: m.amount_paid ? Number(m.amount_paid) : null,
      economics: memberEconomics({
        medicationNaira: pageMargin.get(m.id)?.medication ?? 0,
        testNaira: pageMargin.get(m.id)?.test ?? 0,
        subscribedAt: m.subscribed_at,
        doctorMonthlyNaira: settings.doctor_monthly_naira,
      }),
    })),
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
  const { patient_id } = parsed.data;
  // Profiles are keyed on a lowercase email, so a typed or pasted address with
  // different casing used to 404 as "no Poveon profile".
  const doctorEmailRaw = parsed.data.doctor_email?.trim().toLowerCase() || null;

  const patient = await prisma.consultPatient.findUnique({ where: { id: patient_id } });
  if (!patient) return NextResponse.json({ error: "Member not found." }, { status: 404 });

  let doctor_email = doctorEmailRaw;
  if (doctor_email) {
    const doctor = await prisma.doctorProfile.findFirst({
      where: { email: { equals: doctor_email, mode: "insensitive" } },
      select: { email: true },
    });
    if (!doctor) {
      return NextResponse.json(
        { error: `No Poveon doctor profile for ${doctor_email}.` },
        { status: 404 }
      );
    }
    // Store exactly what the profile holds, so every downstream join matches.
    doctor_email = doctor.email;
  }

  const settings = await getConsultSettings();

  // Keep the trail of who has looked after them. The thread and the schedule
  // stay on the member, so the new doctor picks up the whole history — unless
  // the member has asked us not to share it (see `share_history`).
  const previous = Array.from(
    new Set([...(patient.previous_doctors ?? []), patient.doctor_email].filter(Boolean) as string[])
  ).filter((e) => e !== doctor_email);

  await prisma.consultPatient.update({
    where: { id: patient_id },
    data: {
      doctor_email,
      assigned_at: doctor_email ? new Date() : null,
      previous_doctors: previous,
    },
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
      // Same terms as an entitlement opened at activation: a fixed monthly
      // rate, with a year of it as the ceiling. Assigning a doctor by hand
      // must not put that member on different terms from everyone else.
      await prisma.consultEarning.create({
        data: {
          doctor_email,
          patient_id,
          monthly_naira: settings.doctor_monthly_naira,
          total_naira: yearlyCommitment(settings.doctor_monthly_naira, settings.release_months),
        },
      });
    }
  }

  return NextResponse.json({ success: true });
}
