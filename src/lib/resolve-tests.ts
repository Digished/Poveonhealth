/**
 * Test Resolution Pipeline
 *
 * Resolves a raw test string into structured catalog matches using
 * this lab's own catalog (lab_offered_tests) only.
 *
 *  Step 0:  Exact / acronym / token match against lab catalog
 *  Step 0b: AI batch match (GPT-4o-mini) for anything still unmatched
 *  Others:  unit_price = 0, no commission
 */

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
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
  /** Set when matched from this lab's own catalog */
  lab_offered_test_id?: string | null;
  /** Poveon commission — only present for lab catalog matches */
  poveon_fee?: number | null;
  /** Where the match came from */
  source?: "lab_catalog" | "others";
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

function splitTests(raw: string): string[] {
  return raw
    .split(/[,\n;\/]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.toLowerCase() !== "see attached image");
}

/** Normalize: lowercase, strip punctuation, collapse spaces */
function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set([
  "of", "the", "and", "for", "in", "on", "to", "a", "an", "at", "by", "or",
  "with", "test", "level", "count",
]);

function tokens(s: string): string[] {
  return normStr(s).split(" ").filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/** "fbc" is an acronym of "full blood count" */
function isAcronym(short: string, long: string): boolean {
  const shortNorm = normStr(short).replace(/\s/g, "");
  const longWords = normStr(long).split(" ").filter((w) => w.length > 0);
  if (shortNorm.length < 2 || shortNorm.length !== longWords.length) return false;
  return longWords.every((w, i) => w[0] === shortNorm[i]);
}

function makeCatalogResult(raw: string, entry: LabCatalogEntry): ResolvedTest {
  return {
    raw,
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

function offCatalogResult(canonicalName: string, raw: string): ResolvedTest {
  return {
    raw,
    canonical_id: null,
    canonical_name: canonicalName,
    category: "Others",
    unit_price: 0,
    confidence: 0,
    is_others: true,
    source: "others",
  };
}

function othersResult(raw: string): ResolvedTest {
  return offCatalogResult(raw, raw);
}

/**
 * Imaging/procedure modalities. When a SPECIFIC study isn't in the lab's
 * catalogue (e.g. "Ultrasound of the left leg") we fall back to the modality
 * (e.g. "Ultrasound Scan") so the request is still actionable — the lab prices
 * it under that modality, or accepts/rejects it as an off-catalogue item.
 */
const MODALITY_RULES: { label: string; re: RegExp }[] = [
  { label: "Ultrasound Scan", re: /\bultrasound\b|\buss?\b|\bdoppler\b|\becho(?:cardiogra(?:m|phy))?\b|\bobstetric\s+scan\b|\bfetal\s+scan\b|\banomaly\s+scan\b|\bpelvic\s+scan\b|\babdominal\s+scan\b/i },
  { label: "X-Ray", re: /\bx[-\s]?rays?\b|\bxray\b|\bcxr\b/i },
  { label: "CT Scan", re: /\bct\s*scan\b|\bct\b|\bcat\s+scan\b|\bcomputed\s+tomography\b/i },
  { label: "MRI Scan", re: /\bmri\b|\bmagnetic\s+resonance\b/i },
  { label: "Mammography", re: /\bmammogra(?:m|phy)\b/i },
  { label: "PET Scan", re: /\bpet\s*scan\b|\bpositron\b/i },
  { label: "DEXA Scan", re: /\bdexa\b|\bbone\s+density\b|\bdensitometry\b/i },
  { label: "Fluoroscopy", re: /\bfluoroscop|\bbarium\b/i },
];

function deriveModality(name: string): string | null {
  for (const m of MODALITY_RULES) if (m.re.test(name)) return m.label;
  return null;
}

/**
 * Final fallback for a test that didn't match the lab's catalogue specifically.
 * Imaging studies fall back to their modality (and try to match a catalogue
 * entry for that modality so they get a price); everything else is kept as an
 * off-catalogue item under its original name. Either way the test is INCLUDED —
 * it's up to the lab to accept/price or reject it.
 */
function fallbackResult(raw: string, catalog: LabCatalogEntry[]): ResolvedTest {
  const modality = deriveModality(raw);
  if (modality) {
    const catMatch = catalog.length > 0 ? labCatalogMatch(modality, catalog) : null;
    if (catMatch) return { ...catMatch, raw };
    return offCatalogResult(modality, raw);
  }
  return othersResult(raw);
}

// ── Step 0: Lab catalog match ─────────────────────────────────────────────────

function labCatalogMatch(normalized: string, catalog: LabCatalogEntry[]): ResolvedTest | null {
  const q = normStr(normalized);

  // Pass 1: exact normalized match against raw_name or any synonym
  for (const entry of catalog) {
    const allNames = [
      entry.raw_name,
      ...(Array.isArray(entry.synonyms) ? (entry.synonyms as string[]) : []),
    ];
    if (allNames.some((n) => typeof n === "string" && normStr(n) === q)) {
      return makeCatalogResult(normalized, entry);
    }
  }

  // Pass 2: acronym match — "FBC" ↔ "Full Blood Count"
  for (const entry of catalog) {
    const allNames = [
      entry.raw_name,
      ...(Array.isArray(entry.synonyms) ? (entry.synonyms as string[]) : []),
    ];
    for (const name of allNames) {
      if (typeof name !== "string") continue;
      if (isAcronym(q, normStr(name)) || isAcronym(normStr(name), q)) {
        return makeCatalogResult(normalized, entry);
      }
    }
  }

  // Pass 3: token overlap (stop-word filtered)
  const qTokens = tokens(normalized);
  if (qTokens.length >= 1) {
    for (const entry of catalog) {
      const allNames = [
        entry.raw_name,
        ...(Array.isArray(entry.synonyms) ? (entry.synonyms as string[]) : []),
      ];
      for (const name of allNames) {
        if (typeof name !== "string") continue;
        const cTokens = tokens(name);
        if (cTokens.length === 0) continue;
        const overlap = qTokens.filter((t) => cTokens.includes(t)).length;
        const minLen = Math.min(qTokens.length, cTokens.length);
        if (overlap >= Math.min(2, minLen) && overlap >= minLen * 0.6) {
          return makeCatalogResult(normalized, entry);
        }
      }
    }
  }

  return null;
}

// ── Step 0b: AI batch catalog match ──────────────────────────────────────────
// One GPT call per request for all unmatched tests.

async function aiBatchCatalogMatch(
  unmatchedTests: string[],
  catalog: LabCatalogEntry[]
): Promise<Map<string, ResolvedTest>> {
  const results = new Map<string, ResolvedTest>();
  if (!process.env.OPENAI_API_KEY || catalog.length === 0 || unmatchedTests.length === 0) {
    return results;
  }

  const catalogList = catalog.map((e, i) => `${i}: ${e.raw_name}`).join("\n");
  const testList = unmatchedTests.map((t, i) => `${i}: ${t}`).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a medical laboratory expert. Match each requested test to the best entry in the lab's catalog by medical meaning (abbreviations, synonyms, and descriptions all count).
Return JSON: { "matches": [ { "test_index": number, "catalog_index": number | null, "confidence": number } ] }
Set catalog_index to null if no reasonable match exists (confidence < 0.6). One entry per test.`,
        },
        {
          role: "user",
          content: `Requested tests:\n${testList}\n\nLab catalog:\n${catalogList}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as {
      matches?: Array<{ test_index?: number; catalog_index?: number | null; confidence?: number }>;
    };

    for (const m of parsed.matches ?? []) {
      if (m.catalog_index == null || (m.confidence ?? 0) < 0.6) continue;
      const testName = unmatchedTests[m.test_index ?? -1];
      const entry = catalog[m.catalog_index];
      if (!testName || !entry) continue;
      results.set(testName, {
        ...makeCatalogResult(testName, entry),
        confidence: m.confidence ?? 0.7,
      });
    }
  } catch {
    // non-critical — unmatched tests fall through to others
  }
  return results;
}

// ── Main resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a raw test string into structured results using this lab's catalog.
 * Tests that match the catalog get real prices + Poveon commission.
 * Tests that don't match return unit_price = 0, source = "others".
 */
export async function resolveTests(
  rawTests: string,
  labId: string | null = null
): Promise<ResolvedTest[]> {
  if (!rawTests || rawTests.trim() === "See attached image") return [];

  const items = splitTests(rawTests);
  if (items.length === 0) return [];

  // Load this lab's catalog once
  let labCatalog: LabCatalogEntry[] = [];
  if (labId) {
    labCatalog = await prisma.labOfferedTest.findMany({
      where: { lab_id: labId, is_active: true },
      select: {
        id: true,
        raw_name: true,
        category_label: true,
        synonyms: true,
        lab_price: true,
        poveon_fee: true,
      },
    });
  }

  // Step 0: exact / acronym / token match
  const preMatched = new Map<string, ResolvedTest>();
  const stillUnmatched: string[] = [];
  for (const item of items) {
    const m = labCatalog.length > 0 ? labCatalogMatch(item.trim(), labCatalog) : null;
    if (m) preMatched.set(item.trim(), m);
    else stillUnmatched.push(item.trim());
  }

  // Step 0b: AI batch match for anything still unmatched
  const aiResults =
    labCatalog.length > 0 && stillUnmatched.length > 0
      ? await aiBatchCatalogMatch(stillUnmatched, labCatalog)
      : new Map<string, ResolvedTest>();

  return Promise.all(
    items.map((item) => {
      const norm = item.trim();
      const pre = preMatched.get(norm);
      if (pre) return Promise.resolve(pre);
      const ai = aiResults.get(norm);
      if (ai) return Promise.resolve(ai);
      // Not matched specifically → category/modality fallback, still included.
      return Promise.resolve(fallbackResult(item, labCatalog));
    })
  );
}

/** Total quoted price from a resolved breakdown. */
export function totalFromBreakdown(breakdown: ResolvedTest[]): number {
  return breakdown.reduce((sum, t) => sum + t.unit_price, 0);
}
