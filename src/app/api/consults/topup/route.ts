export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getConsultSettings,
  getMemberFromRequest,
  initConsultPayment,
} from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * POST /api/consults/topup — buy another bundle of doctor messages.
 *
 * A member whose yearly allowance runs out does not have to wait for renewal.
 * The bundle is created pending and only credited once the payment verifies
 * (see creditTopup), so an abandoned checkout costs nothing and grants nothing.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) {
      return NextResponse.json({ error: "Please sign in to buy more messages." }, { status: 401 });
    }
    if (member.status !== "active") {
      return NextResponse.json(
        { error: "Your care plan is not active. Renew it to keep messaging your doctor." },
        { status: 409 }
      );
    }

    const settings = await getConsultSettings();

    // One open bundle at a time. If they abandoned a checkout and came back,
    // reuse that row rather than leaving a trail of pending purchases.
    const pending = await prisma.consultTopup.findFirst({
      where: { patient_id: member.id, status: "pending" },
      orderBy: { created_at: "desc" },
    });

    const topup =
      pending ??
      (await prisma.consultTopup.create({
        data: {
          patient_id: member.id,
          messages: settings.topup_messages,
          amount_naira: settings.topup_price_naira,
        },
      }));

    const payment = await initConsultPayment({
      patientId: member.id,
      code: member.code ?? "",
      email: member.email,
      amountNaira: Number(topup.amount_naira),
      purpose: "care_plan_topup",
      topupId: topup.id,
    });
    if (!payment) {
      return NextResponse.json({ error: "We could not start that payment." }, { status: 502 });
    }

    await prisma.consultTopup.update({
      where: { id: topup.id },
      data: { paystack_ref: payment.reference },
    });

    return NextResponse.json({
      success: true,
      authorization_url: payment.authorizationUrl,
      messages: topup.messages,
      amount_naira: Number(topup.amount_naira),
    });
  } catch (err) {
    console.error("[consults/topup]", err);
    return NextResponse.json({ error: "Could not start that purchase." }, { status: 500 });
  }
}
