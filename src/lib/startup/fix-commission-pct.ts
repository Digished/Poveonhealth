import { prisma } from "@/lib/prisma";

/**
 * One-time startup fix for the commission_pct = 100 production data bug.
 *
 * Root cause: lab_offered_tests rows were created with commission_pct = 100,
 * causing poveon_fee to equal the full lab_price instead of a percentage.
 *
 * This function is idempotent — once all rows are fixed it does nothing.
 * It runs on every server start but skips instantly when there is nothing to fix.
 */
export async function fixCommissionPct() {
  try {
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count FROM lab_offered_tests WHERE commission_pct = 100
    `;
    const affected = Number(countResult[0]?.count ?? 0);

    if (affected === 0) return; // Already clean

    // Get the configured default commission, fall back to 1.5%
    const setting = await prisma.systemSetting.findUnique({ where: { key: "default_commission_pct" } });
    const commissionPct = setting ? parseFloat(setting.value) : 1.5;

    const updated = await prisma.$executeRaw`
      UPDATE lab_offered_tests
      SET commission_pct = ${commissionPct},
          poveon_fee     = ROUND((lab_price * ${commissionPct} / 100), 2)
      WHERE commission_pct = 100
    `;

    console.log(`[startup] fix-commission-pct: reset ${updated} rows from 100% → ${commissionPct}%`);
  } catch (err) {
    // Non-fatal — log and continue. A failed fix will be retried on next deploy.
    console.error("[startup] fix-commission-pct failed:", err);
  }
}
