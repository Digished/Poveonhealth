import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  return await prisma.adminUser.findUnique({ where: { user_id: user.id } }) ? user : null;
}

/**
 * POST /api/admin/wallet/reset
 * One-time cleanup: wipes old wallet data and resets all balances to 0.
 * Safe to call multiple times.
 */
export async function POST() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Drop old wallet_transactions if it still exists from previous schema
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS wallet_transactions CASCADE`);

  // Reset all lab wallet balances to 0 (removes negative commission artifacts)
  await prisma.$executeRawUnsafe(`UPDATE lab_wallets SET balance = 0`);

  // Clear any credits that may have been recorded with wrong data
  await prisma.$executeRawUnsafe(`DELETE FROM lab_wallet_credits`);

  // Ensure lab_wallet_credits table exists (in case deploy hasn't run yet)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "lab_wallet_credits" (
      "id"            TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
      "wallet_id"     TEXT          NOT NULL,
      "amount"        DECIMAL(12,2) NOT NULL,
      "balance_after" DECIMAL(12,2) NOT NULL,
      "reference"     TEXT          NOT NULL,
      "channel"       TEXT          NOT NULL DEFAULT 'dva',
      "sender_name"   TEXT,
      "sender_bank"   TEXT,
      "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
      CONSTRAINT "lab_wallet_credits_pkey"    PRIMARY KEY ("id"),
      CONSTRAINT "lab_wallet_credits_ref_key" UNIQUE ("reference"),
      CONSTRAINT "lab_wallet_credits_wallet_fk" FOREIGN KEY ("wallet_id") REFERENCES "lab_wallets"("id") ON DELETE CASCADE
    )
  `);

  return NextResponse.json({ success: true, message: "Wallet data reset. All balances are now 0." });
}
