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
const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  directUrl ? { datasources: { db: { url: directUrl } } } : undefined
);

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
