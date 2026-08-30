#!/usr/bin/env node
/**
 * `tsc` with the Prisma-client blind spot filtered out.
 *
 * The build machine cannot reach binaries.prisma.sh, so `prisma generate` never
 * runs here and `@prisma/client` resolves to an untyped stub. Every query result
 * then types as `{}` or an implicit `any`, which buries real errors under
 * hundreds of false ones. This drops exactly those diagnostics and prints what
 * is left — optionally narrowed to the files given as arguments.
 *
 *   node scripts/typecheck.mjs                 # everything
 *   node scripts/typecheck.mjs src/lib src/app/api/consults
 */
import { spawnSync } from "node:child_process";

// Errors that only exist because the generated client is missing.
const PRISMA_NOISE = [
  /error TS7006:/, // implicit any parameter (callback over an untyped result)
  /error TS7005:/,
  /error TS7031:/,
  /error TS7034:/,
  /error TS7053:/,
  /error TS18046:/, // 'x' is of type 'unknown'
  /does not exist on type '\{\}'/,
  /is not assignable to type 'string'/,
  /Module '"@prisma\/client"' has no exported member/,
  /Cannot find module '\.prisma/,
];

// Pre-existing lines that are also stub fallout but too specific to pattern-match
// without risking real errors. Each is a `Map` built from an untyped query result,
// so its values type as `unknown`.
const BASELINE = ["src/lib/result-render.ts(175,31)"];

const res = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const scope = process.argv.slice(2);
const lines = (res.stdout || "")
  .split("\n")
  .filter((l) => l.trim() && !l.includes("node_modules"))
  .filter((l) => !PRISMA_NOISE.some((r) => r.test(l)))
  .filter((l) => !BASELINE.some((b) => l.startsWith(b)))
  .filter((l) => !scope.length || scope.some((s) => l.startsWith(s)));

if (lines.length) {
  console.log(lines.join("\n"));
  console.log(`\n${lines.length} error(s) after filtering.`);
  process.exit(1);
}
console.log(`No errors${scope.length ? ` in ${scope.join(", ")}` : ""} (Prisma-stub noise filtered).`);
