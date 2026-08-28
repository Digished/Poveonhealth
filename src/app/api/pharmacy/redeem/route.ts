export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getPharmacyFromRequest } from "@/lib/consult";

const BodySchema = z.object({
  code: z.string().trim().min(4).max(32),
  gross_naira: z.coerce.number().min(1).max(100_000_000),
  description: z.string().trim().max(300).optional().nullable(),
});

/**
 * POST /api/pharmacy/redeem — record a discounted sale against a care code.
 *
 * Also keeps the pharmacy's own customer book up to date, which is what turns
 * a one-off discount into a tracked regular.
 */
export async function POST(req: NextRequest) {
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid sale." }, { status: 400 });
    }

    const code = parsed.data.code.toUpperCase().replace(/\s+/g, "");
    const member = await prisma.consultPatient.findUnique({ where: { code } });
    if (!member || member.status !== "active") {
      return NextResponse.json({ error: "That care plan is not active." }, { status: 404 });
    }

    const settings = await getConsultSettings();
    const percent = pharmacy.discount_percent || settings.pharmacy_discount_percent;
    const gross = Math.round(parsed.data.gross_naira);
    const discount = Math.round((gross * percent) / 100);
    const payable = gross - discount;

    await prisma.consultRedemption.create({
      data: {
        patient_id: member.id,
        pharmacy_id: pharmacy.id,
        kind: "pharmacy",
        description: parsed.data.description || null,
        gross_naira: gross,
        discount_naira: discount,
      },
    });

    // The member becomes (or stays) one of this pharmacy's regulars.
    const now = new Date();
    await prisma.pharmacyCustomer.upsert({
      where: { pharmacy_id_patient_id: { pharmacy_id: pharmacy.id, patient_id: member.id } },
      create: {
        pharmacy_id: pharmacy.id,
        patient_id: member.id,
        full_name: member.full_name,
        phone: member.phone,
        code: member.code,
        visits: 1,
        total_spend: payable,
        last_visit_at: now,
      },
      update: {
        visits: { increment: 1 },
        total_spend: { increment: payable },
        last_visit_at: now,
        full_name: member.full_name,
        phone: member.phone,
      },
    });

    return NextResponse.json({
      success: true,
      gross_naira: gross,
      discount_naira: discount,
      payable_naira: payable,
      discount_percent: percent,
      member: { full_name: member.full_name },
    });
  } catch (err) {
    console.error("[pharmacy/redeem]", err);
    return NextResponse.json({ error: "Could not record that sale." }, { status: 500 });
  }
}
