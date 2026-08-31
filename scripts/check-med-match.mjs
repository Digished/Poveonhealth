#!/usr/bin/env node
/**
 * A prescription and a price list must recognise each other.
 *
 * The two sides are written by different people in different shapes — the
 * strength lands in the name, or a column, or the dosage field — so this pits
 * realistic doctor lines against realistic pharmacy rows and asserts both what
 * must match and, just as importantly, what must NOT: 5mg is not 10mg, and
 * metformin is not metoprolol.
 *
 *   node scripts/check-med-match.mjs
 */
import { execFileSync } from "node:child_process";

const script = `
import { parsePrescriptionLine } from "./src/lib/prescription-parse";
import { buildMedIndex, identify, matchMedication, normaliseStrength, normaliseForm } from "./src/lib/med-match";
import { medKey, parseMedSheet, MED_SHEET_TEMPLATE } from "./src/lib/med-sheet";
import * as xlsx from "xlsx";

let failures = 0;
const fail = (msg) => { failures++; console.log("FAIL " + msg); };

// A price list as three different pharmacists would actually upload it.
const shelf = [
  { id: "a10", name: "Amlodipine", strength: "10mg", form: "tablet" },
  { id: "a5",  name: "Amlodipine", strength: "5mg",  form: "tablet" },
  { id: "met", name: "METFORMIN 500 MG TABS", strength: null, form: null },
  { id: "lis", name: "Lisinopril Tablets", strength: "5 mg", form: null },
  { id: "los", name: "Losartan Potassium", strength: "50mg", form: "tablet" },
  { id: "ins", name: "Insulin Glargine", strength: "100IU/ml", form: "injection" },
  { id: "atv", name: "Atorvastatin", strength: "20mg", form: "tablet" },
  { id: "hct", name: "Hydrochlorothiazide", strength: null, form: "tablet" },
];
const index = buildMedIndex(shelf);

function fromDoctor(line) {
  const p = parsePrescriptionLine(line);
  if (!p) return null;
  return identify({ name: p.medication, dosage: p.dosage, form: p.form });
}

console.log("── what a doctor types ──");
const cases = [
  ["tabs amlodipine 10mg daily x 1/12",            "a10"],
  ["tab amlodipine 5mg od",                        "a5"],
  ["tabs metformin 500mg bd x 1/12",               "met"],
  ["lisinopril 5mg daily",                         "lis"],
  ["tabs losartan 50mg nocte",                     "los"],
  ["inj insulin glargine 100iu/ml nocte",          "ins"],
  ["tabs atorvastatin 20mg nocte x 3/12",          "atv"],
  ["tabs hydrochlorothiazide 25mg mane",           "hct"],  // shop states no strength
  ["Amlodipine 10 mg tablets once daily",          "a10"],
];
for (const [line, want] of cases) {
  const id = fromDoctor(line);
  if (!id) { fail(line + " -> the parser read nothing"); continue; }
  const m = matchMedication(index, id);
  const got = m.row ? m.row.id : m.how;
  const ok = got === want;
  if (!ok) failures++;
  console.log(
    (ok ? "ok   " : "FAIL ") + line.padEnd(40) +
    " name=" + id.name.padEnd(22) + " strength=" + String(id.strength).padEnd(9) +
    " -> " + got + (ok ? "" : "   (wanted " + want + ")")
  );
}

console.log("\\n── what must never match ──");
const refuse = [
  ["tabs amlodipine 2.5mg daily", "strength_differs", "a strength the shop does not stock"],
  ["tabs metoprolol 50mg bd",     "none",             "a different drug with a similar name"],
  ["tabs amlodipine daily",       "ambiguous",        "no strength, and the shop has two"],
  ["tabs paracetamol 500mg prn",  "none",             "not on the price list at all"],
];
for (const [line, want, why] of refuse) {
  const id = fromDoctor(line);
  const m = matchMedication(index, id);
  const got = m.row ? "MATCHED " + m.row.id : m.how;
  const ok = got === want;
  if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + line.padEnd(32) + " -> " + got.padEnd(18) + why);
}

console.log("\\n── the same drug, written every way ──");
// Every one of these is Amlodipine 10mg tablets and must reach one identity.
const spellings = [
  { name: "Amlodipine 10mg", strength: null, form: "tablet" },
  { name: "Amlodipine", strength: "10mg", form: "tablet" },
  { name: "AMLODIPINE 10 MG TABS", strength: null, form: null },
  { name: "amlodipine  10.0mg  tablets", strength: null, form: null },
  { name: "Amlodipine", strength: "10 MG", form: "Tabs" },
];
const ids = spellings.map((s) => identify(s));
const same = ids.every((i) => i.name === ids[0].name && i.strength === ids[0].strength && i.form === ids[0].form);
console.log((same ? "ok   " : "FAIL ") + "5 spellings -> " + JSON.stringify(ids[0]));
if (!same) { failures++; ids.forEach((i, n) => console.log("       " + n + " " + JSON.stringify(i))); }

console.log("\\n── strengths and forms ──");
const units = [
  ["10mg", "10mg"], ["10 MG", "10mg"], ["0.50mg", "0.5mg"], ["010mg", "10mg"],
  ["100IU/ml", null], ["5/10mg", "5/10mg"], ["1 tablet", null], ["as directed", null],
  ["500 mcg", "500mcg"], ["500µg", "500mcg"], ["0.05%", "0.05%"],
];
for (const [raw, want] of units) {
  // 100IU/ml is a concentration; the regex reads the leading strength.
  const got = normaliseStrength(raw);
  const expect = raw === "100IU/ml" ? "100iu" : want;
  const ok = got === expect;
  if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + String(raw).padEnd(14) + " -> " + String(got) + (ok ? "" : "  (wanted " + expect + ")"));
}
for (const [raw, want] of [["TABS","tablet"],["Tablets","tablet"],["caps","capsule"],["syr","syrup"],["nonsense",null]]) {
  const got = normaliseForm(raw);
  const ok = got === want;
  if (!ok) { failures++; console.log("FAIL form " + raw + " -> " + got); }
}

console.log("\\n── end to end: a real sheet, a real prescription ──");
// A price list as a pharmacist actually sends it — naira signs, a percentage
// discount column, the strength inside the name on one row and in its own
// column on another — parsed by the importer and then matched against what a
// doctor typed. This is the whole chain; the earlier blocks test its halves.
const csv = [
  "Drug,Strength,Type,Price,Discount %,Available",
  'Amlodipine 10mg,,Tabs,"\u20a62,000",15,yes',
  'Metformin,500mg,tablet,"\u20a61,500",10,yes',
  'LISINOPRIL 5 MG TABLETS,,,"\u20a61,800",12,yes',
  "Atorvastatin,20mg,tablet,2500,8,no",
].join("\\n");
const sheet = parseMedSheet(Buffer.from(csv, "utf8"));
console.log("  read " + sheet.rows.length + " of " + sheet.seen + " rows, " + sheet.problems.length + " problem(s)");
for (const pr of sheet.problems) console.log("       row " + pr.row + ": " + pr.reason + (pr.value ? " [" + pr.value + "]" : ""));
if (sheet.rows.length !== 4) { failures++; console.log("FAIL the importer lost a row"); }
const shopIndex = buildMedIndex(
  sheet.rows.map((r, n) => ({ id: "r" + n, name: r.name, strength: r.strength, form: r.form, price: r.listPrice }))
);
const endToEnd = [
  ["tabs amlodipine 10mg daily x 1/12", 2000],
  ["tabs metformin 500mg bd", 1500],
  ["lisinopril 5mg od", 1800],
  ["tab atorvastatin 20mg nocte", 2500],
];
for (const [line, price] of endToEnd) {
  const m = matchMedication(shopIndex, fromDoctor(line));
  const ok = !!m.row && m.row.price === price;
  if (!ok) failures++;
  console.log(
    (ok ? "ok   " : "FAIL ") + line.padEnd(36) + " -> " +
    (m.row ? "\u20a6" + m.row.price + " (" + m.how + ")" : m.how)
  );
}

console.log("\\n── the template survives both file shapes ──");
// A pharmacy downloads the template, fills it in, and sends back either the
// workbook or the CSV Excel makes of it. A CSV is text: read as a buffer it is
// decoded with the wrong codepage and every naira price is rejected, which is
// how a whole price list silently fails to import.
{
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(MED_SHEET_TEMPLATE), "Prices");
  const shapes = [
    ["xlsx", xlsx.write(book, { type: "buffer", bookType: "xlsx" })],
    ["csv (utf-8, BOM)", Buffer.from("\\ufeff" + xlsx.utils.sheet_to_csv(xlsx.utils.aoa_to_sheet(MED_SHEET_TEMPLATE)), "utf8")],
  ];
  for (const [label, buf] of shapes) {
    const p = parseMedSheet(buf);
    const ok = p.rows.length === 3 && p.problems.length === 0 && p.rows[0].listPrice === 2000 && p.rows[0].concession === 300;
    if (!ok) failures++;
    console.log((ok ? "ok   " : "FAIL ") + String(label).padEnd(18) + p.rows.length + " rows, " + p.problems.length + " problem(s)");
    if (!ok) p.problems.forEach((x) => console.log("       row " + x.row + ": " + x.reason));
  }
}

console.log("\\n── one drug, one row in the shop ──");
// The same medication as three pharmacists would type it into a spreadsheet.
// All three must key to one row, or the shop ends up with three prices for it
// and the member's prescription matches none of them.
const sheetKeys = [
  medKey("Amlodipine 10mg", null, "tablet"),
  medKey("Amlodipine", "10mg", "tablet"),
  medKey("AMLODIPINE 10 MG TABS", null, null),
];
const oneRow = sheetKeys.every((k) => k === sheetKeys[0]);
console.log((oneRow ? "ok   " : "FAIL ") + "3 spellings -> key " + JSON.stringify(sheetKeys[0]));
if (!oneRow) { failures++; sheetKeys.forEach((k) => console.log("       " + k)); }

// And two genuinely different products must never collide.
const distinct = new Set([
  medKey("Amlodipine", "5mg", "tablet"),
  medKey("Amlodipine", "10mg", "tablet"),
  medKey("Amlodipine", "10mg", "capsule"),
  medKey("Amlodipine", "10mg", null),
]);
const ok4 = distinct.size === 4;
console.log((ok4 ? "ok   " : "FAIL ") + "4 different products -> " + distinct.size + " keys");
if (!ok4) failures++;

if (failures) { console.error("\\n" + failures + " failure(s)."); process.exit(1); }
console.log("\\nEvery prescription finds its price, and no prescription finds the wrong one.");
`;

try {
  execFileSync("npx", ["tsx", "-e", script], { stdio: "inherit", cwd: process.cwd() });
} catch {
  process.exit(1);
}
