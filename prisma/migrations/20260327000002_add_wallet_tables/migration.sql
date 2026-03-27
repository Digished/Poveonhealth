-- Create lab_wallets table
CREATE TABLE IF NOT EXISTS "lab_wallets" (
  "id"                   TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "lab_id"               TEXT NOT NULL,
  "balance"              DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paystack_customer_id" TEXT,
  "dva_bank_name"        TEXT,
  "dva_account_number"   TEXT,
  "dva_account_name"     TEXT,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT now(),

  CONSTRAINT "lab_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lab_wallets_lab_id_key" ON "lab_wallets"("lab_id");
CREATE UNIQUE INDEX IF NOT EXISTS "lab_wallets_paystack_customer_id_key" ON "lab_wallets"("paystack_customer_id");

ALTER TABLE "lab_wallets"
  ADD CONSTRAINT "lab_wallets_lab_id_fkey"
  FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create wallet_transactions table
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "lab_id"        TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "direction"     TEXT NOT NULL,
  "amount"        DECIMAL(12,2) NOT NULL,
  "balance_after" DECIMAL(12,2) NOT NULL,
  "description"   TEXT,
  "reference"     TEXT,
  "request_id"    TEXT,
  "actor_email"   TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT now(),

  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_reference_key" ON "wallet_transactions"("reference");
CREATE INDEX IF NOT EXISTS "wallet_transactions_lab_id_created_at_idx" ON "wallet_transactions"("lab_id", "created_at");

ALTER TABLE "wallet_transactions"
  ADD CONSTRAINT "wallet_transactions_lab_id_fkey"
  FOREIGN KEY ("lab_id") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_transactions"
  ADD CONSTRAINT "wallet_transactions_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
