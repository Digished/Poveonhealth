export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { pharmacyAccountCreatedEmail } from "@/lib/email/templates";
import { appUrl, generatePharmacyCode, getConsultSettings, uniquePharmacySlug } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/pharmacies — the partner network with its activity counts. */
export async function GET() {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pharmacies = await prisma.pharmacy.findMany({ orderBy: { created_at: "desc" } });
  const ids = pharmacies.map((p) => p.id);

  const customersBy = new Map<string, number>();
  const redemptionsBy = new Map<string, { count: number; discount: number }>();

  if (ids.length) {
    const [customerCounts, redemptionSums] = await Promise.all([
      prisma.pharmacyCustomer.groupBy({
        by: ["pharmacy_id"],
        where: { pharmacy_id: { in: ids } },
        _count: { id: true },
      }),
      prisma.consultRedemption.groupBy({
        by: ["pharmacy_id"],
        where: { pharmacy_id: { in: ids } },
        _sum: { discount_naira: true },
        _count: { id: true },
      }),
    ]);
    for (const c of customerCounts) customersBy.set(c.pharmacy_id, c._count.id);
    for (const r of redemptionSums) {
      if (!r.pharmacy_id) continue;
      redemptionsBy.set(r.pharmacy_id, { count: r._count.id, discount: Number(r._sum.discount_naira ?? 0) });
    }
  }

  return NextResponse.json({
    success: true,
    pharmacies: pharmacies.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      code: p.code,
      email: p.email,
      logo_url: p.logo_url,
      phone: p.phone,
      address: p.address,
      city: p.city,
      state: p.state,
      discount_percent: p.discount_percent,
      active: p.active,
      onboarded_at: p.onboarded_at,
      created_at: p.created_at,
      customers: customersBy.get(p.id) ?? 0,
      redemptions: redemptionsBy.get(p.id)?.count ?? 0,
      discount_given: Math.round(redemptionsBy.get(p.id)?.discount ?? 0),
    })),
  });
}

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Enter the pharmacy name").max(160),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  discount_percent: z.coerce.number().int().min(0).max(90).optional(),
});

/**
 * POST /api/admin/pharmacies — add a partner pharmacy and invite them.
 *
 * The pharmacy runs its own account from there: it signs in with an emailed
 * code, completes its details, and starts tracking its regulars.
 */
export async function POST(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid pharmacy." }, { status: 400 });
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();

  const clash = await prisma.pharmacy.findUnique({ where: { email }, select: { id: true } });
  if (clash) {
    return NextResponse.json({ error: "A pharmacy with that email already exists." }, { status: 409 });
  }

  const settings = await getConsultSettings();
  const pharmacy = await prisma.pharmacy.create({
    data: {
      name: d.name,
      email,
      slug: await uniquePharmacySlug(d.name),
      code: await generatePharmacyCode(),
      phone: d.phone || null,
      address: d.address || null,
      city: d.city || null,
      state: d.state || null,
      discount_percent: d.discount_percent ?? settings.pharmacy_discount_percent,
    },
  });

  // Best-effort invite — the pharmacy exists either way, and an admin can
  // re-send from the dashboard.
  void resend.emails
    .send({
      from: FROM_ADDRESS,
      to: email,
      subject: `${pharmacy.name} — your Poveon pharmacy account`,
      html: pharmacyAccountCreatedEmail({
        pharmacyName: pharmacy.name,
        code: pharmacy.code,
        discountPercent: pharmacy.discount_percent,
        loginUrl: `${appUrl()}/pharmacy-login`,
      }),
    })
    .then(({ error }) => { if (error) console.error("[admin/pharmacies] invite email:", error); })
    .catch((e) => console.error("[admin/pharmacies] invite email error:", e));

  return NextResponse.json({ success: true, pharmacy: { id: pharmacy.id, code: pharmacy.code } });
}
