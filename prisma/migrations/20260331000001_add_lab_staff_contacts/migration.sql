-- Add staff_contacts column to labs table
ALTER TABLE "labs" ADD COLUMN IF NOT EXISTS "staff_contacts" JSONB NOT NULL DEFAULT '[]';
