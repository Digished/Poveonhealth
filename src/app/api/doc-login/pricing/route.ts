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
import { ensureEncounterSchema } from "@/lib/startup/ensure-encounter-schema";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";

/** Resolve a Paystack bank code from a bank name (older profiles stored name but no code). */
function codeForBankName(name: string): string {
  const target = name.trim().toLowerCase();
  return NIGERIAN_BANKS.find((b) => b.name.toLowerCase() === target)?.code ?? "";
}

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
    avatar_url: profile.avatar_url ?? null,
    theme: profile.encounter_theme ?? null,
    ready: isEncounterReady(profile),
    needs_setup: priceForPlan(profile, "single") == null,
  };
}

/** GET /api/doc-login/pricing — current pricing, bank, slug & readiness. */
export async function GET(req: NextRequest) {
  const email = await getDoctorEmailFromRequest(req);
  if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    // Guarantee the charging columns exist before we query them.
    await ensureEncounterSchema().catch(() => {});
    const profile = await prisma.doctorProfile.findUnique({ where: { email } });
    return NextResponse.json({ success: true, pricing: pricingPayload(profile) });
  } catch (err) {
    console.error("[doc-login/pricing GET]", err);
    return NextResponse.json({ error: "Failed to load pricing." }, { status: 500 });
  }
}

const BodySchema = z.object({
  consultation_fee: z.coerce.number().min(0).max(100_000_000),
  retainer_monthly: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
  retainer_yearly: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
  bank_name: z.string().trim().min(1),
  bank_code: z.string().trim().optional().default(""),
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

    // Guarantee the charging columns/tables exist before any read/write — the
    // startup hook normally does this, but ensure it here so saving never fails
    // just because the migration hasn't reached this DB yet.
    await ensureEncounterSchema().catch((e) => console.error("[doc-login/pricing] ensure schema:", e));

    const existing = await prisma.doctorProfile.findUnique({ where: { email } });

    // Resolve the settlement bank code (older profiles may only have the name).
    const bankCode = d.bank_code || codeForBankName(d.bank_name);

    // Provision (or update) the Paystack subaccount for the 80/20 split.
    // Best-effort: if it fails (or the bank code is unknown) we still save the
    // pricing and bank — the subaccount is created lazily at the first charge.
    const bankChanged =
      existing?.bank_code !== bankCode || existing?.account_number !== d.account_number;
    let subaccountCode = existing?.paystack_subaccount_code ?? null;
    if (bankCode && (!subaccountCode || bankChanged)) {
      subaccountCode = await upsertDoctorSubaccount({
        existingCode: existing?.paystack_subaccount_code ?? null,
        businessName: existing?.full_name?.trim() || d.account_name || email,
        bankCode,
        accountNumber: d.account_number,
      });
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
      bank_code: bankCode || null,
      account_number: d.account_number,
      account_name: d.account_name,
      paystack_subaccount_code: subaccountCode,
      encounter_slug: slug,
    };

    let profile;
    try {
      profile = await prisma.doctorProfile.upsert({
        where: { email },
        create: { email, claimed: true, ...data },
        update: data,
      });
    } catch (dbErr) {
      // Self-heal: force a fresh schema-ensure (in case columns are still missing) and retry once.
      console.error("[doc-login/pricing] upsert failed, forcing schema ensure then retrying:", dbErr);
      await ensureEncounterSchema(true);
      profile = await prisma.doctorProfile.upsert({
        where: { email },
        create: { email, claimed: true, ...data },
        update: data,
      });
    }

    return NextResponse.json({ success: true, pricing: pricingPayload(profile) });
  } catch (err) {
    console.error("[doc-login/pricing]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to save pricing: ${detail.slice(0, 300)}` }, { status: 500 });
  }
}
