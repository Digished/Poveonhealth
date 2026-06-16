-- Fast Mode: store whether a request was submitted via Fast Mode and the
-- doctor's original plain-language input (sorted into fields server-side).
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "fast_mode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "raw_input" TEXT;
