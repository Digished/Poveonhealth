export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPharmacyFromRequest } from "@/lib/consult";
import { pharmacyRoster } from "@/lib/care-network";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/pharmacy/care-members — the care-plan members who chose this
 * pharmacy, and the medication scheduled for them.
 *
 * The point is planning: a pharmacy can see what its regulars are due to
 * collect and stock accordingly. A member who switches pharmacy disappears
 * from this list at once — the query is driven by the current preference, so
 * there is no copy of them left behind.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const members = await pharmacyRoster(pharmacy.id);
    const pending = members.reduce((sum, m) => sum + m.prescriptions.length, 0);

    // Who has already paid, and for what. A pharmacy planning stock needs to
    // know the difference between "their doctor scheduled this" and "the money
    // is in" — the second is an order to make up, the first is a forecast.
    const paidOrders = await prisma.medicationOrder.findMany({
      where: { pharmacy_id: pharmacy.id, status: { in: ["paid", "ready"] } },
      orderBy: { paid_at: "desc" },
      take: 200,
      include: { items: true, patient: { select: { id: true, code: true, full_name: true } } },
    });
    const ordersByPatient = new Map<string, typeof paidOrders>();
    for (const o of paidOrders) {
      const list = ordersByPatient.get(o.patient_id) ?? [];
      list.push(o);
      ordersByPatient.set(o.patient_id, list);
    }

    // Group what is coming by the month it is due, so a pharmacy can plan a
    // month's stock rather than reading every line to work out when.
    const months = new Map<string, number>();
    for (const m of members) {
      for (const rx of m.prescriptions) {
        const due = refillDue(rx);
        if (!due) continue;
        const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
        months.set(key, (months.get(key) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      success: true,
      summary: { members: members.length, pending_prescriptions: pending },
      months: Array.from(months.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count })),
      // What is paid for and waiting to be made up, across everyone.
      paid: {
        orders: paidOrders.length,
        items: paidOrders.reduce((s2, o) => s2 + o.items.length, 0),
        value: paidOrders.reduce((s2, o) => s2 + Number(o.pharmacy_naira), 0),
        ready: paidOrders.filter((o) => o.status === "ready").length,
      },
      members: members.map((m) => {
        const orders = ordersByPatient.get(m.id) ?? [];
        return {
          ...m,
          prescriptions: m.prescriptions.map((rx) => ({
            ...rx,
            refill_due: refillDue(rx)?.toISOString() ?? null,
          })),
          // Paid orders belonging to this member, so the row can say plainly
          // whether they owe anything when they walk in.
          paid_orders: orders.map((o) => ({
            id: o.id,
            status: o.status,
            for_month: o.for_month,
            paid_at: o.paid_at,
            you_receive: Number(o.pharmacy_naira),
            items: o.items.map((i) => ({
              name: i.name,
              strength: i.strength,
              quantity: i.quantity,
            })),
          })),
        };
      }),
    });
  } catch (err) {
    console.error("[pharmacy/care-members]", err);
    return NextResponse.json({ error: "Could not load your care-plan members." }, { status: 500 });
  }
}


/**
 * When this member is next expected for it.
 *
 * A course with an end date is due then. An open-ended maintenance drug is a
 * monthly repeat, so the next one is the first month-anniversary of its start
 * that has not passed — which is what makes "who is coming in March" answerable.
 */
function refillDue(rx: {
  start_date: Date | string | null;
  end_date: Date | string | null;
  duration_days: number | null;
}): Date | null {
  const end = rx.end_date ? new Date(rx.end_date) : null;
  if (end && !Number.isNaN(end.getTime())) return end;

  const start = rx.start_date ? new Date(rx.start_date) : null;
  if (!start || Number.isNaN(start.getTime())) return null;

  const next = new Date(start);
  const now = new Date();
  // Guarded rather than a bare while: a start date far in the past should not
  // spin, and one far in the future is already the answer.
  for (let i = 0; i < 240 && next < now; i += 1) next.setMonth(next.getMonth() + 1);
  return next;
}
