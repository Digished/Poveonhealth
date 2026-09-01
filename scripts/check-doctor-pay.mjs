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
import { monthlyInstalment, isSettled, monthlyEstimate, yearlyCommitment, memberEconomics, monthsActive } from "./src/lib/doctor-pay";

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

console.log("\\n── does a member cover their own doctor? ──");
// The admin panel flags a member whose margin on drugs and tests has not
// reached the ₦500 a month their doctor is paid. The arithmetic has to be
// right at the edges: a member who joined this week must not read as a
// catastrophe, and one exactly at the line must not read as under it.
const DAY = 24 * 60 * 60 * 1000;
const asOf = new Date("2026-09-01T12:00:00Z");
const joined = (days) => new Date(asOf.getTime() - days * DAY);
/**
 * A join date that puts the member in exactly month m.
 *
 * "Months active" counts months *started*, because that is how many times the
 * doctor has been paid for them: someone who signed up this morning is in month
 * one and has already cost a fee.
 */
// Half a day inside the month, so floating-point division cannot land the
// boundary on the month before.
const inMonth = (m) => joined((m - 1) * 30.44 + 0.5);

function econ(medication, test, month) {
  return memberEconomics({
    medicationNaira: medication,
    testNaira: test,
    subscribedAt: inMonth(month),
    doctorMonthlyNaira: 500,
    now: asOf,
  });
}

const cases = [
  ["month 1, nothing bought",                econ(0, 0, 1),        0,    true],
  ["month 1, one ₦600 refill",               econ(600, 0, 1),      600,  false],
  ["month 6, ₦3,000 of margin",              econ(3000, 0, 6),     500,  false],
  ["month 6, ₦2,400 of margin",              econ(2400, 0, 6),     400,  true],
  ["month 6, ₦1,800 drugs + ₦1,200 tests",   econ(1800, 1200, 6),  500,  false],
  ["month 12, ₦12,000 of margin",            econ(12000, 0, 12),   1000, false],
  ["month 12, nothing at all",               econ(0, 0, 12),       0,    true],
];
for (const [name, e, wantPerMonth, wantFlagged] of cases) {
  const ok = e.marginPerMonth === wantPerMonth && e.belowDoctorFee === wantFlagged;
  if (!ok) failures++;
  console.log(
    (ok ? "ok   " : "FAIL ") + name.padEnd(40) +
    naira(e.marginPerMonth).padStart(8) + "/mo over " + String(e.monthsActive).padStart(2) + " months  " +
    (e.belowDoctorFee ? "flagged" : "covers it") +
    (ok ? "" : "   (wanted " + naira(wantPerMonth) + ", " + (wantFlagged ? "flagged" : "covers it") + ")")
  );
}

// Exactly at the line is covered, not flagged — a member who earns precisely
// their doctor's fee is not being carried by anyone.
const exact = econ(500, 0, 1);
check(!exact.belowDoctorFee, "exactly ₦500 a month is not flagged", naira(exact.marginPerMonth));
check(econ(499, 0, 1).belowDoctorFee, "₦499 a month is flagged");
// A brand-new member is in month one, never month zero — dividing by zero
// months would make every sign-up look infinitely unprofitable.
check(monthsActive(joined(0), asOf) === 1, "a member who joined today is in month 1");
check(monthsActive(joined(31), asOf) === 2, "31 days in is month 2");
check(monthsActive(null, asOf) === 1, "no join date is treated as month 1");
check(monthsActive(new Date(asOf.getTime() + 5 * DAY), asOf) === 1, "a future join date is month 1");
// Nothing is ever negative, whatever the data says.
const junk = memberEconomics({ medicationNaira: -900, testNaira: -100, subscribedAt: inMonth(3), doctorMonthlyNaira: 500, now: asOf });
check(junk.marginNaira === 0 && junk.marginPerMonth === 0, "negative margin clamps to zero");

if (failures) { console.error("\\n" + failures + " failure(s)."); process.exit(1); }
console.log("\\nEvery month a member stays is paid once, and no month more.");
`;

try {
  execFileSync("npx", ["tsx", "-e", script], { stdio: "inherit", cwd: process.cwd() });
} catch {
  process.exit(1);
}
