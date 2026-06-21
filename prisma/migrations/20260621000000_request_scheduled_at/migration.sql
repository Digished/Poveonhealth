-- Structured appointment time for calendar scheduling (radiology/imaging).
-- The legacy free-text `schedule` column is retained for historical records.
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "requests_lab_id_scheduled_at_idx" ON "requests"("lab_id", "scheduled_at");
