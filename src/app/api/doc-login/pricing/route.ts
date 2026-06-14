export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  appUrl,
  generateEncounterSlug,
  getDoctorEmailFromRequest,
  isEncounterReady,
  priceForPlan,
  upsertDoctorSubaccount,
} from "@/lib/doctor-encounter";

function pricingPayload(profile: Awaited<ReturnType<typeof prisma.doctorProfile.findUnique>>) {
  if (!profile) return null;
  return {
    consultation_fee: priceForPlan(profile, "single"),
    retainer_monthly: priceForPlan(profile, "monthly"),
    retainer_yearly: priceForPlan(profile, "yearly"),
    bank_name: profile.bank_name ?? null,
    bank_code: profile.bank_code ?? null,
    account_number: profile.account_number ?? null,
    account_name: profile.account_name ?? null,
    has_subaccount: !!profile.paystack_subaccount_code,
    slug: profile.encounter_slug ?? null,
    share_url: profile.encounter_slug ? `${appUrl()}/d/${profile.encounter_slug}` : null,
    ready: isEncounterReady(profile),
    needs_setup: priceForPlan(profile, "single") == null,
  };
}

/** GET /api/doc-login/pricing — current pricing, bank, slug & readiness. */
export async function GET(req: NextRequest) {
  const email = await getDoctorEmailFromRequest(req);
  if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const profile = await prisma.doctorProfile.findUnique({ where: { email } });
  return NextResponse.json({ success: true, pricing: pricingPayload(profile) });
}

const BodySchema = z.object({
  consultation_fee: z.coerce.number().min(0).max(100_000_000),
  retainer_monthly: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
  retainer_yearly: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
  bank_name: z.string().trim().min(1),
  bank_code: z.string().trim().min(1),
  account_number: z.string().trim().regex(/^\d{10}$/, "Account number must be 10 digits"),
  account_name: z.string().trim().min(2),
});

/** PATCH /api/doc-login/pricing — set fees + payout bank, provision the split subaccount. */
export async function PATCH(req: NextRequest) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first?.message ?? "Invalid pricing." }, { status: 400 });
    }
    const d = parsed.data;
    if (d.consultation_fee <= 0) {
      return NextResponse.json({ error: "Set a consultation fee greater than zero." }, { status: 400 });
    }

    const existing = await prisma.doctorProfile.findUnique({ where: { email } });

    // Provision (or update) the Paystack subaccount for the 80/20 split.
    const subaccountCode = await upsertDoctorSubaccount({
      existingCode: existing?.paystack_subaccount_code ?? null,
      businessName: existing?.full_name?.trim() || d.account_name || email,
      bankCode: d.bank_code,
      accountNumber: d.account_number,
    });
    if (!subaccountCode) {
      return NextResponse.json(
        { error: "Could not set up your payout account. Check your bank details and try again." },
        { status: 502 }
      );
    }

    // Generate the shareable slug once.
    const slug =
      existing?.encounter_slug ||
      (await generateEncounterSlug(existing?.prefix ?? null, existing?.full_name ?? null, email));

    const data = {
      consultation_fee: d.consultation_fee,
      retainer_monthly: d.retainer_monthly && d.retainer_monthly > 0 ? d.retainer_monthly : null,
      retainer_yearly: d.retainer_yearly && d.retainer_yearly > 0 ? d.retainer_yearly : null,
      bank_name: d.bank_name,
      bank_code: d.bank_code,
      account_number: d.account_number,
      account_name: d.account_name,
      paystack_subaccount_code: subaccountCode,
      encounter_slug: slug,
    };

    const profile = await prisma.doctorProfile.upsert({
      where: { email },
      create: { email, claimed: true, ...data },
      update: data,
    });

    return NextResponse.json({ success: true, pricing: pricingPayload(profile) });
  } catch (err) {
    console.error("[doc-login/pricing]", err);
    return NextResponse.json({ error: "Failed to save pricing." }, { status: 500 });
  }
}
