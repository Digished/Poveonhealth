export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMemberFromRequest } from "@/lib/consult";
import { medLiveWhere } from "@/lib/medication-status";
import { buildMedIndex, dedupeByDrug, identify, matchMedication, unmatchedReason } from "@/lib/med-match";
import { priceMedication } from "@/lib/med-pricing";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/consults/medications — the member's medication, once, with prices.
 *
 * This is the *only* list of a member's medication the dashboard draws, so it
 * carries everything a member needs about each one: what the doctor wrote, what
 * it costs at their pharmacy, what they save, and whether this month is already
 * paid for. Two lists of the same medication is how a dashboard starts
 * contradicting itself.
 *
 * A prescription the pharmacy has not priced is still returned, with the reason
 * it could not be priced. "We don't know" is honest; leaving the medication out
 * would read as though the doctor had stopped it.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const [prescriptions, pharmacy, orders] = await Promise.all([
      prisma.consultPrescription.findMany({
        where: { patient_id: member.id, ...medLiveWhere },
        orderBy: { created_at: "desc" },
        take: 40,
      }),
      member.preferred_pharmacy_id
        ? prisma.pharmacy.findUnique({ where: { id: member.preferred_pharmacy_id } })
        : null,
      prisma.medicationOrder.findMany({
        where: { patient_id: member.id },
        orderBy: { created_at: "desc" },
        take: 12,
        include: { items: true, pharmacy: { select: { name: true, address: true } } },
      }),
    ]);

    const catalogue = pharmacy
      ? await prisma.pharmacyMedication.findMany({
          where: { pharmacy_id: pharmacy.id, active: true },
        })
      : [];
    // Matched on identity rather than on a single stored key: the strength a
    // doctor puts in the dosage column and a pharmacist puts in the name are
    // the same strength, and the member should not pay for that difference.
    const index = buildMedIndex(catalogue);
    const defaultMargin = Number(pharmacy?.margin_percent ?? 5);

    // Which catalogue rows are already bought and waiting, so nobody is invited
    // to pay twice for the same month's tablets.
    const coveredBy = new Map<string, { for_month: Date; status: string }>();
    for (const o of orders) {
      if (o.status !== "paid" && o.status !== "ready") continue;
      for (const i of o.items) {
        if (i.medication_id) coveredBy.set(i.medication_id, { for_month: o.for_month, status: o.status });
      }
    }

    // Data written before medication rows were merged on write can still hold
    // the same drug twice, and the member asked not to be shown their
    // medication several times.
    const distinct = dedupeByDrug(prescriptions);

    const priced = distinct.map((p: (typeof prescriptions)[number]) => {
      const base = {
        id: p.id,
        medication: p.medication,
        form: p.form,
        dosage: p.dosage,
        frequency: p.frequency,
        instructions: p.instructions,
        end_date: p.end_date,
        status: p.status,
      };

      const want = identify({ name: p.medication, dosage: p.dosage, form: p.form });
      const found = pharmacy ? matchMedication(index, want) : null;

      if (!found || !found.row) {
        return {
          ...base,
          priced: false as const,
          reason: pharmacy && found
            ? unmatchedReason(found.how, pharmacy.name, found.alternatives)
            : null,
        };
      }

      const match = found.row;
      const price = priceMedication({
        listNaira: Number(match.list_price),
        concessionNaira: Number(match.concession),
        marginPercent: Number(match.margin_percent ?? defaultMargin),
      });
      const covered = coveredBy.get(match.id);

      return {
        ...base,
        priced: true as const,
        medication_id: match.id,
        pack: match.pack,
        strength: match.strength,
        in_stock: match.in_stock,
        list_price: Number(match.list_price),
        you_pay: price.memberNaira,
        you_save: price.savingNaira,
        saving_percent: price.savingPercent,
        // Paid for already — shown as settled rather than offered again.
        covered_for: covered ? covered.for_month : null,
        covered_status: covered ? covered.status : null,
      };
    });

    type PricedRow = Extract<(typeof priced)[number], { priced: true }>;
    const withPrice = priced.filter((p): p is PricedRow => p.priced);
    // What the member could pay for right now: priced, in stock, not already
    // bought. Summed from the rows above rather than re-derived, so the total
    // can never disagree with the lines.
    const payable = withPrice.filter((p) => p.in_stock && !p.covered_for);

    return NextResponse.json({
      success: true,
      pharmacy: pharmacy
        ? { id: pharmacy.id, name: pharmacy.name, address: pharmacy.address, city: pharmacy.city }
        : null,
      medications: priced,
      total: {
        items: payable.length,
        you_pay: payable.reduce((s: number, p: PricedRow) => s + p.you_pay, 0),
        you_save: payable.reduce((s: number, p: PricedRow) => s + p.you_save, 0),
        list: payable.reduce((s: number, p: PricedRow) => s + p.list_price, 0),
        unpriced: priced.length - withPrice.length,
        out_of_stock: withPrice.filter((p) => !p.in_stock).length,
        covered: withPrice.filter((p) => p.covered_for).length,
      },
      orders: orders.map((o) => ({
        id: o.id,
        for_month: o.for_month,
        status: o.status,
        total_naira: Number(o.total_naira),
        saving_naira: Number(o.saving_naira),
        paid_at: o.paid_at,
        ready_at: o.ready_at,
        collected_at: o.collected_at,
        pharmacy_name: o.pharmacy.name,
        items: o.items.map((i) => ({
          name: i.name,
          strength: i.strength,
          quantity: i.quantity,
          member_naira: Number(i.member_naira),
        })),
      })),
    });
  } catch (err) {
    console.error("[consults/medications]", err);
    return NextResponse.json({ error: "Could not price your medication." }, { status: 500 });
  }
}
