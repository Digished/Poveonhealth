/**
 * Reading a pharmacy's price list out of whatever spreadsheet they send.
 *
 * A pharmacist's price list is not a schema. The columns are called whatever
 * they are called, the prices carry naira signs and thousands separators, the
 * strength is sometimes its own column and sometimes part of the name, and the
 * concession is sometimes naira and sometimes a percentage. So the header row
 * is matched by meaning rather than by position, and every value is coerced
 * before it is judged.
 *
 * Nothing here touches the database: it turns a file into rows plus a list of
 * problems, so the same code can drive the preview the uploader sees and the
 * commit that follows it. What a row *costs* is not decided here either — that
 * is lib/med-pricing.ts.
 */

import * as xlsx from "xlsx";

export type ParsedMedRow = {
  /** 1-based row in the sheet, so a problem can be pointed at. */
  row: number;
  name: string;
  strength: string | null;
  form: string | null;
  pack: string | null;
  listPrice: number;
  /** What the pharmacy takes off for Poveon. Always naira by the time it leaves
   *  here, whatever the sheet said. */
  concession: number;
  /** True when the sheet gave a percentage and we converted it. */
  concessionWasPercent: boolean;
  inStock: boolean;
  notes: string | null;
  key: string;
};

export type SheetProblem = { row: number; reason: string; value?: string };

export type ParsedSheet = {
  rows: ParsedMedRow[];
  problems: SheetProblem[];
  /** Which sheet column was read as what, so the uploader can check. */
  mapping: Record<string, string>;
  seen: number;
};

/**
 * Header synonyms, longest-intent first.
 *
 * Matching is on a normalised header (lowercased, punctuation stripped), and
 * `concession_pct` is tested before `concession` so "discount %" is not read as
 * a naira column — the difference between ₦15 off and 15% off is the whole
 * margin.
 */
const COLUMNS: { field: string; match: string[] }[] = [
  { field: "concession_pct", match: ["discountpercent", "discountpct", "discount%", "percentoff", "discountpercentage", "%discount", "%off"] },
  { field: "concession", match: ["discount", "discountnaira", "discountamount", "amountoff", "concession", "rebate", "poveondiscount", "memberdiscount", "offforpoveon", "poveonprice", "tradediscount"] },
  { field: "list_price", match: ["price", "listprice", "unitprice", "sellingprice", "retailprice", "cost", "amount", "shopprice", "currentprice"] },
  { field: "name", match: ["name", "medication", "medicine", "drug", "product", "item", "description", "brand", "genericname", "drugname"] },
  { field: "strength", match: ["strength", "dose", "dosage", "mg", "concentration"] },
  { field: "form", match: ["form", "type", "dosageform", "presentation"] },
  { field: "pack", match: ["pack", "packsize", "packaging", "quantity", "qty", "unit", "units", "packof"] },
  { field: "stock", match: ["instock", "stock", "available", "availability"] },
  { field: "notes", match: ["notes", "note", "comment", "comments", "remarks"] },
];

const normalise = (h: string) => String(h ?? "").toLowerCase().replace(/[^a-z0-9%]/g, "");

