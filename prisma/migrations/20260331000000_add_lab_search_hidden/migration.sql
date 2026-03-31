-- Add search_hidden column to labs table
ALTER TABLE "labs" ADD COLUMN IF NOT EXISTS "search_hidden" BOOLEAN NOT NULL DEFAULT false;
