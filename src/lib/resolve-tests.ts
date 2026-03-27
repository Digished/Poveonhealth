/**
 * Test Resolution Pipeline
 *
 * Resolves a raw comma-/newline-separated test string into structured catalog matches.
 *
 * Resolution order (first match wins):
 *  0. Lab catalog match    — lab_offered_tests.synonyms for this lab  confidence: 1.0
 *  1. Exact synonym match  — DB lookup, case-insensitive              confidence: 1.0
 *  2. Prefix/contains match — ILIKE on synonym table                  confidence: 0.85
 *  3. Regex category match — existing test-categories.ts rules        confidence: 0.5
 *  4. AI classification    — gpt-4o-mini                              confidence: variable
 *  5. Others / Uncategorized — guaranteed catch-all                   confidence: 0.0
 */

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { testsToCategories } from "@/lib/test-categories";
import type { Decimal } from "@prisma/client/runtime/library";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ResolvedTest = {
  raw: string;
  canonical_id: string | null;
  canonical_name: string;
  category: string;
  unit_price: number;
  confidence: number;
  is_others: boolean;
  /** Set when matched from this lab's own catalog (lab_offered_tests) */
  lab_offered_test_id?: string | null;
  /** Poveon commission amount — only present for lab catalog matches */
  poveon_fee?: number | null;
  /** Where the price/match came from */
  source?: "lab_catalog" | "exact_synonym" | "fuzzy_synonym" | "regex_category" | "ai" | "others";
};

type LabCatalogEntry = {
  id: string;
  raw_name: string;
  category_label: string | null;
  synonyms: unknown;
  lab_price: Decimal;
  poveon_fee: Decimal | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Split raw test string into individual items */
function splitTests(raw: string): string[] {
  return raw
    .split(/[,\n;\/]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.toLowerCase() !== "see attached image");
}

/** Compute effective price for a specific catalog test + lab */
async function effectivePrice(catalogTestId: string, labId: string | null): Promise<number> {
  if (labId) {
    const override = await prisma.labTestPrice.findUnique({
      where: { lab_id_catalog_test_id: { lab_id: labId, catalog_test_id: catalogTestId } },
      select: { price: true },
    });
    if (override) return Number(override.price);
  }
  const test = await prisma.catalogTest.findUnique({
    where: { id: catalogTestId },
    select: { base_price: true },
  });
  return Number(test?.base_price ?? 0);
}

/** Compute effective price for a category (used for unlisted/fuzzy-matched tests) */
async function effectiveCategoryPrice(categoryId: string, labId: string | null): Promise<number> {
  if (labId) {
    const override = await prisma.labCategoryPrice.findUnique({
      where: { lab_id_category_id: { lab_id: labId, category_id: categoryId } },
      select: { price: true },
    });
    if (override) return Number(override.price);
  }
  const category = await prisma.testCategory.findUnique({
    where: { id: categoryId },
    select: { base_price: true },
  });
  return Number(category?.base_price ?? 0);
}

/** Get the Others/Uncategorized category and return a default result */
async function othersResult(raw: string, labId: string | null): Promise<ResolvedTest> {
  const cat = await prisma.testCategory.findUnique({
    where: { slug: "others-uncategorized" },
    select: { id: true, name: true },
  });

  const price = cat ? await effectiveCategoryPrice(cat.id, labId) : 0;

  return {
    raw,
    canonical_id: null,
    canonical_name: raw,
    category: cat?.name ?? "Others / Uncategorized",
    unit_price: price,
    confidence: 0,
    is_others: true,
    source: "others",
  };
}

// ── Step 0: Lab catalog match ─────────────────────────────────────────────────
// Highest priority. Checks the lab's own uploaded test catalog (lab_offered_tests).
// Uses a 3-pass strategy: exact synonym → token overlap → AI semantic match.

/** Normalize a string for comparison: lowercase, strip punctuation, collapse spaces */
function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Tokenize a normalized string into words (≥2 chars) */
function tokens(s: string): string[] {
  return normStr(s).split(" ").filter((w) => w.length >= 2);
}

function makeCatalogResult(normalized: string, entry: LabCatalogEntry): ResolvedTest {
  return {
    raw: normalized,
    canonical_id: null,
    canonical_name: entry.raw_name,
    category: entry.category_label ?? "Lab Test",
    unit_price: Number(entry.lab_price),
    confidence: 1.0,
    is_others: false,
    lab_offered_test_id: entry.id,
    poveon_fee: entry.poveon_fee ? Number(entry.poveon_fee) : null,
    source: "lab_catalog",
  };
}

function labCatalogMatch(
  normalized: string,
  catalog: LabCatalogEntry[]
): ResolvedTest | null {
  const q = normStr(normalized);

  // Pass 1: exact normalized match against raw_name or any synonym
  for (const entry of catalog) {
    if (normStr(entry.raw_name) === q) return makeCatalogResult(normalized, entry);
    const synonyms = Array.isArray(entry.synonyms) ? (entry.synonyms as unknown[]) : [];
    if (synonyms.some((s) => typeof s === "string" && normStr(s) === q)) {
      return makeCatalogResult(normalized, entry);
    }
  }

  // Pass 2: token overlap — all tokens of the shorter string appear in the longer (≥2 matching tokens)
  const qTokens = tokens(normalized);
  if (qTokens.length >= 2) {
    for (const entry of catalog) {
      const candidates = [entry.raw_name, ...(Array.isArray(entry.synonyms) ? entry.synonyms as string[] : [])];
      for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const cTokens = tokens(candidate);
        const overlap = qTokens.filter((t) => cTokens.includes(t)).length;
        const minLen = Math.min(qTokens.length, cTokens.length);
        if (overlap >= 2 && overlap >= minLen * 0.7) {
          return makeCatalogResult(normalized, entry);
        }
      }
    }
  }

  return null;
}