/** "₦1,200.50" / "1200" / "1.2k" → 1200.5. Null when it is not a number. */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const k = /^([\d,.]+)\s*k$/i.exec(text.replace(/[₦n]/gi, ""));
  if (k) {
    const n = Number(k[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const cleaned = text.replace(/[₦,\s]/g, "").replace(/^n(?=[\d.])/i, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "yes" / "y" / "true" / "in stock" / 1 → true. Blank means in stock. */
function parseStock(raw: unknown): boolean {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return true;
  return !/^(no|n|false|0|out|outofstock|unavailable)$/.test(text.replace(/[^a-z0-9]/g, ""));
}

/**
 * A strength written into the name — "Amlodipine 10mg", "Metformin 500 mg".
 * Pulled out so two sheets that disagree about where the strength lives still
 * produce the same key and update the same row.
 */
function splitStrength(name: string): { name: string; strength: string | null } {
  const m = /^(.*?)[\s,-]+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml))?)\s*$/i.exec(name.trim());
  if (!m || !m[1].trim()) return { name: name.trim(), strength: null };
  return { name: m[1].trim(), strength: m[2].replace(/\s+/g, "").toLowerCase() };
}

/** The identity a re-upload matches on. */
export function medKey(name: string, strength: string | null, form: string | null): string {
  return [name, strength ?? "", form ?? ""]
    .map((p) => String(p).toLowerCase().replace(/[^a-z0-9]/g, ""))
    .join("|");
}

/** Read a CSV or XLSX buffer into rows plus the problems worth showing. */
export function parseMedSheet(buffer: Buffer, opts: { maxRows?: number } = {}): ParsedSheet {
  const maxRows = opts.maxRows ?? 5000;
  const book = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return { rows: [], problems: [{ row: 0, reason: "The file has no sheets in it." }], mapping: {}, seen: 0 };

  const grid = xlsx.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, blankrows: false, defval: "" });
  if (grid.length < 2) {
    return { rows: [], problems: [{ row: 0, reason: "The sheet needs a header row and at least one medication." }], mapping: {}, seen: 0 };
  }

  // Map header → field, first match wins so a sheet with both "discount" and
  // "discount %" gets each into its own slot.
  const header = (grid[0] ?? []).map((h) => normalise(String(h)));
  const index: Record<string, number> = {};
  const mapping: Record<string, string> = {};
  header.forEach((h, i) => {
    if (!h) return;
    for (const col of COLUMNS) {
      if (index[col.field] !== undefined) continue;
      if (col.match.includes(h)) {
        index[col.field] = i;
        mapping[String(grid[0][i])] = col.field;
        break;
      }
    }
  });

  const problems: SheetProblem[] = [];
  if (index.name === undefined) {
    problems.push({ row: 1, reason: "No column of medication names. Name one column Medication, Drug or Product." });
  }
  if (index.list_price === undefined) {
    problems.push({ row: 1, reason: "No price column. Name one column Price." });
  }
  if (problems.length) return { rows: [], problems, mapping, seen: grid.length - 1 };

  const cell = (r: unknown[], field: string) =>
    index[field] === undefined ? "" : r[index[field]];

  const rows: ParsedMedRow[] = [];
  const seenKeys = new Map<string, number>();

  for (let i = 1; i < grid.length && rows.length < maxRows; i++) {
    const r = grid[i] ?? [];
    const rowNo = i + 1;

    const rawName = String(cell(r, "name") ?? "").trim();
    if (!rawName) continue; // a blank line in the middle is not a problem

    const listPrice = parseMoney(cell(r, "list_price"));
    if (listPrice === null) {
      problems.push({ row: rowNo, reason: "Price is not a number", value: String(cell(r, "list_price") ?? "") });
      continue;
    }
    if (listPrice <= 0) {
      problems.push({ row: rowNo, reason: "Price must be more than zero", value: String(listPrice) });
      continue;
    }

    const sheetStrength = String(cell(r, "strength") ?? "").trim();
    const split = splitStrength(rawName);
    const name = sheetStrength ? rawName : split.name;
    const strength = sheetStrength ? sheetStrength.replace(/\s+/g, "").toLowerCase() : split.strength;
    const form = String(cell(r, "form") ?? "").trim().toLowerCase() || null;

    // Naira column wins; a percentage column is converted against this price.
    let concession = parseMoney(cell(r, "concession")) ?? 0;
    let wasPercent = false;
    if (!concession && index.concession_pct !== undefined) {
      const pct = parseMoney(String(cell(r, "concession_pct") ?? "").replace("%", ""));
      if (pct && pct > 0) {
        concession = Math.round(((listPrice * Math.min(100, pct)) / 100) * 100) / 100;
        wasPercent = true;
      }
    }
    if (concession < 0) {
      problems.push({ row: rowNo, reason: "Discount cannot be negative", value: String(concession) });
      continue;
    }
    if (concession > listPrice) {
      problems.push({
        row: rowNo,
        reason: `Discount (${concession}) is more than the price (${listPrice})`,
      });
      continue;
    }

    const key = medKey(name, strength, form);
    const firstSeen = seenKeys.get(key);
    if (firstSeen) {
      problems.push({ row: rowNo, reason: `Same medication as row ${firstSeen}; the later row wins`, value: rawName });
      // Deliberately not skipped: the last price in the file is the one they
      // meant, and dropping it would silently keep a stale price.
      const at = rows.findIndex((x) => x.key === key);
      if (at >= 0) rows.splice(at, 1);
    }
    seenKeys.set(key, rowNo);

    rows.push({
      row: rowNo,
      name,
      strength,
      form,
      pack: String(cell(r, "pack") ?? "").trim() || null,
      listPrice,
      concession,
      concessionWasPercent: wasPercent,
      inStock: parseStock(cell(r, "stock")),
      notes: String(cell(r, "notes") ?? "").trim() || null,
      key,
    });
  }

  if (grid.length - 1 > maxRows) {
    problems.push({ row: 0, reason: `Only the first ${maxRows} medications were read. Split the file and upload the rest.` });
  }

  return { rows, problems, mapping, seen: grid.length - 1 };
}

/** The template a pharmacy downloads, so most uploads need no guessing at all. */
export const MED_SHEET_TEMPLATE: (string | number)[][] = [
  ["Medication", "Strength", "Form", "Pack size", "Price", "Off for Poveon", "In stock", "Notes"],
  ["Amlodipine", "10mg", "tablet", "30 tablets", 2000, 300, "yes", ""],
  ["Metformin", "500mg", "tablet", "60 tablets", 1500, 250, "yes", ""],
  ["Lisinopril", "5mg", "tablet", "30 tablets", 1800, 200, "yes", ""],
];
