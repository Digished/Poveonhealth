#!/usr/bin/env node
/**
 * Catches a Json column being indexed straight off a Prisma row.
 *
 * `tsc` cannot see this here: without a generated Prisma client every model
 * field is untyped, so `lab.phones[0]` type-checks locally and fails only on
 * the build machine, where `phones` is `Prisma.JsonValue`. That is exactly how
 * `l.phones?.[0]` reached a deploy.
 *
 * Scope matters more than reach. Client components hold their own types for API
 * responses and are free to declare `phones: string[]`; flagging those buries
 * the one real hit in dozens of false ones. So this looks only where a Prisma
 * row is in hand: a file that selects a Json column in a query and then indexes
 * that same name.
 *
 * Run: node scripts/check-json-columns.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const jsonColumns = new Set(
  [...schema.matchAll(/^\s*(\w+)\s+Json/gm)].map((m) => m[1])
);

/** Helpers that already normalise a Json value are the fix, not the problem. */
const SAFE = /parsePhones|JSON\.parse|Array\.isArray|as unknown|as string\[\]|satisfies/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const findings = [];
for (const file of walk("src")) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("prisma.")) continue;

  // Which Json columns does this file actually pull out of the database?
  const selected = new Set();
  for (const col of jsonColumns) {
    if (new RegExp(`\\b${col}:\\s*true\\b`).test(text)) selected.add(col);
  }
  // A query with no `select` returns every column, so all of them are in play.
  const wideOpen = /prisma\.\w+\.find\w*\(\{\s*where[^}]*\}\s*\)/.test(text);
  if (selected.size === 0 && !wideOpen) continue;

  const inPlay = selected.size ? selected : jsonColumns;

  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (SAFE.test(line) || t.startsWith("//") || t.startsWith("*")) return;
    for (const col of inPlay) {
      const bad = new RegExp(`\\.${col}\\s*\\??\\.?\\[\\s*\\d`);
      if (bad.test(line)) findings.push(`${file}:${i + 1}  ${t.slice(0, 100)}`);
    }
  });
}

if (findings.length) {
  console.error(`\nJson column indexed off a Prisma row (${findings.length}):\n`);
  for (const f of findings) console.error("  " + f);
  console.error(
    "\nOn the build machine that value is Prisma.JsonValue and indexing it fails." +
      "\nNormalise it first — parsePhones, or a parse of your own.\n"
  );
  process.exit(1);
}
console.log("Json columns: no direct indexing off a Prisma row.");
