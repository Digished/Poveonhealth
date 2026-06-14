export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  notifyEncounter,
  recordPatientForDoctor,
  splitAmount,
  verifyEncounterPayment,
} from "@/lib/doctor-encounter";

/**
 * GET /api/encounter/verify?reference=... — confirm a Paystack payment, finalise
 * the encounter, register the patient in the doctor's network, and notify both
 * parties. Idempotent: the finalise step runs only once.
 */
export async function GET(req: NextRequest) {
  try {
    const reference = new URL(req.url).searchParams.get("reference")?.trim();
    if (!reference) return NextResponse.json({ error: "Payment reference required." }, { status: 400 });

    const encounter = await prisma.encounter.findUnique({ where: { payment_reference: reference } });
    if (!encounter) return NextResponse.json({ error: "Encounter not found for this payment." }, { status: 404 });

    // Already finalised (e.g. page refresh) — just return the code
    if (encounter.is_paid && encounter.status !== "awaiting_payment") {
      return NextResponse.json({ success: true, paid: true, code: encounter.code, plan_type: encounter.plan_type });
    }

    const result = await verifyEncounterPayment(reference);
    if (!result.success) {
      return NextResponse.json({ success: false, paid: false, error: "Payment not completed yet." }, { status: 402 });
    }

    const { doctor, poveon } = splitAmount(result.amountNaira);

    // Idempotent finalisation — only the first caller flips the status
    const updated = await prisma.encounter.updateMany({
      where: { id: encounter.id, status: "awaiting_payment" },
      data: {
        is_paid: true,
        status: "new",
        amount_paid: result.amountNaira,
        doctor_share: doctor,
        poveon_share: poveon,
        paid_at: new Date(),
      },
    });

    if (updated.count === 1) {
      const fresh = await prisma.encounter.findUnique({ where: { id: encounter.id } });
      if (fresh) {
        await recordPatientForDoctor(fresh);
        const profile = await prisma.doctorProfile.findUnique({ where: { email: fresh.doctor_email } });
        await notifyEncounter(fresh, profile);
      }
    }

    return NextResponse.json({ success: true, paid: true, code: encounter.code, plan_type: encounter.plan_type });
  } catch (err) {
    console.error("[encounter/verify]", err);
    return NextResponse.json({ error: "Could not verify payment. Please try again." }, { status: 500 });
  }
}
