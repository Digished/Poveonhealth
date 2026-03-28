-- Price change audit log — one row per field change on a LabOfferedTest
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
);

CREATE INDEX IF NOT EXISTS "price_change_logs_lab_offered_test_id_idx"
  ON "price_change_logs"("lab_offered_test_id");

CREATE INDEX IF NOT EXISTS "price_change_logs_lab_id_changed_at_idx"
  ON "price_change_logs"("lab_id", "changed_at");
