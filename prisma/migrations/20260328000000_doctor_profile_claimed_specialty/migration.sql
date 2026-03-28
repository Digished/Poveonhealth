-- Add specialty, claimed, and created_by_marketer_id to doctor_profiles
ALTER TABLE "doctor_profiles"
  ADD COLUMN IF NOT EXISTS "specialty" TEXT,
  ADD COLUMN IF NOT EXISTS "claimed" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "created_by_marketer_id" TEXT;

-- Existing rows are already claimed (created by the doctor themselves)
-- Default TRUE is correct — only marketer-created profiles are FALSE
