export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMemberFromRequest } from "@/lib/consult";
import { medLiveWhere } from "@/lib/medication-status";
import { medKey } from "@/lib/med-sheet";
import { priceMedication } from "@/lib/med-pricing";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/consults/medications — what the member's medication costs.
 *
 * Every live prescription, matched against their chosen pharmacy's price list
 * and priced. A member should never have to ask what their refill will cost, or
 * find out at the counter.
 *
 * A prescription with no matching row in the pharmacy's list is still returned,
 * marked unpriced — telling someone "we don't know" is honest; leaving the
 * medication out of the list entirely would look like it had been cancelled.
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

    // The pharmacy's list, keyed the same way the importer keys it, so
    // "Amlodipine 10mg" from a doctor finds "Amlodipine" + "10mg" in the shop.
    const catalogue = pharmacy
      ? await prisma.pharmacyMedication.findMany({
          where: { pharmacy_id: pharmacy.id, active: true },
        })
      : [];
    const byKey = new Map(catalogue.map((m) => [m.key, m]));
    const defaultMargin = Number(pharmacy?.margin_percent ?? 5);

    const priced = prescriptions.map((p) => {
      // A doctor writes "Amlodipine 10mg"; the strength may be in the name or
      // in its own field, and the parser already normalised both to one key.
      const strength = extractStrength(p.medication) ?? null;
      const bareName = strength ? stripStrength(p.medication) : p.medication;
      const match =
        byKey.get(medKey(bareName, strength, p.form ?? null)) ??
        byKey.get(medKey(bareName, strength, null)) ??
        byKey.get(medKey(p.medication, null, p.form ?? null)) ??
        null;

      if (!match) {
        return {
          id: p.id,
          medication: p.medication,
          form: p.form,
          dosage: p.dosage,
          frequency: p.frequency,
          status: p.status,
          priced: false as const,
        };
      }

      const price = priceMedication({
        listNaira: Number(match.list_price),
        concessionNaira: Number(match.concession),
        marginPercent: Number(match.margin_percent ?? defaultMargin),
      });

      return {
        id: p.id,
        medication: p.medication,
        form: p.form,
        dosage: p.dosage,
        frequency: p.frequency,
        status: p.status,
        priced: true as const,
        medication_id: match.id,
        pack: match.pack,
        in_stock: match.in_stock,
        list_price: Number(match.list_price),
        you_pay: price.memberNaira,
        you_save: price.savingNaira,
        saving_percent: price.savingPercent,
      };
    });

    // What the member could pay for right now. Summed from the priced lines
    // rather than re-derived, so the total can never disagree with the rows
    // above it.
    const payable = priced.filter((p) => p.priced && p.in_stock);

    return NextResponse.json({
      success: true,
      pharmacy: pharmacy
        ? { id: pharmacy.id, name: pharmacy.name, address: pharmacy.address, city: pharmacy.city }
        : null,
      medications: priced,
      // The basket a member would pay for right now, summed from the priced
      // rows rather than re-derived, so the total always matches the lines.
      total: {
        items: payable.length,
        you_pay: payable.reduce((s, p) => s + (p.you_pay ?? 0), 0),
        you_save: payable.reduce((s, p) => s + (p.you_save ?? 0), 0),
        list: payable.reduce((s, p) => s + (p.list_price ?? 0), 0),
        unpriced: priced.filter((p) => !p.priced).length,
        out_of_stock: priced.filter((p) => p.priced && !p.in_stock).length,
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

/** "Amlodipine 10mg" -> "10mg". Mirrors the importer, so keys line up. */
function extractStrength(name: string): string | null {
  const m = /(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%))\s*$/i.exec(name.trim());
  return m ? m[1].replace(/\s+/g, "").toLowerCase() : null;
}

function stripStrength(name: string): string {
  return name.replace(/[\s,-]*\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)\s*$/i, "").trim();
}
