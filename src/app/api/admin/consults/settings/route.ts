export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { clearConsultSettingsCache, CONSULT_DEFAULTS, getConsultSettings } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/consults/settings — the care-plan commercial terms. */
export async function GET() {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, settings: await getConsultSettings() });
}

const BodySchema = z.object({
  price_naira: z.coerce.number().min(0).max(10_000_000),
  message_allowance: z.coerce.number().int().min(1).max(365),
  release_months: z.coerce.number().int().min(1).max(60),
  default_doctor_cap: z.coerce.number().int().min(1).max(5000),
  lab_discount_percent: z.coerce.number().int().min(0).max(90),
  pharmacy_discount_percent: z.coerce.number().int().min(0).max(90),
  // What another bundle of messages costs a member who runs out mid-year.
  topup_price_naira: z.coerce.number().min(0).max(10_000_000).optional(),
  topup_messages: z.coerce.number().int().min(1).max(365).optional(),
  /**
   * What the assigned doctor is paid for each month a member stays.
   *
   * Not bounded by `price_naira`, and it used to be: a rule that the doctor's
   * share could not exceed the joining fee made every save fail once the fee
   * became a one-off ₦2,500 against a retired ₦6,000 lump sum. It was the
   * wrong rule anyway — the doctor is paid out of what the programme earns
   * from refills, dispensing and tests, not out of what a member paid to join,
   * so a year of it exceeding the joining fee is the model working.
   */
  doctor_monthly_naira: z.coerce.number().min(0).max(1_000_000).optional(),
  bonus_pool_percent: z.coerce.number().min(0).max(100).optional(),
});

/** PATCH /api/admin/consults/settings — the care-plan commercial terms. */
export async function PATCH(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  }
  const d = parsed.data;

  // Changes apply to new members; existing entitlements keep the terms they
  // were opened on — each carries its own monthly rate — so nobody's agreed
  // pay changes underneath them.
  await prisma.consultSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...d, updated_by: admin.email ?? null },
    update: { ...d, updated_by: admin.email ?? null },
  });
  clearConsultSettingsCache();

  return NextResponse.json({ success: true, settings: { ...CONSULT_DEFAULTS, ...d } });
}
