export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConsultSettings } from "@/lib/consult";
import { getLabAuth } from "@/lib/lab-auth";
import { maskName } from "@/lib/care-network";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({ code: z.string().trim().min(4).max(32) });

/**
 * POST /api/lab/care-lookup — a care code at the front desk.
 *
 * The code works at every lab in the Poveon network, not just the one the
 * member named as their preference: a preference decides who sees the schedule
 * in advance, never who is allowed to serve them.
 *
 * What comes back is only what the desk needs to act: who they are, that the
 * plan is live, the discount, and the tests their doctor has actually
 * scheduled. Nothing else on their record.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const auth = await getLabAuth(req);
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a care code." }, { status: 400 });

    const code = parsed.data.code.toUpperCase().replace(/\s+/g, "");
    const member = await prisma.consultPatient.findUnique({
      where: { code },
      select: {
        id: true, full_name: true, phone: true, sex: true, date_of_birth: true,
        conditions: true, status: true, expires_at: true, preferred_lab_id: true,
      },
    });

    if (!member) {
      return NextResponse.json({ success: true, found: false, reason: "That code is not recognised." });
    }
    if (member.status !== "active" || (member.expires_at && member.expires_at < new Date())) {
      return NextResponse.json({
        success: true,
        found: true,
        valid: false,
        reason: "That care plan is not active, so no discount applies.",
        member: { name: maskName(member.full_name) },
      });
    }

    const [settings, orders] = await Promise.all([
      getConsultSettings(),
      prisma.consultTestOrder.findMany({
        where: { patient_id: member.id, status: "scheduled" },
        orderBy: [{ due_date: "asc" }],
        take: 30,
        select: {
          id: true, tests: true, reason: true, due_date: true, recurrence: true,
          fulfilments: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { status: true, created_at: true, lab_id: true },
          },
        },
      }),
    ]);

    // Their own lab already sees the full name in its roster; anywhere else in
    // the network gets enough to greet the right person and no more.
    const mine = member.preferred_lab_id === auth.lab_id;

    return NextResponse.json({
      success: true,
      found: true,
      valid: true,
      discount_percent: settings.lab_discount_percent,
      /** The referral is the programme, not the doctor — Poveon sends them. */
      referral: { source: "poveon", label: "Poveon Care Plan" },
      member: {
        id: member.id,
        name: mine ? member.full_name : maskName(member.full_name),
        name_revealed: mine,
        phone: mine ? member.phone : null,
        sex: member.sex,
        date_of_birth: mine ? member.date_of_birth : null,
        conditions: member.conditions,
        expires_at: member.expires_at,
        prefers_this_lab: mine,
      },
      test_orders: orders.map((o) => ({
        id: o.id,
        tests: o.tests,
        reason: o.reason,
        due_date: o.due_date,
        recurrence: o.recurrence,
        last_fulfilment: o.fulfilments[0]
          ? {
              status: o.fulfilments[0].status,
              at: o.fulfilments[0].created_at,
              here: o.fulfilments[0].lab_id === auth.lab_id,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[lab/care-lookup]", err);
    return NextResponse.json({ error: "Could not check that code." }, { status: 500 });
  }
}
