-- Add PIN support for marketer login
ALTER TABLE "marketers"
  ADD COLUMN IF NOT EXISTS "pin_hash" TEXT;
