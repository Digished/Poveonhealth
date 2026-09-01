export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { pharmacyAccountCreatedEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";
import { resolveAccountName, upsertPharmacySubaccount } from "@/lib/paystack-bank";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  discount_percent: z.coerce.number().int().min(0).max(90).optional(),
  /** Poveon's cut on this pharmacy's medications, as a percent of list price. */
  margin_percent: z.coerce.number().min(0).max(100).optional(),
  /**
   * Where the pharmacy's share of a member's payment is settled. Held here so
   * an admin can set it up on the phone with the pharmacist rather than making
   * them find the screen themselves.
   */
  bank_code: z.string().trim().max(10).optional().nullable(),
  account_number: z.string().trim().regex(/^\d{10}$/, "An account number is 10 digits").optional().nullable(),
  /**
   * Ignored on the way in. The name is whatever the bank says it is — see
   * below — because a name typed by hand confirms nothing about the account
   * the money will actually land in.
   */
  account_name: z.string().trim().max(160).optional().nullable(),
  active: z.boolean().optional(),
  resend_invite: z.boolean().optional(),
});

/** PATCH /api/admin/pharmacies/[id] — edit terms, deactivate, or re-invite. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes." }, { status: 400 });
  const d = parsed.data;

  const existing = await prisma.pharmacy.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });

  // The email is how they sign in, so it has to stay unique — and changing it
  // is a real move, not a typo fix, so say plainly when it is already taken.
  if (d.email && d.email.toLowerCase() !== existing.email.toLowerCase()) {
    const clash = await prisma.pharmacy.findFirst({
      where: { email: { equals: d.email, mode: "insensitive" }, id: { not: params.id } },
      select: { name: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: `${clash.name} already signs in with that email.` },
        { status: 409 }
      );
    }
  }

  // A bank code with no account number (or the other way round) is a half-set
  // payout that will fail silently at settlement time. Take both or neither.
  const bank = d.bank_code ?? existing.bank_code;
  const acct = d.account_number ?? existing.account_number;
  if ((d.bank_code !== undefined || d.account_number !== undefined) && Boolean(bank) !== Boolean(acct)) {
    return NextResponse.json(
      { error: "Set the bank and the account number together, or clear both." },
      { status: 400 }
    );
  }

  if (d.resend_invite) {
    const sent = await resend.emails.send({
      from: FROM_ADDRESS,
      to: existing.email,
      subject: `${existing.name} — your Poveon pharmacy account`,
      html: pharmacyAccountCreatedEmail({
        pharmacyName: existing.name,
        code: existing.code,
        discountPercent: existing.discount_percent,
        loginUrl: `${appUrl()}/pharmacy-login`,
      }),
    });
    if (sent.error) {
      console.error("[admin/pharmacies] resend invite:", sent.error);
      return NextResponse.json({ error: "Could not send that invite." }, { status: 502 });
    }
    return NextResponse.json({ success: true, invited: true });
  }

  // ── Payout account ──────────────────────────────────────────────────────
  // Confirmed with the bank before it is stored, and the bank's answer is what
  // gets stored. A pharmacy is paid automatically out of members' payments; an
  // account number typed one digit wrong is somebody else's money.
  let bankFields: Record<string, unknown> = {};
  let accountWarning: string | null = null;

  const settingAccount =
    d.bank_code !== undefined || d.account_number !== undefined;

  if (settingAccount && bank && acct) {
    const changed = bank !== existing.bank_code || acct !== existing.account_number;
    if (changed) {
      const resolved = await resolveAccountName(bank, acct);
      if (!resolved.ok && resolved.reason === "not_found") {
        // A wrong number is the one case worth refusing outright: there is
        // nothing to save that would not be wrong.
        return NextResponse.json({ error: resolved.message }, { status: 422 });
      }

      bankFields = {
        bank_code: bank,
        account_number: acct,
        account_name: resolved.ok ? resolved.name : d.account_name || existing.account_name || null,
      };
      if (!resolved.ok) accountWarning = resolved.message;

      // Provision the split account so their share of a payment reaches them
      // directly. Best-effort: a pharmacy with no subaccount can still be
      // ordered from, the money just settles through Poveon.
      const subaccount = await upsertPharmacySubaccount({
        existingCode: existing.paystack_subaccount_code,
        businessName: d.name ?? existing.name,
        bankCode: bank,
        accountNumber: acct,
      });
      bankFields.paystack_subaccount_code = subaccount;
      if (!subaccount) {
        accountWarning =
          accountWarning ??
          "Saved, but the split payout account could not be created. Their share will settle through Poveon until it is.";
      }
    }
  } else if (settingAccount && !bank && !acct) {
    // Both cleared: drop the payout route rather than leaving half of one.
    bankFields = {
      bank_code: null,
      account_number: null,
      account_name: null,
      paystack_subaccount_code: null,
    };
  }

  const updated = await prisma.pharmacy.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.email !== undefined ? { email: d.email.toLowerCase() } : {}),
      ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.city !== undefined ? { city: d.city || null } : {}),
      ...(d.state !== undefined ? { state: d.state || null } : {}),
      ...(d.discount_percent !== undefined ? { discount_percent: d.discount_percent } : {}),
      ...(d.margin_percent !== undefined ? { margin_percent: d.margin_percent } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
      ...bankFields,
    },
    select: {
      id: true, name: true, email: true, phone: true, address: true,
      city: true, state: true, discount_percent: true, margin_percent: true,
      active: true, logo_url: true, bank_code: true, account_name: true, account_number: true,
    },
  });

  return NextResponse.json({
    success: true,
    warning: accountWarning,
    pharmacy: {
      ...updated,
      margin_percent: Number(updated.margin_percent ?? 5),
      account_last4: updated.account_number ? updated.account_number.slice(-4) : null,
      payouts_ready: !!(updated.bank_code && updated.account_number),
      account_number: undefined,
    },
  });
}

/**
 * DELETE /api/admin/pharmacies/[id] — remove a partner.
 *
 * A pharmacy that has traded is deactivated rather than deleted, so its
 * customers and the discounts it gave stay on the record.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const redemptions = await prisma.consultRedemption.count({ where: { pharmacy_id: params.id } });
  if (redemptions > 0) {
    await prisma.pharmacy.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ success: true, deactivated: true });
  }

  await prisma.pharmacy.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ success: true, deleted: true });
}
