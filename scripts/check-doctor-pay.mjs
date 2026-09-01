#!/usr/bin/env node
/**
 * A doctor is paid ₦500 for each month a member stays. Prove it.
 *
 * This is somebody's income, released once a month against every live member,
 * so the failure modes are a doctor quietly underpaid for a year or the same
 * month paid twice. It is also where a wrong rule already cost real damage: a
 * guard insisting the doctor's share could not exceed the joining fee made the
 * price unchangeable once the fee became a one-off ₦2,500.
 *
 * The three things that must hold:
 *
 *   - a member who stays a year earns exactly twelve months, never thirteen;
 *   - a member who leaves in month four earns four, and nothing after;
 *   - entitlements opened on the old lump-sum terms keep paying what they
 *     promised, whatever the rate is set to today.
 *
 *   node scripts/check-doctor-pay.mjs
 */
import { execFileSync } from "node:child_process";

const script = `
import { monthlyInstalment, isSettled, monthlyEstimate, yearlyCommitment } from "./src/lib/doctor-pay";

let failures = 0;
const naira = (n) => "₦" + Math.round(n).toLocaleString("en-NG");
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label.padEnd(44) + detail);
};

/** Run an entitlement forward, month by month, exactly as the release does. */
function runMonths(entitlement, months, leavesAfter = Infinity) {
  const paid = [];
  let released = 0;
  for (let m = 1; m <= months; m++) {
    if (m > leavesAfter) break;                       // member gone; entitlement closed
    const e = { ...entitlement, releasedNaira: released };
    if (isSettled(e)) break;
    const instalment = monthlyInstalment(e, 12);
    if (instalment <= 0) break;
    released += instalment;
    paid.push(instalment);
  }
  return { paid, total: released };
}

console.log("── ₦500 a month, for as long as they stay ──");
const current = { monthlyNaira: 500, totalNaira: yearlyCommitment(500, 12), releasedNaira: 0 };

const year = runMonths(current, 24);
check(
  year.total === 6000 && year.paid.length === 12 && year.paid.every((p) => p === 500),
  "a full year pays 12 x ₦500",
  naira(year.total) + " over " + year.paid.length + " months"
);

const left = runMonths(current, 24, 4);
check(left.total === 2000 && left.paid.length === 4, "leaving in month 4 pays 4 months", naira(left.total));

const oneMonth = runMonths(current, 24, 1);
check(oneMonth.total === 500, "leaving in month 1 pays one month", naira(oneMonth.total));

const never = runMonths(current, 24, 0);
check(never.total === 0, "a member who never starts pays nothing", naira(never.total));

console.log("\\n── the ceiling holds ──");
check(
  runMonths(current, 60).total === 6000,
  "60 months of releases still pays only a year",
  naira(runMonths(current, 60).total)
);
check(
  monthlyInstalment({ monthlyNaira: 500, totalNaira: 6000, releasedNaira: 6000 }, 12) === 0,
  "a settled entitlement pays nothing more"
);
check(
  monthlyInstalment({ monthlyNaira: 500, totalNaira: 6000, releasedNaira: 5800 }, 12) === 200,
  "the last instalment is only what is left",
  naira(monthlyInstalment({ monthlyNaira: 500, totalNaira: 6000, releasedNaira: 5800 }, 12))
);
// Money already released is the doctor's, whatever a later correction says.
check(
  monthlyInstalment({ monthlyNaira: 500, totalNaira: 1000, releasedNaira: 4000 }, 12) === 0,
  "an over-released entitlement never claws back"
);

console.log("\\n── the old lump-sum terms are honoured ──");
// Opened when a doctor's whole year was committed at activation. Those rows
// carry no rate, and must keep paying a twelfth of what they promised even
// though the rate today is different.
const legacy = { monthlyNaira: null, totalNaira: 6000, releasedNaira: 0 };
const legacyRun = runMonths(legacy, 24);
check(
  legacyRun.total === 6000 && legacyRun.paid.length === 12,
  "a legacy ₦6,000 entitlement still pays 12 x ₦500",
  naira(legacyRun.total)
);
const oddLegacy = runMonths({ monthlyNaira: null, totalNaira: 10000, releasedNaira: 0 }, 24);
check(
  oddLegacy.total === 10000,
  "a legacy ₦10,000 entitlement pays out exactly",
  naira(oddLegacy.total) + " over " + oddLegacy.paid.length + " months"
);

console.log("\\n── what a doctor expects next month ──");
for (const [members, rate, want] of [[0, 500, 0], [1, 500, 500], [40, 500, 20000], [37, 750, 27750]]) {
  const got = monthlyEstimate(members, rate);
  check(got === want, members + " members x " + naira(rate), naira(got));
}

console.log("\\n── the joining fee does not cap it ──");
// The rule that broke the admin form. A year of doctor pay is meant to exceed
// what a member paid to join; the difference is funded by medication margin.
const joiningFee = 2500;
const yearOfPay = yearlyCommitment(500, 12);
check(
  yearOfPay > joiningFee,
  "a year of pay may exceed the joining fee",
  naira(yearOfPay) + " of pay against " + naira(joiningFee) + " joined"
);

if (failures) { console.error("\\n" + failures + " failure(s)."); process.exit(1); }
console.log("\\nEvery month a member stays is paid once, and no month more.");
`;

try {
  execFileSync("npx", ["tsx", "-e", script], { stdio: "inherit", cwd: process.cwd() });
} catch {
  process.exit(1);
}