// ── Step 0b: AI-based lab catalog match ───────────────────────────────────────
// Falls back to GPT when exact/token matching fails. Sends all catalog entry names
// in a single prompt and asks the model to identify the best match.

async function aiCatalogMatch(
  normalized: string,
  catalog: LabCatalogEntry[]
): Promise<ResolvedTest | null> {
  if (!process.env.OPENAI_API_KEY || catalog.length === 0) return null;

  const catalogList = catalog.map((e, i) => `${i}. ${e.raw_name}`).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a medical lab expert. Given a test name requested by a doctor and a lab's catalog of available tests, identify whether the requested test matches any catalog entry (by meaning, not just wording).
Return JSON: { "match_index": number | null, "confidence": number (0–1) }
Return null for match_index if no reasonable match exists. Only match if you're reasonably confident (confidence >= 0.6).`,
        },
        {
          role: "user",
          content: `Requested test: "${normalized}"\n\nLab catalog:\n${catalogList}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as {
      match_index?: number | null;
      confidence?: number;
    };

    if (parsed.match_index == null || (parsed.confidence ?? 0) < 0.6) return null;
    const entry = catalog[parsed.match_index];
    if (!entry) return null;

    return {
      ...makeCatalogResult(normalized, entry),
      confidence: parsed.confidence ?? 0.7,
    };
  } catch {
    return null;
  }
}

// ── Step 1: Exact synonym match ───────────────────────────────────────────────

async function exactMatch(
  normalized: string,
  labId: string | null
): Promise<ResolvedTest | null> {
  const synonym = await prisma.testSynonym.findFirst({
    where: { synonym: { equals: normalized, mode: "insensitive" } },
    include: { catalog_test: { include: { category: { select: { name: true } } } } },
  });
  if (!synonym) return null;
  const { catalog_test } = synonym;
  const price = await effectivePrice(catalog_test.id, labId);
  return {
    raw: normalized,
    canonical_id: catalog_test.id,
    canonical_name: catalog_test.canonical_name,
    category: catalog_test.category.name,
    unit_price: price,
    confidence: 1.0,
    is_others: false,
    source: "exact_synonym",
  };
}

// ── Step 2: Prefix / contains match ──────────────────────────────────────────

async function fuzzyMatch(
  normalized: string,
  labId: string | null
): Promise<ResolvedTest | null> {
  if (normalized.length < 3) return null;

  const synonyms = await prisma.testSynonym.findMany({
    where: {
      OR: [
        { synonym: { startsWith: normalized, mode: "insensitive" } },
        { synonym: { contains: normalized, mode: "insensitive" } },
      ],
    },
    include: { catalog_test: { include: { category: { select: { name: true } } } } },
    take: 5,
  });

  if (synonyms.length === 0) return null;

  // Prefer the synonym whose length is closest to the input (less padding)
  const best = synonyms.sort(
    (a, b) =>
      Math.abs(a.synonym.length - normalized.length) -
      Math.abs(b.synonym.length - normalized.length)
  )[0];

  const ratio = normalized.length / best.synonym.length;
  const confidence = Math.max(0.6, Math.min(0.9, ratio));

  const { catalog_test } = best;
  const price = await effectivePrice(catalog_test.id, labId);
  return {
    raw: normalized,
    canonical_id: catalog_test.id,
    canonical_name: catalog_test.canonical_name,
    category: catalog_test.category.name,
    unit_price: price,
    confidence,
    is_others: false,
    source: "fuzzy_synonym",
  };
}

// ── Step 3: Regex category match ──────────────────────────────────────────────

const CATEGORY_SLUG_MAP: Record<string, string> = {
  "X-Ray":               "x-ray",
  "CT Scan":             "ct-scan",
  "MRI":                 "mri",
  "Ultrasound":          "ultrasound-echocardiography",
  "Mammography":         "special-imaging",
  "Fluoroscopy":         "special-imaging",
  "PET Scan":            "nuclear-medicine-pet",
  "DEXA Scan":           "special-imaging",
  "Biopsy / Histology":  "histopathology-cytology",
  "Microbiology":        "microbiology-culture",
  "Stool Test":          "stool-faecal-tests",
  "Urine Test":          "urinalysis",
  "Blood Test":          "hematology",
};

async function regexCategoryMatch(
  raw: string,
  labId: string | null
): Promise<ResolvedTest | null> {
  const [categoryLabel] = testsToCategories(raw);
  if (!categoryLabel || categoryLabel === "Other Tests") return null;

  const slug = CATEGORY_SLUG_MAP[categoryLabel];
  if (!slug) return null;

  const category = await prisma.testCategory.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!category) return null;

  const unit_price = await effectiveCategoryPrice(category.id, labId);

  return {
    raw,
    canonical_id: null,
    canonical_name: raw,
    category: category.name,
    unit_price,
    confidence: 0.5,
    is_others: false,
    source: "regex_category",
  };
}

// ── Step 4: AI classification ─────────────────────────────────────────────────

async function aiClassify(
  raw: string,
  labId: string | null
): Promise<ResolvedTest | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a medical lab expert. Given a raw test name, identify the most likely canonical lab test name and its category from this list:
Hematology, Coagulation & Haemostasis, Clinical Chemistry & Biochemistry, Endocrinology & Hormones,
Immunology & Autoimmune, Tumour Markers & Oncology, Virology & Serology, Microbiology & Culture,
TB & Mycobacteriology, Parasitology, Molecular & Genetic Diagnostics, Urinalysis, Stool & Faecal Tests,
Body Fluids Analysis, Histopathology & Cytology, Blood Banking & Transfusion, Toxicology & Drug Testing,
Others / Uncategorized, X-Ray, Ultrasound & Echocardiography, CT Scan, MRI, Nuclear Medicine & PET, Special Imaging.
Return JSON: { "canonical_name": string, "category": string, "confidence": number (0–1) }`,
        },
        { role: "user", content: `Raw test name: "${raw}"` },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as {
      canonical_name?: string;
      category?: string;
      confidence?: number;
    };

    if (!parsed.canonical_name || !parsed.category) return null;

    // Try to find the canonical_name in the DB as an exact match
    const dbMatch = await exactMatch(parsed.canonical_name, labId);
    if (dbMatch) {
      return { ...dbMatch, raw, confidence: Math.min(dbMatch.confidence, parsed.confidence ?? 0.6), source: "ai" };
    }

    const categoryRecord = await prisma.testCategory.findFirst({
      where: { name: { equals: parsed.category, mode: "insensitive" } },
      select: { id: true },
    });
    const unit_price = categoryRecord
      ? await effectiveCategoryPrice(categoryRecord.id, labId)
      : 0;

    return {
      raw,
      canonical_id: null,
      canonical_name: parsed.canonical_name,
      category: parsed.category,
      unit_price,
      confidence: parsed.confidence ?? 0.5,
      is_others: parsed.category === "Others / Uncategorized",
      source: "ai",
    };
  } catch {
    return null;
  }
}

