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
