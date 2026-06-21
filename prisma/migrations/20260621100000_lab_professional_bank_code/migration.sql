-- Store the NIBSS/Paystack bank code on lab professionals for bank selection & name verification.
ALTER TABLE "lab_professionals" ADD COLUMN IF NOT EXISTS "bank_code" TEXT;
