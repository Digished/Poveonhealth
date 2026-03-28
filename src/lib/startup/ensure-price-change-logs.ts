import { prisma } from "@/lib/prisma";

/**
 * Ensures the price_change_logs table exists in the production database.
 *
 * Vercel doesn't auto-run Prisma migrations, so this runs on every server
 * start and creates the table if it is missing.  All statements use
 * IF NOT EXISTS — fully idempotent, costs ~1 ms when the table already exists.
 */
export async function ensurePriceChangeLogsTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "price_change_logs" (
        "id"                  TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
        "lab_offered_test_id" TEXT          NOT NULL,
        "lab_id"              TEXT          NOT NULL,
        "test_name"           TEXT          NOT NULL,
        "changed_by_email"    TEXT          NOT NULL,
        "changed_by_role"     TEXT          NOT NULL DEFAULT 'owner',
        "field_changed"       TEXT          NOT NULL DEFAULT 'lab_price',
        "old_value"           TEXT,
        "new_value"           TEXT,
        "old_price"           DECIMAL(12,2),
        "new_price"           DECIMAL(12,2),
        "changed_at"          TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "price_change_logs_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "price_change_logs_lab_offered_test_id_idx"
        ON "price_change_logs"("lab_offered_test_id")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "price_change_logs_lab_id_changed_at_idx"
        ON "price_change_logs"("lab_id", "changed_at")
    `);

    console.log("[startup] ensure-price-change-logs: table ready");
  } catch (err) {
    console.error("[startup] ensure-price-change-logs failed:", err);
  }
}
