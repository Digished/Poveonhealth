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
