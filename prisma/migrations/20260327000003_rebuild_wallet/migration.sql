-- Drop old wallet tables completely
DROP TABLE IF EXISTS "wallet_transactions" CASCADE;
DROP TABLE IF EXISTS "lab_wallets" CASCADE;

-- lab_wallets: one row per lab, holds DVA info + running balance
CREATE TABLE "lab_wallets" (
  "id"                   TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "lab_id"               TEXT        NOT NULL,
  "balance"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paystack_customer_id" TEXT,
  "dva_bank_name"        TEXT,
  "dva_account_number"   TEXT,
  "dva_account_name"     TEXT,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "lab_wallets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_wallets_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "lab_wallets_lab_id_key"               ON "lab_wallets"("lab_id");
CREATE UNIQUE INDEX "lab_wallets_paystack_customer_id_key" ON "lab_wallets"("paystack_customer_id") WHERE "paystack_customer_id" IS NOT NULL;

-- lab_wallet_credits: every inbound DVA payment (credits only — no debits)
CREATE TABLE "lab_wallet_credits" (
  "id"            TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "wallet_id"     TEXT          NOT NULL,
  "amount"        DECIMAL(12,2) NOT NULL,
  "balance_after" DECIMAL(12,2) NOT NULL,
  "reference"     TEXT          NOT NULL,
  "channel"       TEXT          NOT NULL DEFAULT 'dva',
  "sender_name"   TEXT,
  "sender_bank"   TEXT,
  "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT "lab_wallet_credits_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "lab_wallet_credits_ref_key"   UNIQUE ("reference"),
  CONSTRAINT "lab_wallet_credits_wallet_fk" FOREIGN KEY ("wallet_id") REFERENCES "lab_wallets"("id") ON DELETE CASCADE
);
CREATE INDEX "lab_wallet_credits_wallet_id_created_at_idx" ON "lab_wallet_credits"("wallet_id", "created_at" DESC);
