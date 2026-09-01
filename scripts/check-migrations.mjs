#!/usr/bin/env node
/**
 * Every migration step must be something the runner can actually execute.
 *
 * `prisma.$executeRawUnsafe` goes through the extended query protocol, which
 * accepts exactly one command. A step written as a CREATE TABLE followed by its
 * indexes is refused whole — "cannot insert multiple commands into a prepared
 * statement" — and because such steps carry `continueOnError`, the build
 * printed a tick and moved on. `lab_departments` was missing from production
 * for exactly this reason while the deploy log said it had been applied, and
 * ten steps were in that state.
 *
 * The runner now splits each step into statements. This checks that the
 * splitter is right about every step in the file, and that nobody puts the
 * blob back.
 *
 *   node scripts/check-migrations.mjs
 */
import { readFileSync } from "node:fs";

const src = readFileSync("scripts/run-migration.mjs", "utf8");
let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label + (detail ? `  ${detail}` : ""));
};

// ── The splitter, taken from the runner itself ──────────────────────────────
// Read out of the file rather than imported, because the runner connects to a
// database the moment it is loaded.
const fnStart = src.indexOf("function splitStatements");
const fnEnd = src.indexOf("async function execOne");
check(fnStart > 0 && fnEnd > fnStart, "the runner still splits statements");
if (failures) { console.error("\nThe runner no longer splits steps into statements."); process.exit(1); }

// eslint-disable-next-line no-eval
const splitStatements = eval(`(${src.slice(fnStart, fnEnd).replace(/^function splitStatements/, "function")})`);

console.log("\n── the splitter ──");
const cases = [
  ["one statement", "ALTER TABLE a ADD COLUMN b TEXT", 1],
  ["trailing semicolon", "ALTER TABLE a ADD COLUMN b TEXT;", 1],
  ["a table and its indexes", "CREATE TABLE x (id TEXT);\nCREATE INDEX i ON x(id);\nCREATE INDEX j ON x(id);", 3],
  ["a DO block is one command", "DO $$ BEGIN\n  ALTER TABLE a ADD COLUMN b TEXT;\n  ALTER TABLE a ADD COLUMN c TEXT;\nEND $$;", 1],
  ["a semicolon inside a string", "INSERT INTO t VALUES ('a;b');", 1],
  ["an escaped quote", "INSERT INTO t VALUES ('it''s; fine');", 1],
  ["a semicolon in a comment", "ALTER TABLE a ADD COLUMN b TEXT; -- a; comment\nALTER TABLE a ADD COLUMN c TEXT;", 2],
  ["nothing but whitespace", "   \n  ", 0],
  ["nothing but a comment", "-- just a note", 0],
];
for (const [name, sql, want] of cases) {
  const got = splitStatements(sql).length;
  check(got === want, name, `${got} statement(s), wanted ${want}`);
}

// ── Every step in the file ──────────────────────────────────────────────────
console.log("\n── every step in the file ──");
const steps = [...src.matchAll(/desc:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'),\s*\n\s*sql:\s*`([\s\S]*?)`,/g)]
  .map((m) => ({ desc: m[1].slice(1, -1), sql: m[2] }));

check(steps.length > 200, "steps were parsed", `${steps.length} found`);

let multi = 0;
const broken = [];
for (const step of steps) {
  const statements = splitStatements(step.sql);
  if (statements.length === 0) { broken.push(`${step.desc}: splits to nothing`); continue; }
  if (statements.length > 1) multi++;
  for (const stmt of statements) {
    const bare = stmt.replace(/--[^\n]*/g, "").trim();
    // Every statement has to start with something Postgres recognises. A
    // fragment starting with a column name is a split gone wrong.
    if (!/^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|DO|COMMENT|GRANT|SET|TRUNCATE|WITH|SELECT|REINDEX)\b/i.test(bare)) {
      broken.push(`${step.desc}: a statement starts "${bare.slice(0, 46)}"`);
    }
  }
}
check(broken.length === 0, "every statement is a whole command", broken.slice(0, 4).join(" | "));
console.log(`     ${multi} step(s) hold more than one statement — all of which used to do nothing at all`);

// ── The specific table that broke ───────────────────────────────────────────
console.log("\n── the table that went missing ──");
const labDepts = steps.filter((s) => /CREATE TABLE IF NOT EXISTS lab_departments/i.test(s.sql));
check(labDepts.length > 0, "lab_departments is created by a step");
for (const s of labDepts) {
  const statements = splitStatements(s.sql);
  check(
    statements.length >= 1 && /CREATE TABLE IF NOT EXISTS lab_departments/i.test(statements[0]),
    "its CREATE TABLE is a statement of its own",
    `${statements.length} statement(s) in that step`
  );
}

if (failures) { console.error(`\n${failures} failure(s).`); process.exit(1); }
console.log("\nEvery step splits into commands Postgres will accept.");
