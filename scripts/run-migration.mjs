#!/usr/bin/env node
/**
 * Targeted production migration script.
 * Adds columns / constraints that are missing in production but defined in
 * schema.prisma, without using prisma db push (which would also attempt
 * destructive changes like dropping columns).
 *
 * Safe to run multiple times — every statement uses IF NOT EXISTS / IF EXISTS.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

// Run migrations over the DIRECT (non-pooled) connection when available. The
// pooled DATABASE_URL goes through PgBouncer in transaction mode, where each
// $executeRawUnsafe can land on a different backend and lose its prepared
// statement ("prepared statement \"sNN\" does not exist", SQLSTATE 26000).
const pooledUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL || pooledUrl;

function clientFor(url) {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

// Connection-level failures (DNS, refused, stale Supabase pooler tenant,
// bad password) — as opposed to per-statement SQL errors.
function isConnectionError(err) {
  const msg = String(err?.message ?? "");
  return (
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Timed out") ||
    msg.includes("tenant/user") || // Supavisor: "FATAL: tenant/user ... not found"
    msg.includes("Can't reach database server") ||
    msg.includes("password authentication failed")
  );
}

function shortError(err) {
  const lines = String(err?.message ?? err).split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "unknown error";
}

// Probe the connection before running anything: a dead connection would
// otherwise surface as dozens of confusing per-statement failures (and
// continueOnError steps would silently report "already applied"). If the
// direct connection is broken but the pooled one works, fall back to it —
// execWithRetry below already handles pooler prepared-statement artifacts.
let prisma = clientFor(directUrl);
try {
  await prisma.$queryRawUnsafe("SELECT 1");
} catch (err) {
  if (isConnectionError(err) && pooledUrl && pooledUrl !== directUrl) {
    console.warn(`  ! DIRECT_URL connection failed (${shortError(err)}) — falling back to DATABASE_URL`);
    await prisma.$disconnect().catch(() => {});
    prisma = clientFor(pooledUrl);
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
    } catch (err2) {
      console.error(`  ✗ DATABASE_URL connection also failed: ${shortError(err2)}`);
      console.error(
        "\nCannot reach the database, so no migrations can run. Check the DATABASE_URL and DIRECT_URL " +
          "environment variables in your deployment settings — a \"tenant/user ... not found\" error means " +
          "the Supabase connection string is stale (get a fresh one from Supabase Dashboard → Connect)."
      );
      process.exit(1);
    }
  } else {
    console.error(`  ✗ Database connection failed: ${shortError(err)}`);
    console.error(
      "\nCannot reach the database, so no migrations can run. Check the DATABASE_URL and DIRECT_URL " +
        "environment variables in your deployment settings — a \"tenant/user ... not found\" error means " +
        "the Supabase connection string is stale (get a fresh one from Supabase Dashboard → Connect)."
    );
    process.exit(1);
  }
}

// Belt-and-suspenders: even on a direct connection, retry the pooler artifact.
function isPreparedStmtArtifact(err) {
  const msg = String(err?.message ?? "");
  return msg.includes("prepared statement") && msg.includes("does not exist");
}
async function execWithRetry(sql, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (err) {
      lastErr = err;
      if (isPreparedStmtArtifact(err)) continue;
      throw err;
    }
  }
  throw lastErr;
}

const migrations = [
  {
    desc: "lab_members name & signature columns",
    sql: `ALTER TABLE lab_members
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS signature_url TEXT`,
    continueOnError: true,
  },
  {
    desc: "request_results analyst/verifier columns",
    sql: `ALTER TABLE request_results
      ADD COLUMN IF NOT EXISTS analyst_name TEXT,
      ADD COLUMN IF NOT EXISTS analyst_signature_url TEXT,
      ADD COLUMN IF NOT EXISTS verifier_name TEXT,
      ADD COLUMN IF NOT EXISTS verifier_signature_url TEXT`,
    continueOnError: true,
  },
  {
    desc: "lab_result_templates description & icon columns",
    sql: `ALTER TABLE lab_result_templates
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS icon TEXT`,
    continueOnError: true,
  },
  {
    desc: "labs Mirth integration columns",
    sql: `ALTER TABLE labs
      ADD COLUMN IF NOT EXISTS mirth_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS mirth_url TEXT,
      ADD COLUMN IF NOT EXISTS mirth_auth_token TEXT,
      ADD COLUMN IF NOT EXISTS mirth_inbound_secret TEXT`,
    continueOnError: true,
  },
  {
    desc: "hl7_messages table (Mirth HL7 audit / queue)",
    sql: `CREATE TABLE IF NOT EXISTS hl7_messages (
      id TEXT PRIMARY KEY,
      lab_id TEXT NOT NULL,
      request_id TEXT,
      result_id TEXT,
      direction TEXT NOT NULL DEFAULT 'outbound',
      message_type TEXT NOT NULL DEFAULT 'ORU^R01',
      control_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      ack_text TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hl7_messages index (lab_id, direction, created_at)",
    sql: `CREATE INDEX IF NOT EXISTS hl7_messages_lab_dir_created_idx ON hl7_messages (lab_id, direction, created_at)`,
    continueOnError: true,
  },
  {
    desc: "hl7_messages index (result_id)",
    sql: `CREATE INDEX IF NOT EXISTS hl7_messages_result_id_idx ON hl7_messages (result_id)`,
    continueOnError: true,
  },
  {
    desc: "request_receipts table (payment / collection receipts)",
    sql: `CREATE TABLE IF NOT EXISTS request_receipts (
      id TEXT PRIMARY KEY,
      lab_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      receipt_no INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'payment',
      currency TEXT NOT NULL DEFAULT 'NGN',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      items JSONB NOT NULL DEFAULT '[]',
      payment_mode TEXT,
      note TEXT,
      issued_by TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "request_receipts unique (lab_id, receipt_no)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS request_receipts_lab_id_receipt_no_key ON request_receipts (lab_id, receipt_no)`,
    continueOnError: true,
  },
  {
    desc: "request_receipts index (request_id)",
    sql: `CREATE INDEX IF NOT EXISTS request_receipts_request_id_idx ON request_receipts (request_id)`,
    continueOnError: true,
  },
  {
    desc: "request_receipts index (lab_id)",
    sql: `CREATE INDEX IF NOT EXISTS request_receipts_lab_id_idx ON request_receipts (lab_id)`,
    continueOnError: true,
  },
  {
    desc: "requests.patient_age column (age replaces dob for new requests)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS patient_age INTEGER`,
    continueOnError: true,
  },
  {
    desc: "requests.fast_mode column (Fast Mode plain-language submit)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS fast_mode BOOLEAN NOT NULL DEFAULT false`,
    continueOnError: true,
  },
  {
    desc: "requests.raw_input column (Fast Mode original text)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS raw_input TEXT`,
    continueOnError: true,
  },
  {
    desc: "labs.search_hidden column",
    sql: `ALTER TABLE labs ADD COLUMN IF NOT EXISTS search_hidden BOOLEAN NOT NULL DEFAULT false`,
    continueOnError: true, // Prepared statement caching can cause conflicts; ignore if already applied
  },
  {
    desc: "requests.doctor_email nullable (self-service patient requests)",
    // Use conditional logic to avoid errors if already nullable or constraint exists
    sql: `ALTER TABLE requests ALTER COLUMN doctor_email DROP NOT NULL`,
    continueOnError: true, // If already nullable, this will fail gracefully
  },
  {
    desc: "labs.hero_image_url column for custom page background",
    sql: `ALTER TABLE labs ADD COLUMN IF NOT EXISTS hero_image_url TEXT`,
    continueOnError: true, // Prepared statement caching can cause conflicts; ignore if already applied
  },
  {
    desc: "sms_logs table for SMS delivery tracking",
    sql: `
      CREATE TABLE IF NOT EXISTS sms_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(50) NOT NULL,
        provider_msg_id VARCHAR(255),
        to_phone VARCHAR(50) NOT NULL,
        message_body TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        request_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS sms_logs_provider_msg_id_idx ON sms_logs(provider_msg_id);
      CREATE INDEX IF NOT EXISTS sms_logs_to_phone_idx ON sms_logs(to_phone);
      CREATE INDEX IF NOT EXISTS sms_logs_request_id_idx ON sms_logs(request_id);
      CREATE INDEX IF NOT EXISTS sms_logs_created_at_idx ON sms_logs(created_at);
    `,
    continueOnError: true, // Ignore if table already exists
  },
  {
    desc: "lab_synonym_generation_jobs table for background synonym processing",
    sql: `
      CREATE TABLE IF NOT EXISTS lab_synonym_generation_jobs (
        id TEXT PRIMARY KEY,
        lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
        total_tests INTEGER NOT NULL,
        completed_tests INTEGER NOT NULL DEFAULT 0,
        failed_tests INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'processing',
        error_message TEXT,
        initiated_by TEXT NOT NULL,
        started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP(3),
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS lab_synonym_generation_jobs_lab_id_status_idx ON lab_synonym_generation_jobs(lab_id, status);
      CREATE INDEX IF NOT EXISTS lab_synonym_generation_jobs_status_idx ON lab_synonym_generation_jobs(status);
      CREATE INDEX IF NOT EXISTS lab_synonym_generation_jobs_started_at_idx ON lab_synonym_generation_jobs(started_at);
    `,
    continueOnError: true,
  },
  {
    desc: "lab_synonym_generation_test_results table for tracking individual test processing",
    sql: `
      CREATE TABLE IF NOT EXISTS lab_synonym_generation_test_results (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES lab_synonym_generation_jobs(id) ON DELETE CASCADE,
        test_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        generated_synonyms JSONB,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        last_attempted_at TIMESTAMP(3),
        completed_at TIMESTAMP(3),
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_id, test_id)
      );
      CREATE INDEX IF NOT EXISTS lab_synonym_generation_test_results_job_id_status_idx ON lab_synonym_generation_test_results(job_id, status);
      CREATE INDEX IF NOT EXISTS lab_synonym_generation_test_results_status_idx ON lab_synonym_generation_test_results(status);
    `,
    continueOnError: true,
  },
  {
    desc: "test_knowledge_bases table for KB management",
    sql: `
      CREATE TABLE IF NOT EXISTS test_knowledge_bases (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        synonyms JSONB NOT NULL DEFAULT '[]',
        variants JSONB NOT NULL DEFAULT '[]',
        category TEXT,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS test_knowledge_bases_canonical_name_idx ON test_knowledge_bases(canonical_name);
    `,
    continueOnError: true,
  },
  {
    desc: "lab_test_kb_mappings table for KB mapping",
    sql: `
      CREATE TABLE IF NOT EXISTS lab_test_kb_mappings (
        id TEXT PRIMARY KEY,
        lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
        lab_test_name TEXT NOT NULL,
        knowledge_base_id TEXT NOT NULL REFERENCES test_knowledge_bases(id) ON DELETE CASCADE,
        variants_available JSONB,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lab_id, lab_test_name)
      );
      CREATE INDEX IF NOT EXISTS lab_test_kb_mappings_lab_id_knowledge_base_id_idx ON lab_test_kb_mappings(lab_id, knowledge_base_id);
    `,
    continueOnError: true,
  },
  {
    desc: "lab_marketers table for lab-specific marketer assignments",
    sql: `
      CREATE TABLE IF NOT EXISTS lab_marketers (
        id TEXT PRIMARY KEY,
        lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
        marketer_id TEXT NOT NULL REFERENCES marketers(id) ON DELETE CASCADE,
        added_by TEXT NOT NULL,
        added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lab_id, marketer_id)
      );
      CREATE INDEX IF NOT EXISTS lab_marketers_lab_id_idx ON lab_marketers(lab_id);
      CREATE INDEX IF NOT EXISTS lab_marketers_marketer_id_idx ON lab_marketers(marketer_id);
      CREATE INDEX IF NOT EXISTS lab_marketers_added_at_idx ON lab_marketers(added_at);
    `,
    continueOnError: true,
  },
  {
    desc: "lab_departments table for per-lab configurable departments (LIMS workflows)",
    sql: `
      CREATE TABLE IF NOT EXISTS lab_departments (
        id TEXT PRIMARY KEY,
        lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        workflow TEXT NOT NULL DEFAULT 'specimen',
        categories JSONB NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS lab_departments_lab_id_name_key ON lab_departments(lab_id, name);
      CREATE INDEX IF NOT EXISTS lab_departments_lab_id_idx ON lab_departments(lab_id);
    `,
    continueOnError: true,
  },
  {
    desc: "LabRole.can_view_marketers permission for marketer management access",
    sql: `ALTER TABLE "LabRole" ADD COLUMN IF NOT EXISTS can_view_marketers BOOLEAN NOT NULL DEFAULT false`,
    continueOnError: true,
  },
  {
    desc: "labs.free_trial column for free trial status",
    sql: `ALTER TABLE labs ADD COLUMN IF NOT EXISTS free_trial BOOLEAN NOT NULL DEFAULT false`,
    continueOnError: true,
  },
  // ── Hospital referral network ───────────────────────────────────────────────
  {
    desc: "hospitals referral-portal columns (email, phone, address, state, pin, specialties)",
    sql: `
      DO $$ BEGIN
        ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS state TEXT;
        ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS pin_hash TEXT;
        ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS specialties JSONB NOT NULL DEFAULT '[]';
        CREATE UNIQUE INDEX IF NOT EXISTS hospitals_email_key ON hospitals(email);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "hospital_otps table for hospital portal login codes",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS hospital_otps (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMP(3) NOT NULL,
          used BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS hospital_otps_email_idx ON hospital_otps(email);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "hospital_sessions table for hospital portal sessions",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS hospital_sessions (
          id TEXT PRIMARY KEY,
          hospital_id TEXT NOT NULL,
          expires_at TIMESTAMP(3) NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS hospital_sessions_hospital_id_idx ON hospital_sessions(hospital_id);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "hospital_doctors table linking doctors to hospitals",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS hospital_doctors (
          id TEXT PRIMARY KEY,
          hospital_id TEXT NOT NULL,
          doctor_email TEXT NOT NULL,
          doctor_name TEXT,
          added_by TEXT NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS hospital_doctors_doctor_email_idx ON hospital_doctors(doctor_email);
        CREATE UNIQUE INDEX IF NOT EXISTS hospital_doctors_hospital_id_doctor_email_key ON hospital_doctors(hospital_id, doctor_email);
        BEGIN
          ALTER TABLE hospital_doctors ADD CONSTRAINT hospital_doctors_hospital_id_fkey
            FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "referrals table for patient referrals between hospitals",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS referrals (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          patient_name TEXT NOT NULL,
          patient_age INTEGER,
          patient_sex TEXT,
          patient_phone TEXT NOT NULL,
          patient_email TEXT,
          hospital_number TEXT,
          doctor_email TEXT NOT NULL,
          doctor_name TEXT NOT NULL,
          doctor_phone TEXT,
          from_hospital TEXT NOT NULL,
          to_hospital_id TEXT NOT NULL,
          specialty TEXT NOT NULL,
          urgency TEXT NOT NULL DEFAULT 'routine',
          clinical_note TEXT NOT NULL,
          provisional_diagnosis TEXT,
          response_note TEXT,
          responded_at TIMESTAMP(3),
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS referrals_code_key ON referrals(code);
        CREATE INDEX IF NOT EXISTS referrals_to_hospital_id_status_idx ON referrals(to_hospital_id, status);
        CREATE INDEX IF NOT EXISTS referrals_doctor_email_idx ON referrals(doctor_email);
        CREATE INDEX IF NOT EXISTS referrals_patient_phone_idx ON referrals(patient_phone);
        BEGIN
          ALTER TABLE referrals ADD CONSTRAINT referrals_to_hospital_id_fkey
            FOREIGN KEY (to_hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "referral_events table for referral tracking timeline",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS referral_events (
          id TEXT PRIMARY KEY,
          referral_id TEXT NOT NULL,
          type TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          actor_label TEXT NOT NULL,
          from_hospital_id TEXT,
          to_hospital_id TEXT,
          note TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS referral_events_referral_id_created_at_idx ON referral_events(referral_id, created_at);
        BEGIN
          ALTER TABLE referral_events ADD CONSTRAINT referral_events_referral_id_fkey
            FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END $$;
    `,
    continueOnError: false,
  },
  // ── Async dermatology consultations (/skin) ─────────────────────────────────
  {
    desc: "skin_consults table for async dermatology consultations",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS skin_consults (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          patient_name TEXT NOT NULL,
          patient_email TEXT NOT NULL,
          patient_whatsapp TEXT NOT NULL,
          patient_age INTEGER,
          patient_sex TEXT,
          image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          conversation JSONB NOT NULL DEFAULT '[]',
          ai_summary TEXT,
          status TEXT NOT NULL DEFAULT 'new',
          admin_note TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          responded_at TIMESTAMP(3)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS skin_consults_code_key ON skin_consults(code);
        CREATE INDEX IF NOT EXISTS skin_consults_status_created_at_idx ON skin_consults(status, created_at);
        CREATE INDEX IF NOT EXISTS skin_consults_patient_email_idx ON skin_consults(patient_email);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "skin_consults payment columns",
    sql: `
      DO $$ BEGIN
        ALTER TABLE skin_consults ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE skin_consults ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2);
        ALTER TABLE skin_consults ADD COLUMN IF NOT EXISTS payment_reference TEXT;
        ALTER TABLE skin_consults ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP(3);
        CREATE UNIQUE INDEX IF NOT EXISTS skin_consults_payment_reference_key ON skin_consults(payment_reference);
        CREATE INDEX IF NOT EXISTS skin_consults_is_paid_created_at_idx ON skin_consults(is_paid, created_at);
      END $$;
    `,
    continueOnError: false,
  },
  // ── Doctor per-encounter charging (/d/[slug]) ───────────────────────────────
  {
    desc: "doctor_profiles per-encounter charging columns (fees, slug, subaccount)",
    sql: `
      DO $$ BEGIN
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS bank_code TEXT;
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS consultation_fee DECIMAL(12,2);
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS retainer_monthly DECIMAL(12,2);
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS retainer_yearly DECIMAL(12,2);
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS encounter_slug TEXT;
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS paystack_subaccount_code TEXT;
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS encounter_theme TEXT;
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS encounter_show_workplace BOOLEAN NOT NULL DEFAULT true;
        CREATE UNIQUE INDEX IF NOT EXISTS doctor_profiles_encounter_slug_key ON doctor_profiles(encounter_slug);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "encounters table for doctor per-encounter screening + charging",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS encounters (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          doctor_email TEXT NOT NULL,
          patient_name TEXT NOT NULL,
          patient_email TEXT NOT NULL,
          patient_phone TEXT NOT NULL,
          patient_age INTEGER,
          patient_sex TEXT,
          image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          conversation JSONB NOT NULL DEFAULT '[]',
          ai_summary TEXT,
          plan_type TEXT NOT NULL DEFAULT 'single',
          status TEXT NOT NULL DEFAULT 'awaiting_payment',
          doctor_note TEXT,
          is_paid BOOLEAN NOT NULL DEFAULT false,
          amount_paid DECIMAL(12,2),
          doctor_share DECIMAL(12,2),
          poveon_share DECIMAL(12,2),
          payment_reference TEXT,
          paid_at TIMESTAMP(3),
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          responded_at TIMESTAMP(3)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS encounters_code_key ON encounters(code);
        CREATE UNIQUE INDEX IF NOT EXISTS encounters_payment_reference_key ON encounters(payment_reference);
        CREATE INDEX IF NOT EXISTS encounters_doctor_email_created_at_idx ON encounters(doctor_email, created_at);
        CREATE INDEX IF NOT EXISTS encounters_patient_email_idx ON encounters(patient_email);
        CREATE INDEX IF NOT EXISTS encounters_status_created_at_idx ON encounters(status, created_at);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "doctor_patients table for doctor network + retainership status",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS doctor_patients (
          id TEXT PRIMARY KEY,
          doctor_email TEXT NOT NULL,
          patient_email TEXT NOT NULL,
          patient_name TEXT,
          patient_phone TEXT,
          subscription_type TEXT NOT NULL DEFAULT 'none',
          subscription_expires_at TIMESTAMP(3),
          total_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
          encounter_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS doctor_patients_doctor_email_patient_email_key ON doctor_patients(doctor_email, patient_email);
        CREATE INDEX IF NOT EXISTS doctor_patients_doctor_email_idx ON doctor_patients(doctor_email);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "encounter coupons + discount columns",
    sql: `
      DO $$ BEGIN
        ALTER TABLE encounters ADD COLUMN IF NOT EXISTS coupon_code TEXT;
        ALTER TABLE encounters ADD COLUMN IF NOT EXISTS discount_percent INTEGER;
        CREATE TABLE IF NOT EXISTS encounter_coupons (
          id TEXT PRIMARY KEY,
          doctor_email TEXT NOT NULL,
          code TEXT NOT NULL,
          percent_off INTEGER NOT NULL,
          active BOOLEAN NOT NULL DEFAULT true,
          times_used INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS encounter_coupons_doctor_email_code_key ON encounter_coupons(doctor_email, code);
        CREATE INDEX IF NOT EXISTS encounter_coupons_doctor_email_idx ON encounter_coupons(doctor_email);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: requests source / journey-stage / consent columns",
    sql: `
      DO $$ BEGIN
        ALTER TABLE requests ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'poveon';
        ALTER TABLE requests ADD COLUMN IF NOT EXISTS current_stage TEXT;
        ALTER TABLE requests ADD COLUMN IF NOT EXISTS consent_at TIMESTAMP(3);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: request_journey_events table (sample / client journey timeline)",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS request_journey_events (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          note TEXT,
          actor_email TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS request_journey_events_request_id_created_at_idx ON request_journey_events(request_id, created_at);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: lab_offered_tests.tat_hours column (per-test SLA)",
    sql: `ALTER TABLE lab_offered_tests ADD COLUMN IF NOT EXISTS tat_hours INTEGER`,
    continueOnError: true,
  },
  {
    desc: "LIMS: lab_roles permission flags complete (defensive — fixes legacy can_view_marketers gap)",
    sql: `
      DO $$ BEGIN
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_requests BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_mark_seen BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_mark_done BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_send_results BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_manage_team BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_manage_api_keys BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_referrals BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_clients BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_analytics BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_activity BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_feedback BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_wallet BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_view_marketers BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_manage_roles BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_manage_professionals BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS can_manage_templates BOOLEAN NOT NULL DEFAULT false;
        CREATE UNIQUE INDEX IF NOT EXISTS lab_roles_lab_id_name_key ON lab_roles(lab_id, name);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: lab_test_templates table (reusable panels)",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS lab_test_templates (
          id TEXT PRIMARY KEY,
          lab_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          category_label TEXT,
          test_names JSONB NOT NULL DEFAULT '[]',
          tat_hours INTEGER,
          created_by TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS lab_test_templates_lab_id_name_key ON lab_test_templates(lab_id, name);
        CREATE INDEX IF NOT EXISTS lab_test_templates_lab_id_idx ON lab_test_templates(lab_id);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: lab_professionals table (referring professionals + commission rate)",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS lab_professionals (
          id TEXT PRIMARY KEY,
          lab_id TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          specialty TEXT,
          hospital TEXT,
          commission_type TEXT NOT NULL DEFAULT 'percent',
          commission_value DECIMAL(12,2) NOT NULL DEFAULT 0,
          bank_name TEXT,
          account_number TEXT,
          account_name TEXT,
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS lab_professionals_lab_id_email_key ON lab_professionals(lab_id, email);
        CREATE INDEX IF NOT EXISTS lab_professionals_lab_id_idx ON lab_professionals(lab_id);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: professional_commissions ledger table",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS professional_commissions (
          id TEXT PRIMARY KEY,
          lab_id TEXT NOT NULL,
          professional_id TEXT NOT NULL,
          request_id TEXT,
          basis_amount DECIMAL(12,2),
          amount DECIMAL(12,2) NOT NULL,
          status TEXT NOT NULL DEFAULT 'accrued',
          paid_at TIMESTAMP(3),
          note TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS professional_commissions_lab_id_status_idx ON professional_commissions(lab_id, status);
        CREATE INDEX IF NOT EXISTS professional_commissions_professional_id_idx ON professional_commissions(professional_id);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: multi-department journey + result-report schema",
    sql: `
      DO $$ BEGIN
        ALTER TABLE request_journey_events ADD COLUMN IF NOT EXISTS department TEXT;
        ALTER TABLE request_journey_events ADD COLUMN IF NOT EXISTS sample_label TEXT;
        ALTER TABLE lab_roles ADD COLUMN IF NOT EXISTS department TEXT;
        CREATE TABLE IF NOT EXISTS lab_result_templates (
          id TEXT PRIMARY KEY,
          lab_id TEXT NOT NULL,
          name TEXT NOT NULL,
          department TEXT,
          parameters JSONB NOT NULL DEFAULT '[]',
          interpretation TEXT,
          created_by TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS lab_result_templates_lab_id_name_key ON lab_result_templates(lab_id, name);
        CREATE INDEX IF NOT EXISTS lab_result_templates_lab_id_idx ON lab_result_templates(lab_id);
        CREATE TABLE IF NOT EXISTS request_results (
          id TEXT PRIMARY KEY,
          lab_id TEXT NOT NULL,
          request_id TEXT NOT NULL,
          template_id TEXT,
          department TEXT,
          "values" JSONB NOT NULL DEFAULT '[]',
          comment TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          verified_by TEXT,
          verified_at TIMESTAMP(3),
          pdf_url TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS request_results_request_id_idx ON request_results(request_id);
        CREATE INDEX IF NOT EXISTS request_results_lab_id_status_idx ON request_results(lab_id, status);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "requests.is_paid + tests_confirmed (registration gate before pipeline)",
    sql: `
      DO $$ BEGIN
        ALTER TABLE requests ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE requests ADD COLUMN IF NOT EXISTS tests_confirmed BOOLEAN NOT NULL DEFAULT false;
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "backfill is_paid/tests_confirmed for already-progressed requests (avoid locking the pipeline)",
    sql: `
      UPDATE requests
      SET is_paid = true, tests_confirmed = true
      WHERE is_paid = false
        AND (status IN ('seen', 'done') OR (current_stage IS NOT NULL AND current_stage <> 'registered'));
    `,
    continueOnError: true,
  },
  {
    desc: "LIMS: request_results document/link columns",
    sql: `
      DO $$ BEGIN
        ALTER TABLE request_results ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'panel';
        ALTER TABLE request_results ADD COLUMN IF NOT EXISTS external_url TEXT;
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: lab_sops table (Standard Operating Procedures)",
    sql: `
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS lab_sops (
          id TEXT PRIMARY KEY,
          lab_id TEXT NOT NULL,
          title TEXT NOT NULL,
          category TEXT,
          department TEXT,
          content TEXT NOT NULL DEFAULT '',
          version INTEGER NOT NULL DEFAULT 1,
          created_by TEXT,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS lab_sops_lab_id_idx ON lab_sops(lab_id);
      END $$;
    `,
    continueOnError: false,
  },
  {
    desc: "LIMS: seed preset roles for every existing lab (idempotent)",
    // Columns: can_view_requests, can_mark_seen, can_mark_done, can_send_results,
    //   can_manage_team, can_manage_api_keys, can_view_referrals, can_view_clients,
    //   can_view_analytics, can_view_activity, can_view_feedback, can_view_wallet,
    //   can_view_marketers, can_manage_roles, can_manage_professionals, can_manage_templates
    sql: `
      DO $$
      DECLARE
        presets JSONB := '[
          {"name":"Lab Admin","p":[true,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true]},
          {"name":"Lab Manager","p":[true,true,true,true,false,false,true,true,true,true,true,true,true,false,true,true]},
          {"name":"Front Desk","p":[true,true,false,false,false,false,false,true,false,false,false,false,false,false,false,false]},
          {"name":"Sample Collector","p":[true,true,false,false,false,false,false,false,false,false,false,false,false,false,false,false]},
          {"name":"Lab Scientist","p":[true,false,true,true,false,false,false,false,false,false,false,false,false,false,false,true]},
          {"name":"Sonographer","d":"Sonography","p":[true,true,true,true,false,false,false,false,false,false,false,false,false,false,false,true]},
          {"name":"Radiographer","d":"Radiology","p":[true,true,true,true,false,false,false,false,false,false,false,false,false,false,false,true]},
          {"name":"Accountant","p":[false,false,false,false,false,false,false,false,true,false,false,true,false,false,true,false]}
        ]'::jsonb;
        preset JSONB;
        p JSONB;
      BEGIN
        FOR preset IN SELECT * FROM jsonb_array_elements(presets) LOOP
          p := preset->'p';
          INSERT INTO lab_roles (
            id, lab_id, name,
            can_view_requests, can_mark_seen, can_mark_done, can_send_results,
            can_manage_team, can_manage_api_keys, can_view_referrals, can_view_clients,
            can_view_analytics, can_view_activity, can_view_feedback, can_view_wallet,
            can_view_marketers, can_manage_roles, can_manage_professionals, can_manage_templates,
            department, created_at
          )
          SELECT
            gen_random_uuid(), labs.id, preset->>'name',
            (p->>0)::boolean, (p->>1)::boolean, (p->>2)::boolean, (p->>3)::boolean,
            (p->>4)::boolean, (p->>5)::boolean, (p->>6)::boolean, (p->>7)::boolean,
            (p->>8)::boolean, (p->>9)::boolean, (p->>10)::boolean, (p->>11)::boolean,
            (p->>12)::boolean, (p->>13)::boolean, (p->>14)::boolean, (p->>15)::boolean,
            preset->>'d', NOW()
          FROM labs
          ON CONFLICT (lab_id, name) DO NOTHING;
        END LOOP;
      END $$;
    `,
    continueOnError: true, // preset seeding is a convenience — never block a deploy
  },
  {
    desc: "lab_departments table (per-lab configurable departments)",
    sql: `
      CREATE TABLE IF NOT EXISTS lab_departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        workflow VARCHAR(20) NOT NULL DEFAULT 'specimen',
        categories JSONB NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    continueOnError: true,
  },
  {
    desc: "lab_departments unique (lab_id, name)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS lab_departments_lab_id_name_key ON lab_departments(lab_id, name)`,
    continueOnError: true,
  },
  {
    desc: "lab_departments index (lab_id)",
    sql: `CREATE INDEX IF NOT EXISTS lab_departments_lab_id_idx ON lab_departments(lab_id)`,
    continueOnError: true,
  },
  {
    desc: "lab_professionals.bank_code column (NIBSS bank selection)",
    sql: `ALTER TABLE lab_professionals ADD COLUMN IF NOT EXISTS bank_code TEXT`,
    continueOnError: true,
  },
  {
    // Radiology / Imaging departments never collect a sample — ensure they use
    // the imaging pipeline even when saved with the default specimen pipeline.
    desc: "normalize radiology/imaging departments to the imaging pipeline",
    sql: `UPDATE lab_departments SET workflow='imaging' WHERE workflow IS DISTINCT FROM 'imaging' AND (lower(name) LIKE '%radiolog%' OR lower(name) LIKE '%imaging%')`,
    continueOnError: true,
  },
  {
    desc: "backfill empty department workflow to specimen",
    sql: `UPDATE lab_departments SET workflow='specimen' WHERE workflow IS NULL OR workflow=''`,
    continueOnError: true,
  },
  {
    desc: "requests.scheduled_at column (calendar scheduling for imaging)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP(3)`,
    continueOnError: true,
  },
  {
    desc: "requests scheduled_at index (radiology schedule lookups)",
    sql: `CREATE INDEX IF NOT EXISTS requests_lab_id_scheduled_at_idx ON requests(lab_id, scheduled_at)`,
    continueOnError: true,
  },
  {
    // Collapse legacy granular department tracks onto the new 2-department model
    // so in-flight requests keep their pipeline progress. Idempotent: once
    // remapped, no rows match the old names.
    desc: "remap legacy journey-event departments → Laboratory",
    sql: `UPDATE request_journey_events SET department='Laboratory' WHERE department IN ('Hematology','Chemistry','Microbiology','Immunology','Histopathology')`,
    continueOnError: true,
  },
  {
    desc: "remap legacy journey-event departments → Radiology",
    sql: `UPDATE request_journey_events SET department='Radiology' WHERE department IN ('Sonography','Cardiology')`,
    continueOnError: true,
  },
  {
    // Keep staff roles scoped to old granular departments working under the new
    // 2-department model. Idempotent once remapped.
    desc: "remap legacy role departments → Laboratory",
    sql: `UPDATE lab_roles SET department='Laboratory' WHERE department IN ('Hematology','Chemistry','Microbiology','Immunology','Histopathology')`,
    continueOnError: true,
  },
  {
    desc: "remap legacy role departments → Radiology",
    sql: `UPDATE lab_roles SET department='Radiology' WHERE department IN ('Sonography','Cardiology')`,
    continueOnError: true,
  },

  // ── Marketer growth tools ──────────────────────────────────────────────────
  {
    desc: "marketers.weekly_target column",
    sql: `ALTER TABLE marketers ADD COLUMN IF NOT EXISTS weekly_target INTEGER`,
    continueOnError: true,
  },

  // ── Hospital EMR ───────────────────────────────────────────────────────────
  {
    desc: "hospital_departments table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_departments (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_departments unique (hospital_id, key)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hospital_departments_hospital_id_key_key ON hospital_departments (hospital_id, key)`,
    continueOnError: true,
  },
  {
    desc: "hospital_staff table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_staff (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      pin_hash TEXT,
      department_key TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_staff index (hospital_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_staff_hospital_id_idx ON hospital_staff (hospital_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_staff_sessions table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_staff_sessions (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      expires_at TIMESTAMP(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_staff_sessions index (staff_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_staff_sessions_staff_id_idx ON hospital_staff_sessions (staff_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_patients table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_patients (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      hospital_number TEXT NOT NULL,
      full_name TEXT NOT NULL,
      dob DATE,
      age INTEGER,
      sex TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      occupation TEXT,
      marital_status TEXT,
      blood_group TEXT,
      genotype TEXT,
      allergies TEXT,
      known_conditions TEXT,
      next_of_kin_name TEXT,
      next_of_kin_relationship TEXT,
      next_of_kin_phone TEXT,
      next_of_kin_address TEXT,
      insurance_provider TEXT,
      insurance_number TEXT,
      created_by TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_patients unique (hospital_id, hospital_number)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hospital_patients_hospital_id_hospital_number_key ON hospital_patients (hospital_id, hospital_number)`,
    continueOnError: true,
  },
  {
    desc: "hospital_encounters table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_encounters (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'outpatient',
      status TEXT NOT NULL DEFAULT 'waiting_vitals',
      chief_complaint TEXT,
      attending_doctor_id TEXT,
      created_by TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      closed_at TIMESTAMP(3)
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_encounters index (hospital_id, status)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_encounters_hospital_id_status_idx ON hospital_encounters (hospital_id, status)`,
    continueOnError: true,
  },
  {
    desc: "hospital_vitals table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_vitals (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      temperature DOUBLE PRECISION,
      systolic INTEGER,
      diastolic INTEGER,
      pulse INTEGER,
      resp_rate INTEGER,
      spo2 INTEGER,
      weight_kg DOUBLE PRECISION,
      height_cm DOUBLE PRECISION,
      bmi DOUBLE PRECISION,
      blood_sugar DOUBLE PRECISION,
      pain_score INTEGER,
      notes TEXT,
      recorded_by TEXT,
      recorded_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_vitals index (encounter_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_vitals_encounter_id_idx ON hospital_vitals (encounter_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_consultation_notes table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_consultation_notes (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT,
      content JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      signed_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_consultation_notes index (encounter_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_consultation_notes_encounter_id_idx ON hospital_consultation_notes (encounter_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_prescriptions table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_prescriptions (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT,
      raw_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      dispensed_by TEXT,
      dispensed_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_prescriptions index (encounter_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_prescriptions_encounter_id_idx ON hospital_prescriptions (encounter_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_prescription_items table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_prescription_items (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL,
      drug_name TEXT NOT NULL,
      strength TEXT,
      form TEXT,
      dose TEXT,
      route TEXT,
      frequency TEXT,
      frequency_per_day INTEGER,
      duration_days INTEGER,
      quantity TEXT,
      instructions TEXT,
      raw_fragment TEXT,
      confidence DOUBLE PRECISION,
      status TEXT NOT NULL DEFAULT 'pending',
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_prescription_items index (prescription_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_prescription_items_prescription_id_idx ON hospital_prescription_items (prescription_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_lab_orders table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_lab_orders (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT,
      clinical_note TEXT,
      status TEXT NOT NULL DEFAULT 'ordered',
      collected_by TEXT,
      collected_at TIMESTAMP(3),
      resulted_by TEXT,
      resulted_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_lab_orders index (encounter_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_lab_orders_encounter_id_idx ON hospital_lab_orders (encounter_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_lab_order_tests table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_lab_order_tests (
      id TEXT PRIMARY KEY,
      lab_order_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      result_value TEXT,
      result_unit TEXT,
      reference_range TEXT,
      flag TEXT,
      status TEXT NOT NULL DEFAULT 'ordered',
      raw_fragment TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_lab_order_tests index (lab_order_id)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_lab_order_tests_lab_order_id_idx ON hospital_lab_order_tests (lab_order_id)`,
    continueOnError: true,
  },
  {
    desc: "hospital_admissions table",
    sql: `CREATE TABLE IF NOT EXISTS hospital_admissions (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      encounter_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      ward_name TEXT NOT NULL,
      bed_label TEXT,
      admitting_doctor_id TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'admitted',
      discharge_summary TEXT,
      admitted_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      discharged_at TIMESTAMP(3)
    )`,
    continueOnError: true,
  },
  {
    desc: "hospital_admissions index (hospital_id, status)",
    sql: `CREATE INDEX IF NOT EXISTS hospital_admissions_hospital_id_status_idx ON hospital_admissions (hospital_id, status)`,
    continueOnError: true,
  },

  // ── HMO remote patient monitoring ──
  {
    desc: "hmos table (HMO partners)",
    sql: `CREATE TABLE IF NOT EXISTS hmos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      contact_email TEXT,
      contact_phone TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmos unique index (code)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hmos_code_key ON hmos (code)`,
    continueOnError: true,
  },
  {
    desc: "hmo_members table (uploaded rosters)",
    sql: `CREATE TABLE IF NOT EXISTS hmo_members (
      id TEXT PRIMARY KEY,
      hmo_id TEXT NOT NULL REFERENCES hmos(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      policy_number TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      date_of_birth TEXT,
      sex TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      flagged BOOLEAN NOT NULL DEFAULT false,
      flagged_by TEXT,
      flagged_at TIMESTAMP(3),
      flag_note TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmo_members unique index (hmo_id, policy_number)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hmo_members_hmo_id_policy_number_key ON hmo_members (hmo_id, policy_number)`,
    continueOnError: true,
  },
  {
    desc: "hmo_members unique index (hmo_id, email)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hmo_members_hmo_id_email_key ON hmo_members (hmo_id, email)`,
    continueOnError: true,
  },
  {
    desc: "hmo_members index (email)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_members_email_idx ON hmo_members (email)`,
    continueOnError: true,
  },
  {
    desc: "hmo_patient_sessions table",
    sql: `CREATE TABLE IF NOT EXISTS hmo_patient_sessions (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES hmo_members(id) ON DELETE CASCADE,
      expires_at TIMESTAMP(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmo_patient_sessions index (member_id)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_patient_sessions_member_id_idx ON hmo_patient_sessions (member_id)`,
    continueOnError: true,
  },
  {
    desc: "hmo_vitals_readings table (BP / blood sugar logs)",
    sql: `CREATE TABLE IF NOT EXISTS hmo_vitals_readings (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES hmo_members(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      systolic INTEGER,
      diastolic INTEGER,
      pulse INTEGER,
      glucose_mg_dl DECIMAL(6,1),
      glucose_context TEXT,
      note TEXT,
      recorded_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmo_vitals_readings index (member_id, type, recorded_at)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_vitals_readings_member_id_type_recorded_at_idx ON hmo_vitals_readings (member_id, type, recorded_at)`,
    continueOnError: true,
  },
  {
    desc: "hmo_doctor_coverages table (doctor covers whole HMO)",
    sql: `CREATE TABLE IF NOT EXISTS hmo_doctor_coverages (
      id TEXT PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      hmo_id TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmo_doctor_coverages unique index (doctor_email, hmo_id)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hmo_doctor_coverages_doctor_email_hmo_id_key ON hmo_doctor_coverages (doctor_email, hmo_id)`,
    continueOnError: true,
  },
  {
    desc: "hmo_doctor_coverages index (hmo_id)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_doctor_coverages_hmo_id_idx ON hmo_doctor_coverages (hmo_id)`,
    continueOnError: true,
  },
  {
    desc: "hmo_doctor_patients table (doctor assigned to individual member)",
    sql: `CREATE TABLE IF NOT EXISTS hmo_doctor_patients (
      id TEXT PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      member_id TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmo_doctor_patients unique index (doctor_email, member_id)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS hmo_doctor_patients_doctor_email_member_id_key ON hmo_doctor_patients (doctor_email, member_id)`,
    continueOnError: true,
  },
  {
    desc: "hmo_doctor_patients index (member_id)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_doctor_patients_member_id_idx ON hmo_doctor_patients (member_id)`,
    continueOnError: true,
  },
  {
    desc: "hmo_vitals_alerts table (threshold / rising-trend alerts)",
    sql: `CREATE TABLE IF NOT EXISTS hmo_vitals_alerts (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES hmo_members(id) ON DELETE CASCADE,
      reading_id TEXT REFERENCES hmo_vitals_readings(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmo_vitals_alerts index (member_id, created_at)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_vitals_alerts_member_id_created_at_idx ON hmo_vitals_alerts (member_id, created_at)`,
    continueOnError: true,
  },
  {
    desc: "hmo_vitals_alerts index (status, created_at)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_vitals_alerts_status_created_at_idx ON hmo_vitals_alerts (status, created_at)`,
    continueOnError: true,
  },
  {
    desc: "hmo_alert_email_logs table (alert email cooldown ledger)",
    sql: `CREATE TABLE IF NOT EXISTS hmo_alert_email_logs (
      id TEXT PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      member_id TEXT NOT NULL,
      alert_id TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "hmo_alert_email_logs index (doctor_email, member_id, created_at)",
    sql: `CREATE INDEX IF NOT EXISTS hmo_alert_email_logs_doctor_email_member_id_created_at_idx ON hmo_alert_email_logs (doctor_email, member_id, created_at)`,
    continueOnError: true,
  },
  {
    desc: "requests.referral_type column (QR intake: self | doctor | hmo)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS referral_type TEXT`,
    continueOnError: true,
  },
  {
    desc: "requests.policy_number column (HMO policy number)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS policy_number TEXT`,
    continueOnError: true,
  },
  {
    desc: "requests.whatsapp_phone column (QR intake WhatsApp number)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT`,
    continueOnError: true,
  },
  {
    desc: "requests.payment_mode column (cash | card | transfer | bill_hospital)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS payment_mode TEXT`,
    continueOnError: true,
  },
  {
    desc: "requests.arrived_at column (client physically arrived at the lab)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP(3)`,
    continueOnError: true,
  },
  {
    desc: "requests.queue_confirmed_at column (QR registration confirmed into queue)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS queue_confirmed_at TIMESTAMP(3)`,
    continueOnError: true,
  },
  {
    desc: "requests.attended_at column (client attended to, leaves the queue)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS attended_at TIMESTAMP(3)`,
    continueOnError: true,
  },
  {
    desc: "requests.queue_number column (stable daily queue ticket number)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS queue_number INTEGER`,
    continueOnError: true,
  },
  {
    desc: "lab_partners table (HMOs / hospitals / companies a lab works with)",
    sql: `CREATE TABLE IF NOT EXISTS lab_partners (
      id TEXT PRIMARY KEY,
      lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "lab_partners index (lab_id, type)",
    sql: `CREATE INDEX IF NOT EXISTS lab_partners_lab_id_type_idx ON lab_partners (lab_id, type)`,
    continueOnError: true,
  },
  {
    desc: "requests.has_free_ride column (free-ride perk redeemed)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS has_free_ride BOOLEAN NOT NULL DEFAULT false`,
    continueOnError: true,
  },
  {
    desc: "doctor_perks table (admin-granted, lab-specific doctor perks)",
    sql: `CREATE TABLE IF NOT EXISTS doctor_perks (
      id TEXT PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      lab_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'free_ride',
      remaining_uses INTEGER NOT NULL DEFAULT 1,
      total_uses INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT true,
      note TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "doctor_perks index (doctor_email, lab_id, is_active)",
    sql: `CREATE INDEX IF NOT EXISTS doctor_perks_doctor_lab_active_idx ON doctor_perks (doctor_email, lab_id, is_active)`,
    continueOnError: true,
  },
  {
    desc: "ride_perks table (redeemed free rides)",
    sql: `CREATE TABLE IF NOT EXISTS ride_perks (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      perk_id TEXT,
      doctor_email TEXT NOT NULL,
      lab_id TEXT NOT NULL,
      request_id TEXT,
      partner_id TEXT,
      rider_id TEXT,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      pickup_address TEXT NOT NULL,
      destination_address TEXT NOT NULL,
      destination_lab TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cost DECIMAL(12,2),
      is_paid_to_partner BOOLEAN NOT NULL DEFAULT false,
      rider_notified_at TIMESTAMP(3),
      redeem_by TIMESTAMP(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      assigned_at TIMESTAMP(3),
      completed_at TIMESTAMP(3)
    )`,
    continueOnError: true,
  },
  {
    desc: "ride_perks indexes",
    sql: `CREATE INDEX IF NOT EXISTS ride_perks_lab_status_idx ON ride_perks (lab_id, status);
      CREATE INDEX IF NOT EXISTS ride_perks_partner_status_idx ON ride_perks (partner_id, status);
      CREATE INDEX IF NOT EXISTS ride_perks_rider_status_idx ON ride_perks (rider_id, status)`,
    continueOnError: true,
  },
  {
    desc: "logistics_partners table",
    sql: `CREATE TABLE IF NOT EXISTS logistics_partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      contact_name TEXT,
      phone TEXT,
      address TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "logistics_partner_labs table (partner ↔ lab assignment)",
    sql: `CREATE TABLE IF NOT EXISTS logistics_partner_labs (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      lab_id TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "logistics_partner_labs unique + index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS logistics_partner_labs_partner_lab_key ON logistics_partner_labs (partner_id, lab_id);
      CREATE INDEX IF NOT EXISTS logistics_partner_labs_lab_idx ON logistics_partner_labs (lab_id)`,
    continueOnError: true,
  },
  {
    desc: "riders table (dispatch riders added by logistics partners)",
    sql: `CREATE TABLE IF NOT EXISTS riders (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "riders index (partner_id)",
    sql: `CREATE INDEX IF NOT EXISTS riders_partner_idx ON riders (partner_id)`,
    continueOnError: true,
  },
  {
    desc: "logistics_otps table",
    sql: `CREATE TABLE IF NOT EXISTS logistics_otps (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMP(3) NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "logistics_otps index (email)",
    sql: `CREATE INDEX IF NOT EXISTS logistics_otps_email_idx ON logistics_otps (email)`,
    continueOnError: true,
  },
  {
    desc: "logistics_sessions table",
    sql: `CREATE TABLE IF NOT EXISTS logistics_sessions (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      expires_at TIMESTAMP(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "logistics_sessions index (partner_id)",
    sql: `CREATE INDEX IF NOT EXISTS logistics_sessions_partner_idx ON logistics_sessions (partner_id)`,
    continueOnError: true,
  },
  {
    desc: "rider_otps table",
    sql: `CREATE TABLE IF NOT EXISTS rider_otps (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMP(3) NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "rider_otps index (email)",
    sql: `CREATE INDEX IF NOT EXISTS rider_otps_email_idx ON rider_otps (email)`,
    continueOnError: true,
  },
  {
    desc: "labs.request_emails column (multiple new-request notification recipients)",
    sql: `ALTER TABLE labs ADD COLUMN IF NOT EXISTS request_emails JSONB NOT NULL DEFAULT '[]'`,
    continueOnError: true,
  },
  {
    desc: "rider_sessions table",
    sql: `CREATE TABLE IF NOT EXISTS rider_sessions (
      id TEXT PRIMARY KEY,
      rider_id TEXT NOT NULL,
      expires_at TIMESTAMP(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "rider_sessions index (rider_id)",
    sql: `CREATE INDEX IF NOT EXISTS rider_sessions_rider_idx ON rider_sessions (rider_id)`,
    continueOnError: true,
  },
  {
    desc: "requests.attending_by column (queue soft-lock: staff currently attending)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS attending_by TEXT`,
    continueOnError: true,
  },
  {
    desc: "requests.attending_since column (when the staff opened the client)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS attending_since TIMESTAMP(3)`,
    continueOnError: true,
  },
  {
    desc: "requests.details_captured_at column (staff finished entering details)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS details_captured_at TIMESTAMP(3)`,
    continueOnError: true,
  },
  {
    desc: "requests.details_captured_by column (staff who marked details captured)",
    sql: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS details_captured_by TEXT`,
    continueOnError: true,
  },
  {
    desc: "sms_logs channel & error_code columns (WhatsApp support)",
    sql: `ALTER TABLE sms_logs
      ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'sms',
      ADD COLUMN IF NOT EXISTS error_code TEXT`,
    continueOnError: true,
  },
  {
    desc: "sms_logs channel index (per-channel daily caps)",
    sql: `CREATE INDEX IF NOT EXISTS sms_logs_channel_created_at_idx ON sms_logs (channel, created_at)`,
    continueOnError: true,
  },
  {
    // The requests table had no indexes at all, so every dashboard poll,
    // queue refresh and code lookup was a sequential scan of the whole table.
    desc: "requests indexes (lab dashboards, queue, doctor & patient lookups)",
    sql: `
      CREATE INDEX IF NOT EXISTS requests_lab_created_idx ON requests (lab_id, created_at);
      CREATE INDEX IF NOT EXISTS requests_lab_status_idx ON requests (lab_id, status);
      CREATE INDEX IF NOT EXISTS requests_lab_queue_confirmed_idx ON requests (lab_id, queue_confirmed_at);
      CREATE INDEX IF NOT EXISTS requests_lab_updated_idx ON requests (lab_id, updated_at);
      CREATE INDEX IF NOT EXISTS requests_doctor_email_idx ON requests (doctor_email);
      CREATE INDEX IF NOT EXISTS requests_patient_phone_idx ON requests (patient_phone);
    `,
    continueOnError: true,
  },
  {
    // The doctor portal reads a doctor's requests newest-first; the plain
    // doctor_email index still left Postgres sorting the whole slice.
    desc: "requests index (doctor_email, created_at) — doctor portal list",
    sql: `CREATE INDEX IF NOT EXISTS requests_doctor_email_created_idx ON requests (doctor_email, created_at)`,
    continueOnError: true,
  },

  // ── Care plan (/consults) ───────────────────────────────────────────────
  {
    desc: "doctor_profiles care-plan columns (accepting, yearly cap)",
    sql: `ALTER TABLE doctor_profiles
      ADD COLUMN IF NOT EXISTS consult_accepting BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS consult_patient_cap INTEGER`,
    continueOnError: true,
  },
  {
    desc: "consult_settings table (admin-controlled price & doctor share)",
    sql: `CREATE TABLE IF NOT EXISTS consult_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      price_naira DECIMAL(12,2) NOT NULL DEFAULT 10000,
      doctor_share_naira DECIMAL(12,2) NOT NULL DEFAULT 6000,
      message_allowance INTEGER NOT NULL DEFAULT 40,
      release_months INTEGER NOT NULL DEFAULT 12,
      default_doctor_cap INTEGER NOT NULL DEFAULT 200,
      lab_discount_percent INTEGER NOT NULL DEFAULT 15,
      pharmacy_discount_percent INTEGER NOT NULL DEFAULT 10,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_by TEXT
    )`,
    continueOnError: true,
  },
  {
    desc: "consult_patients table (care-plan members)",
    sql: `CREATE TABLE IF NOT EXISTS consult_patients (
      id TEXT PRIMARY KEY,
      code TEXT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      sex TEXT,
      date_of_birth DATE,
      state TEXT,
      city TEXT,
      conditions TEXT[] NOT NULL DEFAULT '{}',
      consent_at TIMESTAMP(3),
      doctor_email TEXT,
      assigned_at TIMESTAMP(3),
      status TEXT NOT NULL DEFAULT 'pending_payment',
      subscribed_at TIMESTAMP(3),
      expires_at TIMESTAMP(3),
      amount_paid DECIMAL(12,2),
      paystack_ref TEXT,
      messages_used INTEGER NOT NULL DEFAULT 0,
      message_allowance INTEGER NOT NULL DEFAULT 40,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "consult_patients indexes",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS consult_patients_code_key ON consult_patients (code);
      CREATE UNIQUE INDEX IF NOT EXISTS consult_patients_email_key ON consult_patients (email);
      CREATE INDEX IF NOT EXISTS consult_patients_doctor_status_idx ON consult_patients (doctor_email, status);
      CREATE INDEX IF NOT EXISTS consult_patients_status_expires_idx ON consult_patients (status, expires_at);
      CREATE INDEX IF NOT EXISTS consult_patients_email_idx ON consult_patients (email);
    `,
    continueOnError: true,
  },
  {
    desc: "consult_messages table (async doctor/member thread)",
    sql: `CREATE TABLE IF NOT EXISTS consult_messages (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      read_at TIMESTAMP(3),
      counted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "consult_messages index",
    sql: `CREATE INDEX IF NOT EXISTS consult_messages_patient_created_idx ON consult_messages (patient_id, created_at)`,
    continueOnError: true,
  },
  {
    desc: "consult_earnings table (doctor entitlement per member-year)",
    sql: `CREATE TABLE IF NOT EXISTS consult_earnings (
      id TEXT PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      total_naira DECIMAL(12,2) NOT NULL,
      released_naira DECIMAL(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "consult_earnings indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS consult_earnings_doctor_status_idx ON consult_earnings (doctor_email, status);
      CREATE INDEX IF NOT EXISTS consult_earnings_patient_created_idx ON consult_earnings (patient_id, created_at);
    `,
    continueOnError: true,
  },
  {
    desc: "consult_earning_releases table (monthly instalments)",
    sql: `CREATE TABLE IF NOT EXISTS consult_earning_releases (
      id TEXT PRIMARY KEY,
      doctor_email TEXT NOT NULL,
      earning_id TEXT NOT NULL,
      amount_naira DECIMAL(12,2) NOT NULL,
      period TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    // The unique key is what makes the monthly release run idempotent.
    desc: "consult_earning_releases indexes",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS consult_earning_releases_earning_period_key ON consult_earning_releases (earning_id, period);
      CREATE INDEX IF NOT EXISTS consult_earning_releases_doctor_period_idx ON consult_earning_releases (doctor_email, period);
    `,
    continueOnError: true,
  },
  {
    desc: "pharmacies table (partner pharmacies)",
    sql: `CREATE TABLE IF NOT EXISTS pharmacies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      code TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      discount_percent INTEGER NOT NULL DEFAULT 10,
      active BOOLEAN NOT NULL DEFAULT true,
      onboarded_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "pharmacies unique indexes",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_slug_key ON pharmacies (slug);
      CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_code_key ON pharmacies (code);
      CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_email_key ON pharmacies (email);
    `,
    continueOnError: true,
  },
  {
    desc: "pharmacy_otps & pharmacy_sessions tables",
    sql: `
      CREATE TABLE IF NOT EXISTS pharmacy_otps (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMP(3) NOT NULL,
        used BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP(3) NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pharmacy_otps_email_idx ON pharmacy_otps (email);
      CREATE TABLE IF NOT EXISTS pharmacy_sessions (
        id TEXT PRIMARY KEY,
        pharmacy_id TEXT NOT NULL,
        expires_at TIMESTAMP(3) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pharmacy_sessions_pharmacy_idx ON pharmacy_sessions (pharmacy_id);
    `,
    continueOnError: true,
  },
  {
    desc: "pharmacy_customers table (a pharmacy's regulars)",
    sql: `CREATE TABLE IF NOT EXISTS pharmacy_customers (
      id TEXT PRIMARY KEY,
      pharmacy_id TEXT NOT NULL,
      patient_id TEXT,
      full_name TEXT NOT NULL,
      phone TEXT,
      code TEXT,
      visits INTEGER NOT NULL DEFAULT 0,
      total_spend DECIMAL(12,2) NOT NULL DEFAULT 0,
      last_visit_at TIMESTAMP(3),
      notes TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now(),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "pharmacy_customers indexes",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_customers_pharmacy_patient_key ON pharmacy_customers (pharmacy_id, patient_id);
      CREATE INDEX IF NOT EXISTS pharmacy_customers_pharmacy_visit_idx ON pharmacy_customers (pharmacy_id, last_visit_at);
    `,
    continueOnError: true,
  },
  {
    desc: "consult_redemptions table (discounts given against a member code)",
    sql: `CREATE TABLE IF NOT EXISTS consult_redemptions (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      pharmacy_id TEXT,
      kind TEXT NOT NULL,
      description TEXT,
      gross_naira DECIMAL(12,2) NOT NULL,
      discount_naira DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT now()
    )`,
    continueOnError: true,
  },
  {
    desc: "consult_redemptions indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS consult_redemptions_patient_created_idx ON consult_redemptions (patient_id, created_at);
      CREATE INDEX IF NOT EXISTS consult_redemptions_pharmacy_created_idx ON consult_redemptions (pharmacy_id, created_at);
    `,
    continueOnError: true,
  },
  {
    // The care plan moved onto the patient portal's own identity: enrolment is
    // keyed on the patient's email, the code is only issued once they pay, and
    // the goal question was dropped.
    desc: "consult_patients: nullable code, consent, no goal",
    sql: `
      ALTER TABLE consult_patients ALTER COLUMN code DROP NOT NULL;
      ALTER TABLE consult_patients ADD COLUMN IF NOT EXISTS consent_at TIMESTAMP(3);
      ALTER TABLE consult_patients DROP COLUMN IF EXISTS goal;
      ALTER TABLE consult_patients DROP COLUMN IF EXISTS goal_metric;
      ALTER TABLE consult_patients ALTER COLUMN message_allowance SET DEFAULT 40;
    `,
    continueOnError: true,
  },
  {
    // Members sign in through the patient portal now, so the care plan has no
    // session table of its own.
    desc: "drop consult_patient_sessions (patient portal session is used)",
    sql: `DROP TABLE IF EXISTS consult_patient_sessions`,
    continueOnError: true,
  },
  {
    desc: "consult_settings: 40 messages a year by default",
    sql: `ALTER TABLE consult_settings ALTER COLUMN message_allowance SET DEFAULT 40`,
    continueOnError: true,
  },
  {
    desc: "consult_settings default row",
    sql: `INSERT INTO consult_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,
    continueOnError: true,
  },
];

let failed = false;

for (const { desc, sql, continueOnError } of migrations) {
  try {
    await execWithRetry(sql);
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    if (continueOnError) {
      // Expected failures (e.g., column already nullable) are ignored
      console.log(`  ✓ ${desc} (already applied or not needed)`);
    } else {
      console.error(`  ✗ ${desc}: ${err.message}`);
      failed = true;
    }
  }
}

await prisma.$disconnect();

if (failed) {
  process.exit(1);
}
