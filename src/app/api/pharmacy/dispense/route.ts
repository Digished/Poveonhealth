export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getPharmacyFromRequest } from "@/lib/consult";
import { medLiveWhere } from "@/lib/medication-status";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** What happened to each line the doctor scheduled. */
const OUTCOMES = ["collected", "partial", "out_of_stock", "declined"] as const;

const BodySchema = z.object({
  code: z.string().trim().min(4).max(32),
  items: z
    .array(
      z.object({
        prescription_id: z.string().min(1),
        status: z.enum(OUTCOMES),
        quantity: z.coerce.number().int().min(1).max(10_000).optional().nullable(),
        note: z.string().trim().max(300).optional().nullable(),
      })
    )
    .min(1, "Tick what they collected")
    .max(30),
  /** What they paid, if the pharmacy is recording the sale at the same time. */
  gross_naira: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
});

/**
 * POST /api/pharmacy/dispense — record what a member actually walked out with.
 *
 * This is what closes the loop for the doctor. A schedule on its own says what
 * should happen; this says what did, including the "we didn't have it" case,
 * which is the one worth knowing about.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid entry." }, { status: 400 });
    }
    const d = parsed.data;

    const code = d.code.toUpperCase().replace(/\s+/g, "");
    const member = await prisma.consultPatient.findUnique({ where: { code } });
    if (!member || member.status !== "active" || (member.expires_at && member.expires_at < new Date())) {
      return NextResponse.json({ error: "That care plan is not active." }, { status: 404 });
    }

    // Only lines that belong to this member, so a stray id can't be attached
    // to someone else's record.
    const owned = await prisma.consultPrescription.findMany({
      // Live lines only. A suggestion the doctor has not confirmed is not
      // dispensable, whatever id arrives here.
      where: { patient_id: member.id, id: { in: d.items.map((i) => i.prescription_id) }, ...medLiveWhere },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));
    const items = d.items.filter((i) => ownedIds.has(i.prescription_id));
    if (items.length === 0) {
      return NextResponse.json({ error: "None of those medications are on their plan." }, { status: 400 });
    }

    const settings = await getConsultSettings();
    const percent = pharmacy.discount_percent || settings.pharmacy_discount_percent;
    const gross = d.gross_naira ? Math.round(d.gross_naira) : 0;
    const discount = gross ? Math.round((gross * percent) / 100) : 0;
    const collected = items.filter((i) => i.status === "collected" || i.status === "partial");

    await prisma.$transaction(async (tx) => {
      await tx.consultFulfilment.createMany({
        data: items.map((i) => ({
          patient_id: member.id,
          kind: "medication",
          prescription_id: i.prescription_id,
          pharmacy_id: pharmacy.id,
          status: i.status,
          quantity: i.quantity ?? null,
          note: i.note || null,
          recorded_by: pharmacy.name,
          // The money is recorded once against the visit, not per line.
          gross_naira: null,
          discount_naira: null,
        })),
      });

      if (gross > 0) {
        await tx.consultRedemption.create({
          data: {
            patient_id: member.id,
            pharmacy_id: pharmacy.id,
            kind: "pharmacy",
            description: collected.length
              ? `${collected.length} scheduled medication${collected.length === 1 ? "" : "s"}`
              : "Pharmacy visit",
            gross_naira: gross,
            discount_naira: discount,
          },
        });
      }

      // Serving someone makes them one of this pharmacy's regulars.
      const now = new Date();
      await tx.pharmacyCustomer.upsert({
        where: { pharmacy_id_patient_id: { pharmacy_id: pharmacy.id, patient_id: member.id } },
        create: {
          pharmacy_id: pharmacy.id,
          patient_id: member.id,
          full_name: member.full_name,
          phone: member.phone,
          code: member.code,
          visits: 1,
          total_spend: Math.max(0, gross - discount),
          last_visit_at: now,
        },
        update: {
          visits: { increment: 1 },
          total_spend: { increment: Math.max(0, gross - discount) },
          last_visit_at: now,
          code: member.code,
        },
      });
    });

    return NextResponse.json({
      success: true,
      recorded: items.length,
      collected: collected.length,
      discount_naira: discount,
      payable_naira: Math.max(0, gross - discount),
    });
  } catch (err) {
    console.error("[pharmacy/dispense]", err);
    return NextResponse.json({ error: "Could not record that." }, { status: 500 });
  }
}
