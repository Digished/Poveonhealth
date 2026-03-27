-- Add Poveon commission tracking fields to requests table
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "poveon_amount" DECIMAL(12,2);
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "lab_revenue_amount" DECIMAL(12,2);
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "is_paid_to_poveon" BOOLEAN NOT NULL DEFAULT false;
