-- Run this ONCE in the Supabase SQL Editor to drop all manually-created tables.
-- Prisma will recreate them cleanly on the next deploy (via prisma db push).
-- Go to: Supabase Dashboard → SQL Editor → paste this → Run

DROP TABLE IF EXISTS public.requests CASCADE;
DROP TABLE IF EXISTS public.lab_users CASCADE;
DROP TABLE IF EXISTS public.admin_users CASCADE;
DROP TABLE IF EXISTS public.labs CASCADE;
