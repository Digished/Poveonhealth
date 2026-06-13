export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import {
  buildSkinSummary,
  getSkinPrice,
  initSkinPayment,
  notifySkinConsult,
} from "@/lib/skin-consult";

const MessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().max(4000),
});

const BodySchema = z.object({
  patient_name: z.string().trim().min(2).max(120),
  patient_email: z.string().email(),
  patient_whatsapp: z.string().trim().min(7).max(25),
  patient_age: z.coerce.number().int().min(0).max(120).optional().nullable(),
  patient_sex: z.enum(["male", "female", "other"]).optional().nullable(),
  image_urls: z.array(z.string().url()).min(1, "At least one photo is required.").max(5),
  conversation: z.array(MessageSchema).max(40).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid submission." },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const price = await getSkinPrice();

    const code = await generateUniqueCode("SKN", async (candidate) => {
      const existing = await prisma.skinConsult.findUnique({ where: { code: candidate }, select: { id: true } });
      return !!existing;
    });

    const aiSummary = await buildSkinSummary(data.conversation);

    const consult = await prisma.skinConsult.create({
      data: {
        code,
        patient_name: data.patient_name,
        patient_email: data.patient_email.trim().toLowerCase(),
        patient_whatsapp: data.patient_whatsapp.trim(),
        patient_age: data.patient_age ?? null,
        patient_sex: data.patient_sex ?? null,
        image_urls: data.image_urls,
        conversation: data.conversation,
        ai_summary: aiSummary,
        // Paid consults wait for payment before they count or notify anyone
        status: price > 0 ? "awaiting_payment" : "new",
        is_paid: price <= 0,
      },
    });

    // Free consult — notify immediately and reveal the code
    if (price <= 0) {
      await notifySkinConsult(consult);
      return NextResponse.json({ success: true, requiresPayment: false, code, consultId: consult.id });
    }

    // Paid consult — initialise Paystack and send the patient to checkout.
    // No code is revealed and no one is notified until payment is verified.
    const payment = await initSkinPayment({
      consultId: consult.id,
      code: consult.code,
      email: consult.patient_email,
      amountNaira: price,
    });
    if (!payment) {
      // Could not start checkout — drop the pending record so it isn't orphaned
      await prisma.skinConsult.delete({ where: { id: consult.id } }).catch(() => {});
      return NextResponse.json(
        { error: "Could not start payment. Please try again in a moment." },
        { status: 502 }
      );
    }

    await prisma.skinConsult.update({
      where: { id: consult.id },
      data: { payment_reference: payment.reference, amount_paid: price },
    });

    return NextResponse.json({
      success: true,
      requiresPayment: true,
      authorizationUrl: payment.authorizationUrl,
      reference: payment.reference,
    });
  } catch (err) {
    console.error("[skin/submit]", err);
    return NextResponse.json({ error: "Failed to submit your consultation. Please try again." }, { status: 500 });
  }
}
