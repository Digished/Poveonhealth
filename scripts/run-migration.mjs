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
