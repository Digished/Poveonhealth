export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * POST /api/admin/wallet/fix-commission
 *
 * One-time fix for the production data bug where commission_pct was set to 100
 * (causing poveon_fee = full lab_price instead of a percentage).
 *
 * Body (all optional):
 *   lab_id        — scope fix to a single lab (default: all labs)
 *   commission_pct — correct percentage to apply (default: system setting "default_commission_pct", fallback 1.5)
 *
 * Only touches rows where commission_pct = 100 to avoid overwriting intentional values.
 * Recalculates poveon_fee = ROUND(lab_price * commission_pct / 100, 2) for all affected rows.
 */
export async function POST(request: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { lab_id?: string; commission_pct?: number };

  // Resolve target commission percentage
  let commissionPct: number;
  if (body.commission_pct != null && !isNaN(Number(body.commission_pct))) {
    commissionPct = Number(body.commission_pct);
  } else {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "default_commission_pct" } });
    commissionPct = setting ? parseFloat(setting.value) : 1.5;
  }

  if (commissionPct <= 0 || commissionPct >= 100) {
    return NextResponse.json({ error: "commission_pct must be between 1 and 99" }, { status: 400 });
  }

  // Count affected rows before fixing (so we can report)
  const countResult = await prisma.$queryRawUnsafe<[{ count: string }]>(
    body.lab_id
      ? `SELECT COUNT(*)::text AS count FROM lab_offered_tests WHERE commission_pct = 100 AND lab_id = $1`
      : `SELECT COUNT(*)::text AS count FROM lab_offered_tests WHERE commission_pct = 100`,
    ...(body.lab_id ? [body.lab_id] : []),
  );
  const affectedCount = parseInt(countResult[0]?.count ?? "0", 10);

  if (affectedCount === 0) {
    return NextResponse.json({
      success: true,
      fixed: 0,
      commission_pct_applied: commissionPct,
      message: "No rows found with commission_pct = 100. Already fixed or never affected.",
    });
  }

  // Apply fix
  const updated = await prisma.$executeRawUnsafe(
    body.lab_id
      ? `UPDATE lab_offered_tests SET commission_pct = $1, poveon_fee = ROUND((lab_price * $1 / 100), 2) WHERE commission_pct = 100 AND lab_id = $2`
      : `UPDATE lab_offered_tests SET commission_pct = $1, poveon_fee = ROUND((lab_price * $1 / 100), 2) WHERE commission_pct = 100`,
    commissionPct,
    ...(body.lab_id ? [body.lab_id] : []),
  );

  return NextResponse.json({
    success: true,
    fixed: updated,
    commission_pct_applied: commissionPct,
    message: `Fixed ${updated} test row${updated !== 1 ? "s" : ""}. commission_pct reset from 100 → ${commissionPct}%.`,
  });
}
