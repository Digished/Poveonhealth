/**
 * Test Resolution Pipeline
 *
 * Resolves a raw comma-/newline-separated test string into structured catalog matches.
 *
 * Resolution order (first match wins):
 *  1. Exact synonym match     — DB lookup, case-insensitive          confidence: 1.0
 *  2. Prefix/contains match   — ILIKE on synonym table               confidence: 0.85
 *  3. Regex category match    — existing test-categories.ts rules    confidence: 0.5
 *  4. AI classification       — gpt-4o-mini                          confidence: variable
 *  5. Others / Uncategorized  — guaranteed catch-all                 confidence: 0.0
 */

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { testsToCategories } from "@/lib/test-categories";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ResolvedTest = {
  raw: string;
  canonical_id: string | null;
  canonical_name: string;
  category: string;
  unit_price: number;
  confidence: number;
  is_others: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Split raw test string into individual items */
function splitTests(raw: string): string[] {
  return raw
    .split(/[,\n;\/]|\band\b/i)
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
  };
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

  // Confidence degrades the more the synonym diverges from the input
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
  };
}

// ── Step 3: Regex category match ──────────────────────────────────────────────
// Maps to a category slug, then returns the first active test in that category
// (or falls through to Others if the category has no tests yet)

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
  "Blood Test":          "hematology", // broadest fallback for unclassified blood tests
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

  // Price based on the category's general price (lab override or global base_price)
  const unit_price = await effectiveCategoryPrice(category.id, labId);

  return {
    raw,
    canonical_id: null,
    canonical_name: raw,
    category: category.name,
    unit_price,
    confidence: 0.5,
    is_others: false,
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
      return { ...dbMatch, raw, confidence: Math.min(dbMatch.confidence, parsed.confidence ?? 0.6) };
    }

    // Look up the category to get its pricing
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

async function resolveOne(raw: string, labId: string | null): Promise<ResolvedTest> {
  const normalized = raw.trim();
  if (!normalized) return othersResult(raw, labId);

  // 1. Exact
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

  // Also log low-confidence fuzzy/AI hits
  if (fuzzy) { await logUnmapped(normalized); return fuzzy; }
  if (ai)    { await logUnmapped(normalized); return ai; }

  return othersResult(raw, labId);
}

/**
 * Resolve a raw tests string into an array of structured results.
 *
 * @param rawTests  Comma/newline-separated test string, e.g. "FBC, LFT, Urinalysis"
 * @param labId     Optional lab ID to use lab-specific price overrides
 */
export async function resolveTests(
  rawTests: string,
  labId: string | null = null
): Promise<ResolvedTest[]> {
  if (!rawTests || rawTests.trim() === "See attached image") return [];

  const items = splitTests(rawTests);
  if (items.length === 0) return [];

  // Resolve in parallel (each test is independent)
  return Promise.all(items.map((item) => resolveOne(item, labId)));
}

/**
 * Convenience: compute the total quoted price from a resolved breakdown.
 */
export function totalFromBreakdown(breakdown: ResolvedTest[]): number {
  return breakdown.reduce((sum, t) => sum + t.unit_price, 0);
}
