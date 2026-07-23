-- Additional recipient addresses for new-request notification alerts.
-- Labs can now notify multiple emails when a new request is submitted.
ALTER TABLE "labs" ADD COLUMN IF NOT EXISTS "request_emails" JSONB NOT NULL DEFAULT '[]';
