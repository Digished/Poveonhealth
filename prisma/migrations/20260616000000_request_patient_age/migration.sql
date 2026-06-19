-- Add patient_age to requests. Existing rows keep their dob; new requests
-- store age in years directly.
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "patient_age" INTEGER;
