export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getConsultSettings,
  getPatientEmailFromRequest,
  initConsultTransfer,
} from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * POST /api/consults/pay/transfer — an account to pay the joining fee into.
 *
 * Most people here pay by transfer, and sending them out to a hosted checkout
 * to be told to make one is where sign-ups are lost. This mints a one-off
 * account for the charge and hands it back, so the member transfers from
 * whichever bank app they already have open without leaving the page.
 *
 * The reference it returns verifies through /api/consults/verify exactly as a
 * card reference does — the transfer is a different way to pay, not a different
 * way to be activated, so nothing downstream has a second path to get wrong.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getPatientEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({ where: { email } });
    if (!patient) {
      return NextResponse.json(
        { error: "Fill in your details first, then choose how to pay." },
        { status: 404 }
      );
    }
    if (patient.status === "active") {
      return NextResponse.json({ error: "Your care plan is already active." }, { status: 409 });
    }

    const settings = await getConsultSettings();
    const transfer = await initConsultTransfer({
      patientId: patient.id,
      code: patient.code ?? patient.id,
      email,
      amountNaira: settings.price_naira,
    });

    if (!transfer) {
      // Not an error the member can do anything about: their card still works,
      // and telling them that is more use than an apology.
      return NextResponse.json(
        {
          error: "Bank transfer isn't available right now. You can still pay by card.",
          card_available: true,
        },
        { status: 503 }
      );
    }

    // Held on the row so a member who closes the page and comes back is shown
    // the same account rather than being given a second one to be confused by.
    await prisma.consultPatient
      .update({ where: { id: patient.id }, data: { paystack_ref: transfer.reference } })
      .catch(() => {});

    return NextResponse.json({ success: true, transfer });
  } catch (err) {
    console.error("[consults/pay/transfer]", err);
    return NextResponse.json({ error: "Could not set up a transfer." }, { status: 500 });
  }
}
