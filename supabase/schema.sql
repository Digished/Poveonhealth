-- =============================================================================
-- POVEON HEALTH - SUPABASE DATABASE SCHEMA
-- Run this in the Supabase SQL Editor to set up the database
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- Labs table: registered laboratories
CREATE TABLE IF NOT EXISTS public.labs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  prefix      TEXT NOT NULL UNIQUE,        -- Short prefix for code generation e.g. "LABA"
  addresses   JSONB NOT NULL DEFAULT '[]', -- Array of address strings
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lab users: links Supabase Auth users to their lab
CREATE TABLE IF NOT EXISTS public.lab_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lab_id      UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Admin users: superusers who manage the platform
CREATE TABLE IF NOT EXISTS public.admin_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Requests table: lab test requests submitted by doctors/allied health professionals
CREATE TABLE IF NOT EXISTS public.requests (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                   TEXT NOT NULL UNIQUE,       -- e.g. "LABA-8X4K29Q"
  lab_id                 UUID NOT NULL REFERENCES public.labs(id),
  patient_name           TEXT NOT NULL,
  dob                    DATE NOT NULL,
  sex                    TEXT NOT NULL CHECK (sex IN ('male', 'female')),
  address                TEXT NOT NULL,
  patient_email          TEXT,
  patient_phone          TEXT,
  doctor_prefix          TEXT,                       -- e.g. "Dr.", "Nurse", "Pharm.", "CHEW", "PT"
  doctor_name            TEXT NOT NULL,
  doctor_email           TEXT NOT NULL,
  doctor_phone           TEXT,
  doctor_bank_name       TEXT,                       -- for referral payment processing
  doctor_account_number  TEXT,
  doctor_account_name    TEXT,
  diagnosis              TEXT,
  tests                  TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'incoming' CHECK (status IN ('incoming', 'seen', 'done')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at                TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ
);

-- Migration: add new columns to existing requests table (run if table already exists)
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS doctor_prefix TEXT;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS doctor_bank_name TEXT;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS doctor_account_number TEXT;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS doctor_account_name TEXT;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_requests_lab_id   ON public.requests(lab_id);
CREATE INDEX IF NOT EXISTS idx_requests_code      ON public.requests(code);
CREATE INDEX IF NOT EXISTS idx_requests_status    ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_lab_users_user_id  ON public.lab_users(user_id);
CREATE INDEX IF NOT EXISTS idx_lab_users_lab_id   ON public.lab_users(lab_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.labs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests    ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "public_read_labs"            ON public.labs;
DROP POLICY IF EXISTS "admin_manage_labs"            ON public.labs;
DROP POLICY IF EXISTS "lab_read_own_record"          ON public.lab_users;
DROP POLICY IF EXISTS "admin_manage_lab_users"       ON public.lab_users;
DROP POLICY IF EXISTS "admin_read_admin_users"       ON public.admin_users;
DROP POLICY IF EXISTS "lab_select_own_requests"      ON public.requests;
DROP POLICY IF EXISTS "lab_update_own_requests"      ON public.requests;
DROP POLICY IF EXISTS "admin_all_requests"           ON public.requests;

-- ---------------------------------------------------------------------------
-- Labs policies
-- ---------------------------------------------------------------------------

-- Anyone (including doctors) can read labs to populate the dropdown
CREATE POLICY "public_read_labs"
  ON public.labs FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can insert/update/delete labs
CREATE POLICY "admin_manage_labs"
  ON public.labs FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Lab users policies
-- ---------------------------------------------------------------------------

-- Lab users can read their own mapping
CREATE POLICY "lab_read_own_record"
  ON public.lab_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can manage all lab user records
CREATE POLICY "admin_manage_lab_users"
  ON public.lab_users FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Admin users policies
-- ---------------------------------------------------------------------------

-- Admins can read the admin_users table (to check their own status)
CREATE POLICY "admin_read_admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Requests policies
-- ---------------------------------------------------------------------------

-- Labs: can only SELECT requests belonging to their own lab
CREATE POLICY "lab_select_own_requests"
  ON public.requests FOR SELECT
  TO authenticated
  USING (
    lab_id = (
      SELECT lab_id FROM public.lab_users WHERE user_id = auth.uid()
    )
  );

-- Labs: can only UPDATE requests belonging to their own lab
CREATE POLICY "lab_update_own_requests"
  ON public.requests FOR UPDATE
  TO authenticated
  USING (
    lab_id = (
      SELECT lab_id FROM public.lab_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    lab_id = (
      SELECT lab_id FROM public.lab_users WHERE user_id = auth.uid()
    )
  );

-- Admins: full access to all requests
CREATE POLICY "admin_all_requests"
  ON public.requests FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- NOTE: INSERT on requests is handled exclusively via the service role key
-- in server-side API routes. No client-side insert is permitted.

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get a lab user's lab_id from their auth uid
CREATE OR REPLACE FUNCTION public.get_my_lab_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT lab_id FROM public.lab_users WHERE user_id = auth.uid();
$$;

-- =============================================================================
-- INITIAL SETUP NOTES
-- =============================================================================
-- 1. After running this schema, create your first admin user:
--    a. Create a user in Supabase Auth (Authentication > Users > Add User)
--    b. Copy the user's UUID
--    c. Run: INSERT INTO public.admin_users (user_id) VALUES ('your-uuid-here');
--
-- 2. Labs are created through the Admin Dashboard at /admin
--    The admin interface creates both the lab record and its auth user.
--
-- 3. Doctors never create accounts — they submit requests anonymously.
-- =============================================================================