// ── Log unresolved tests ──────────────────────────────────────────────────────

async function logUnmapped(raw: string) {
  try {
    await prisma.unmappedTest.upsert({
      where: { raw_name: raw },
      create: { raw_name: raw, occurrence_count: 1, last_seen_at: new Date() },
      update: {
        occurrence_count: { increment: 1 },
        last_seen_at: new Date(),
      },
    });
  } catch { /* non-critical */ }
}

// ── Main resolution function ──────────────────────────────────────────────────

async function resolveOne(
  raw: string,
  labId: string | null,
  labCatalog: LabCatalogEntry[],
): Promise<ResolvedTest> {
  const normalized = raw.trim();
  if (!normalized) return othersResult(raw, labId);

  // 0. Lab catalog — highest priority, uses lab's real price + commission
  if (labCatalog.length > 0) {
    const catalogMatch = labCatalogMatch(normalized, labCatalog);
    if (catalogMatch) return catalogMatch;

    // 0b. AI catalog match — semantic match against lab's catalog entries
    const aiCatalog = await aiCatalogMatch(normalized, labCatalog);
    if (aiCatalog) return aiCatalog;
  }

  // 1. Exact synonym
  const exact = await exactMatch(normalized, labId);
  if (exact) return exact;

  // 2. Fuzzy
  const fuzzy = await fuzzyMatch(normalized, labId);
  if (fuzzy && fuzzy.confidence >= 0.75) return fuzzy;

  // 3. Regex category
  const regex = await regexCategoryMatch(normalized, labId);
  if (regex) return regex;

  // 4. AI
  const ai = await aiClassify(normalized, labId);
  if (ai && ai.confidence >= 0.4) return ai;

  // 5. Log and fall through to Others
  await logUnmapped(normalized);

  if (fuzzy) { await logUnmapped(normalized); return fuzzy; }
  if (ai)    { await logUnmapped(normalized); return ai; }

  return othersResult(raw, labId);
}

