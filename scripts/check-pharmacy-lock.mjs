#!/usr/bin/env node
/**
 * A pharmacy choice settles for exactly 30 days — not 29, not 31.
 *
 * The boundary is the whole rule: a member refused on the day they should be
 * free will think the app is broken, and one let through a day early breaks
 * the promise the pharmacy stocked against. Dates are also where off-by-one
 * errors hide, so the edges are tested rather than the middle.
 *
 *   node scripts/check-pharmacy-lock.mjs
 */
import { execFileSync } from "node:child_process";

const script = `
import { pharmacyLock, lockMessage, PHARMACY_LOCK_DAYS } from "./src/lib/pharmacy-lock";

let failures = 0;
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-01T12:00:00Z");
const ago = (days) => new Date(now.getTime() - days * DAY);

function check(name, setAt, wantLocked, wantDaysLeft) {
  const lock = pharmacyLock(setAt, now);
  const ok = lock.locked === wantLocked && lock.daysLeft === wantDaysLeft;
  if (!ok) failures++;
  console.log(
    (ok ? "ok   " : "FAIL ") + name.padEnd(34) +
    "locked=" + String(lock.locked).padEnd(6) +
    "daysLeft=" + String(lock.daysLeft).padEnd(4) +
    (ok ? "" : "  (wanted locked=" + wantLocked + " daysLeft=" + wantDaysLeft + ")")
  );
}

console.log("── the boundary ──");
check("never chosen", null, false, 0);
check("chosen just now", now, true, PHARMACY_LOCK_DAYS);
check("chosen 1 day ago", ago(1), true, 29);
check("chosen 29 days ago", ago(29), true, 1);
check("chosen 29.5 days ago", ago(29.5), true, 1);
check("chosen exactly 30 days ago", ago(30), false, 0);
check("chosen 31 days ago", ago(31), false, 0);
check("chosen a year ago", ago(365), false, 0);

console.log("\\n── junk in ──");
check("empty string", "", false, 0);
check("not a date", "sometime last week", false, 0);
check("undefined", undefined, false, 0);
// A clock skew that puts the choice in the future must not lock for ever.
const future = pharmacyLock(new Date(now.getTime() + 5 * DAY), now);
const okFuture = future.locked && future.daysLeft === 35;
if (!okFuture) failures++;
console.log((okFuture ? "ok   " : "FAIL ") + "chosen in the future".padEnd(34) + "daysLeft=" + future.daysLeft);

console.log("\\n── what the member reads ──");
const msg = lockMessage(pharmacyLock(ago(28), now), "HealthPlus Ikeja");
const okMsg = msg.includes("HealthPlus Ikeja") && msg.includes("in 2 days") && msg.includes("September 2026");
if (!okMsg) failures++;
console.log((okMsg ? "ok   " : "FAIL ") + msg);
const tomorrow = lockMessage(pharmacyLock(ago(29), now), "HealthPlus Ikeja");
const okTomorrow = tomorrow.includes("tomorrow") && !tomorrow.includes("in 1 days");
if (!okTomorrow) failures++;
console.log((okTomorrow ? "ok   " : "FAIL ") + tomorrow);
const free = lockMessage(pharmacyLock(ago(40), now), "HealthPlus Ikeja");
const okFree = free === "";
if (!okFree) failures++;
console.log((okFree ? "ok   " : "FAIL ") + "nothing to say once it is free: " + JSON.stringify(free));

if (failures) { console.error("\\n" + failures + " failure(s)."); process.exit(1); }
console.log("\\nThe lock holds for 30 days and lets go on the 30th.");
`;

try {
  execFileSync("npx", ["tsx", "-e", script], { stdio: "inherit", cwd: process.cwd() });
} catch {
  process.exit(1);
}
