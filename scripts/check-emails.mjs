#!/usr/bin/env node
/**
 * An email that tells a member to go somewhere has to say where.
 *
 * "Book these tests" and "collect this medication" are not instructions anyone
 * can act on without an address, and a member who has chosen a pharmacy and a
 * lab has already told us which. These templates are pure functions, so what
 * they produce can be read back directly.
 *
 * Also checks the escaping, because partner names and addresses are typed by
 * admins and pharmacists and go straight into HTML.
 *
 *   node scripts/check-emails.mjs
 */
import { execFileSync } from "node:child_process";

const script = `
import { carePlanScheduleEmail, carePlanWelcomeEmail } from "./src/lib/email/templates";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label.padEnd(52) + detail);
};

const PHARMACY = {
  name: "HealthPlus Pharmacy",
  address: "24 Obafemi Awolowo Way",
  city: "Ikeja",
  state: "Lagos",
  phone: "0809 988 7766",
};
const LAB = {
  name: "Synlab Maryland",
  address: "1 Mobolaji Bank Anthony Way",
  city: "Maryland",
  state: "Lagos",
  phone: "0701 234 5678",
};

const schedule = (over = {}) =>
  carePlanScheduleEmail({
    memberName: "Adaeze", doctorName: "Dr Chidinma Eze",
    tests: [{ summary: "HbA1c", due: "by 15 Sept 2026" }],
    medications: ["Amlodipine 10mg, once daily"],
    planItems: [], planNote: null, message: null,
    pharmacy: PHARMACY, lab: LAB,
    dashboardUrl: "https://poveon.com/dashboard",
    ...over,
  });

console.log("── the update a doctor sends ──");
{
  const html = schedule();
  check(html.includes("HealthPlus Pharmacy"), "names the pharmacy");
  check(html.includes("24 Obafemi Awolowo Way, Ikeja, Lagos"), "gives the pharmacy address");
  check(html.includes("0809 988 7766"), "gives the pharmacy phone");
  check(html.includes("tel:08099887766"), "the phone is dialable", "tel: link, punctuation stripped");
  check(html.includes("Synlab Maryland"), "names the lab");
  check(html.includes("1 Mobolaji Bank Anthony Way, Maryland, Lagos"), "gives the lab address");
  check(html.indexOf("Synlab") < html.indexOf("HealthPlus"), "the lab sits under the tests, the pharmacy under the medication");
}

console.log("\\n── only where it is relevant ──");
{
  // No medication scheduled: naming a pharmacy would be noise.
  const noMeds = schedule({ medications: [] });
  check(!noMeds.includes("HealthPlus"), "no medication, no pharmacy block");
  check(noMeds.includes("Synlab"), "tests still name the lab");

  const noTests = schedule({ tests: [] });
  check(!noTests.includes("Synlab"), "no tests, no lab block");
  check(noTests.includes("HealthPlus"), "medication still names the pharmacy");

  // A member who chose nobody gets no empty boxes.
  const none = schedule({ pharmacy: null, lab: null });
  check(!none.includes("Collect from") && !none.includes("Have them done at"), "no partner chosen, no block at all");
}

console.log("\\n── what is missing is left out, not shown blank ──");
{
  const sparse = schedule({ pharmacy: { name: "Corner Chemist" }, lab: null });
  check(sparse.includes("Corner Chemist"), "a name on its own is enough");
  check(!/,\\s*<\\/p>/.test(sparse), "no stray commas from missing address parts");
  const cityOnly = schedule({ pharmacy: { name: "Corner Chemist", city: "Yaba" }, lab: null });
  check(cityOnly.includes(">Yaba<"), "a city with no street still shows", "no leading comma");
}

console.log("\\n── the welcome ──");
{
  const html = carePlanWelcomeEmail({
    memberName: "Adaeze", code: "PVC-8X4K29", doctorName: "Dr Chidinma Eze",
    messageAllowance: 40, expiresOn: "1 September 2027",
    labDiscount: 15, pharmacyDiscount: 10,
    pharmacy: PHARMACY, lab: LAB,
    dashboardUrl: "https://poveon.com/dashboard",
  });
  check(html.includes("Your pharmacy"), "names their pharmacy");
  check(html.includes("Your laboratory"), "names their laboratory");
  check(html.includes("0701 234 5678"), "with the lab's phone");
}

console.log("\\n── names typed by people go into HTML ──");
{
  const nasty = schedule({
    pharmacy: { name: '<script>alert(1)</script> & Sons', address: '5 "Main" St', phone: "080<b>" },
    lab: null,
  });
  check(!nasty.includes("<script>"), "a script tag in a name is escaped");
  check(nasty.includes("&lt;script&gt;"), "and shown as text");
  check(nasty.includes("&amp; Sons"), "an ampersand is escaped");
  check(!nasty.includes('"Main"') || nasty.includes("&quot;Main&quot;"), "quotes in an address are escaped");
}

if (failures) { console.error("\\n" + failures + " failure(s)."); process.exit(1); }
console.log("\\nEvery email that sends someone somewhere says where, and only when it should.");
`;

try {
  execFileSync("npx", ["tsx", "-e", script], { stdio: "inherit", cwd: process.cwd() });
} catch {
  process.exit(1);
}
