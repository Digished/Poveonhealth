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
  },
];

let failed = false;

for (const { desc, sql } of migrations) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}: ${err.message}`);
    failed = true;
  }
}

await prisma.$disconnect();

if (failed) {
  process.exit(1);
}
