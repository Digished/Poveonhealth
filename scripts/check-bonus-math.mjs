#!/usr/bin/env node
/**
 * The doctor bonus pool must split to the last kobo.
 *
 * Rounding each share independently loses or invents money — three doctors
 * splitting ₦100 by equal weight get ₦33.33 each and the pool is a kobo short,
 * every month, for ever. `allocate` uses the largest-remainder method so the
 * parts always sum to the whole; this proves it, including over random pools,
 * because "it looked right in the one example I tried" is how that bug ships.
 *
 *   node scripts/check-bonus-math.mjs
 */
import { execFileSync } from "node:child_process";

const script = `
import { allocate, periodOf, periodRange, periodsBack } from "./src/lib/doctor-bonus-math";

const k = (n) => "₦" + (n / 100).toFixed(2);
let failures = 0;

function check(name, totalKobo, weights) {
  const parts = allocate(totalKobo, weights);
  const sum = parts.reduce((a, b) => a + b, 0);
  const sumW = weights.reduce((a, b) => a + Math.max(0, Math.round(b)), 0);
  const expect = sumW > 0 ? Math.round(Math.max(0, totalKobo)) : 0;

  const exact = sum === expect;
  const nonNeg = parts.every((p) => p >= 0);
  // Nobody with more weight may receive less than someone with less weight.
  let monotone = true;
  for (let i = 0; i < weights.length; i++)
    for (let j = 0; j < weights.length; j++)
      if (weights[i] > weights[j] && parts[i] < parts[j]) monotone = false;

  const ok = exact && nonNeg && monotone;
  if (!ok) failures++;
  console.log(
    (ok ? "ok   " : "FAIL ") + name.padEnd(32) +
    " pool=" + k(Math.max(0, totalKobo)).padStart(11) +
    " -> [" + parts.map(k).join(", ") + "] sum=" + k(sum)
  );
  if (!exact) console.log("       ! parts sum to " + sum + " kobo, pool is " + expect);
  if (!nonNeg) console.log("       ! a negative share");
  if (!monotone) console.log("       ! a larger weight received less");
}

console.log("── the rounding trap ──");
check("3 equal doctors, ₦100", 10000, [1, 1, 1]);
check("3 equal doctors, ₦1000", 100000, [1, 1, 1]);
check("7 equal doctors, ₦1", 100, [1, 1, 1, 1, 1, 1, 1]);

console.log("\\n── realistic months ──");
check("uneven messaging", 500000, [412, 233, 190, 91, 44, 12]);
check("one doctor carries it", 500000, [900, 1, 1]);
check("two doctors, 2:1", 100001, [200, 100]);

console.log("\\n── degenerate ──");
check("nobody messaged", 500000, []);
check("all weights zero", 500000, [0, 0, 0]);
check("empty pool", 0, [5, 3, 1]);
check("single doctor", 123456, [7]);
check("negative weight clamped", 100000, [10, -5, 5]);

console.log("\\n── 2000 random pools ──");
let worst = 0, monotone = true;
for (let t = 0; t < 2000; t++) {
  const n = 1 + Math.floor(Math.random() * 12);
  const w = Array.from({ length: n }, () => Math.floor(Math.random() * 500));
  const pool = Math.floor(Math.random() * 500000);
  const parts = allocate(pool, w);
  const sumW = w.reduce((a, b) => a + b, 0);
  worst = Math.max(worst, Math.abs(parts.reduce((a, b) => a + b, 0) - (sumW > 0 ? pool : 0)));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (w[i] > w[j] && parts[i] < parts[j]) monotone = false;
}
console.log("  worst drift: " + worst + " kobo   monotone: " + monotone);
if (worst !== 0 || !monotone) failures++;

console.log("\\n── periods ──");
const feb = periodRange("2026-02");
const ok1 = periodOf(new Date(Date.UTC(2026, 7, 31))) === "2026-08";
const ok2 = feb.end.toISOString().slice(0, 10) === "2026-03-01"; // leap-year safe
const ok3 = periodsBack(3, new Date(Date.UTC(2026, 0, 15))).join(",") === "2026-01,2025-12,2025-11";
console.log("  periodOf " + (ok1 ? "ok" : "FAIL") + "   February range " + (ok2 ? "ok" : "FAIL") + "   year rollover " + (ok3 ? "ok" : "FAIL"));
if (!ok1 || !ok2 || !ok3) failures++;

if (failures) { console.error("\\n" + failures + " failure(s)."); process.exit(1); }
console.log("\\nEvery pool splits exactly; no kobo lost or invented.");
`;

try {
  execFileSync("npx", ["tsx", "-e", script], { stdio: "inherit", cwd: process.cwd() });
} catch {
  process.exit(1);
}
