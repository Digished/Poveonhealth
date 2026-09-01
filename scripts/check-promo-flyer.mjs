#!/usr/bin/env node
/**
 * The partner flyer is printed. Nobody sees it before a pharmacist does.
 *
 * There is no PDF rasteriser in this environment, so the flyer is rendered and
 * then read back the hard way: the content stream is decompressed, the graphics
 * stack is walked to turn every text run's matrix into an absolute position on
 * the page, and the result is asserted against what an A4 sheet can hold.
 *
 * It checks the three things that actually go wrong:
 *
 *   - it spills onto a second sheet, which is not a flyer;
 *   - something sits outside the printable area;
 *   - the price stops being the largest thing on the page, which is the whole
 *     design: a poster read in three seconds at a counter has one job.
 *
 * It deliberately does not test for a hyphen breaking a word in half. That is
 * a real failure mode for this flyer — "YOUR POVEON PHARMA-CY" was in a render
 * of it — but registerHyphenationCallback in the flyer now prevents it at the
 * source, and an assertion that cannot be made to fail is not worth trusting.
 *
 *   node scripts/check-promo-flyer.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";

const out = join(mkdtempSync(join(tmpdir(), "promo-")), "flyer.pdf");

const render = `
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { CarePromoDocument } from "./src/lib/care-promo-pdf";

// tsx -e compiles to CommonJS, where top-level await is not available, so the
// render is wrapped rather than awaited at the top level.
// A 1x1 PNG stands in for the QR: this checks the layout, not the code.
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// The longest realistic partner name and address, because a flyer that only
// works for "Ade Pharmacy" is a flyer that breaks in production.
void (async () => {
await renderToFile(
  React.createElement(CarePromoDocument, {
    partnerName: ${JSON.stringify("HealthPlus Pharmacy, Ikeja")},
    partnerKind: "pharmacy",
    addressLine: "24 Obafemi Awolowo Way, Ikeja",
    phone: "0809 988 7766",
    qrDataUri: png,
    logoDataUri: null,
    joinUrl: "poveon.com/join/HP-IKJ",
    priceNaira: 2500,
    labDiscountPercent: 15,
    pharmacyDiscountPercent: 10,
    messageAllowance: 40,
  }),
  ${JSON.stringify(out)}
);
})();
`;

execFileSync("npx", ["tsx", "-e", render], { stdio: "inherit", cwd: process.cwd() });

const pdf = readFileSync(out);

// ── Read the page back ──────────────────────────────────────────────────────
const streams = [];
for (let i = 0; ; ) {
  const start = pdf.indexOf("stream", i);
  if (start < 0) break;
  let s = start + 6;
  while (pdf[s] === 0x0d || pdf[s] === 0x0a) s++;
  const end = pdf.indexOf("endstream", s);
  if (end < 0) break;
  const raw = pdf.subarray(s, end);
  try { streams.push(zlib.inflateSync(raw)); } catch { streams.push(raw); }
  i = end + 9;
}
const content = streams.sort((a, b) => b.length - a.length)[0].toString("latin1");

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

const n = "(-?[\\d.]+)";
const six = new Array(6).fill(n).join(" ");
const token = new RegExp(
  `\\bq\\b|\\bQ\\b|${six} cm\\b|${six} Tm\\b|\\[(.*?)\\] TJ|/F\\d+ ([\\d.]+) Tf`,
  "g"
);

let ctm = [1, 0, 0, 1, 0, 0];
const stack = [];
let pending = null;
let size = 0;
const runs = [];

for (const m of content.matchAll(token)) {
  const t = m[0];
  if (t === "q") stack.push(ctm);
  else if (t === "Q") ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
  else if (t.endsWith("cm")) ctm = mul(m.slice(1, 7).map(Number), ctm);
  else if (t.endsWith("Tm")) pending = mul(m.slice(7, 13).map(Number), ctm);
  else if (t.endsWith("Tf")) size = Number(m[14]);
  else if (t.endsWith("TJ") && pending) {
    // Glyph ids, which for these built-in fonts map 1:1 onto the characters.
    let text = "";
    for (const hex of m[13].matchAll(/<([0-9a-fA-F]+)>/g)) {
      const h = hex[1];
      const step = h.length <= 2 ? 2 : 4;
      for (let k = 0; k < h.length; k += step) {
        const v = parseInt(h.slice(k, k + step), 16);
        text += v >= 32 && v < 0x110000 ? String.fromCodePoint(v) : "?";
      }
    }
    runs.push({ y: pending[5], x: pending[4], size, text });
  }
}
runs.sort((a, b) => b.y - a.y);

// ── What must be true ───────────────────────────────────────────────────────
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 8; // ink this close to the trim is a print risk
let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label + (detail ? `  ${detail}` : ""));
};

const pages = (pdf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
check(pages === 1, "one page", `rendered ${pages}`);

const off = runs.filter(
  (r) => r.y < MARGIN || r.y > A4.h - MARGIN || r.x < MARGIN || r.x > A4.w - MARGIN
);
check(off.length === 0, "everything inside the page", off.map((r) => `"${r.text}" @${r.x.toFixed(0)},${r.y.toFixed(0)}`).join("; "));

// The price leads. If anything on the page is set larger, the poster has grown
// a second message and this design has stopped being this design.
const biggest = runs.reduce((a, b) => (b.size > a.size ? b : a), runs[0]);
check(
  /2,500/.test(biggest.text),
  "the price is the largest thing on the page",
  `largest is ${biggest.size.toFixed(0)}pt "${biggest.text.slice(0, 30)}"`
);

// The four things the flyer exists to say must all be on it.
const flat = runs.map((r) => r.text).join(" ");
const must = [
  ["the price", /2,500/],
  ["what it covers", /FULL YEAR OF COVER/],
  ["the call to action", /SCAN TO JOIN/],
  ["the plan's name", /CARE PLAN/],
];
for (const [what, re] of must) check(re.test(flat), `says ${what}`);

// Restraint is the point of this design, so it is asserted rather than assumed.
const blocks = runs.filter((r) => r.size >= 9).length;
check(blocks <= 26, "still uncluttered", `${blocks} text runs at 9pt or larger`);

console.log("\nLargest type on the page, in order:");
for (const r of runs.filter((x) => x.size >= 14).slice(0, 8)) {
  console.log(`  ${r.size.toFixed(0).padStart(3)}pt  y${r.y.toFixed(0).padStart(4)}  ${r.text.slice(0, 40)}`);
}

try { unlinkSync(out); } catch { /* the temp dir goes with the run */ }

if (failures) { console.error(`\n${failures} failure(s).`); process.exit(1); }
console.log("\nOne page, nothing off it, and the price still leads.");