/**
 * Resolve a raw tests string into an array of structured results.
 *
 * Step 0 (new): checks this lab's own `lab_offered_tests` catalog first.
 * If the test name (or any of its AI-generated synonyms) matches an entry,
 * the lab's real price and Poveon fee are used directly — no master catalog
 * resolution needed.
 *
 * @param rawTests  Comma/newline-separated test string, e.g. "FBC, LFT, Urinalysis"
 * @param labId     Lab ID — used for catalog match and price overrides
 */
export async function resolveTests(
  rawTests: string,
  labId: string | null = null
): Promise<ResolvedTest[]> {
  if (!rawTests || rawTests.trim() === "See attached image") return [];

  const items = splitTests(rawTests);
  if (items.length === 0) return [];

  // Pre-load this lab's offered tests once — shared across all items in the request
  let labCatalog: LabCatalogEntry[] = [];
  if (labId) {
    labCatalog = await prisma.labOfferedTest.findMany({
      where: { lab_id: labId, is_active: true },
      select: { id: true, raw_name: true, category_label: true, synonyms: true, lab_price: true, poveon_fee: true },
    });
  }

  return Promise.all(items.map((item) => resolveOne(item, labId, labCatalog)));
}

/**
 * Convenience: compute the total quoted price from a resolved breakdown.
 */
export function totalFromBreakdown(breakdown: ResolvedTest[]): number {
  return breakdown.reduce((sum, t) => sum + t.unit_price, 0);
}
