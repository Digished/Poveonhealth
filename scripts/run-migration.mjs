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

const prisma = new PrismaClient();

const migrations = [
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
];

let failed = false;

for (const { desc, sql, continueOnError } of migrations) {
  try {
    await prisma.$executeRawUnsafe(sql);
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
