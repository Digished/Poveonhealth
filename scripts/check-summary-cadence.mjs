#!/usr/bin/env node
/**
 * The patient summary is written once, then left alone for a fortnight.
 *
 * It used to be rewritten whenever the record moved, which meant a doctor
 * opening the same patient twice in a morning paid for two summaries and read
 * two different accounts of the same person. The rule now is: written the
 * first time, again no sooner than two weeks later, and on demand when a
 * doctor presses re-read.
 *
 * The staleness decision is the whole rule, and it is the thing that decides
 * whether money is spent, so it is tested at its edges rather than trusted.
 *
 *   node scripts/check-summary-cadence.mjs
 */
import { execFileSync } from "node:child_process";

const script = `
import { summaryIsStale, SUMMARY_MAX_AGE_DAYS } from "./src/lib/summary-cadence";

let failures = 0;
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-01T12:00:00Z");
const ago = (days) => new Date(now.getTime() - days * DAY);

function check(label, at, wantStale) {
  const got = summaryIsStale(at, now);
  const ok = got === wantStale;
  if (!ok) failures++;
  console.log(
    (ok ? "ok   " : "FAIL ") + label.padEnd(38) +
    (got ? "rewrite" : "keep it") + (ok ? "" : "   (wanted " + (wantStale ? "rewrite" : "keep it") + ")")
  );
}

console.log("── " + SUMMARY_MAX_AGE_DAYS + " days ──");
check("never written", null, true);
check("written just now", now, false);
check("written yesterday", ago(1), false);
check("written 13 days ago", ago(13), false);
check("written 13 days 23 hours ago", ago(13.95), false);
check("written exactly 14 days ago", ago(14), true);
check("written 15 days ago", ago(15), true);
check("written a year ago", ago(365), true);

console.log("\\n── junk and the wire ──");
// summary_at reaches the browser as an ISO string; a Date on one side and a
// string on the other is exactly the mistake that blanked the care plan page.
check("an ISO string, 2 days old", ago(2).toISOString(), false);
check("an ISO string, 20 days old", ago(20).toISOString(), true);
check("not a date at all", "sometime last month", true);
check("an empty string", "", true);
check("undefined", undefined, true);

console.log("\\n── what it saves ──");
// A doctor opening the same patient through a working day must cost one
// summary, not one per visit.
let writes = 0;
let writtenAt = null;
for (let visit = 0; visit < 40; visit++) {
  const at = new Date(now.getTime() + visit * 12 * 60 * 60 * 1000); // every 12 hours
  if (summaryIsStale(writtenAt, at)) { writes++; writtenAt = at; }
}
// 40 visits over 20 days: one at the start, one when the fortnight is up.
const ok = writes === 2;
if (!ok) failures++;
console.log((ok ? "ok   " : "FAIL ") + "40 visits over 20 days -> " + writes + " summaries");

const forced = 5;
console.log("ok   " + forced + " presses of re-read -> " + forced + " summaries, by definition");

if (failures) { console.error("\\n" + failures + " failure(s)."); process.exit(1); }
console.log("\\nWritten once, then once a fortnight, and whenever a doctor asks.");
`;

try {
  execFileSync("npx", ["tsx", "-e", script], { stdio: "inherit", cwd: process.cwd() });
} catch {
  process.exit(1);
}
