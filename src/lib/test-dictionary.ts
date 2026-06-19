/**
 * Built-in laboratory-test dictionary + a greedy text segmenter.
 *
 * Purpose: separate the individual tests out of a doctor's free-typed Fast Mode
 * input EVEN WHEN there are no commas ("fbc mp widal lft" → 4 tests). It works
 * by greedily matching the longest run of words against a normalized index built
 * from (a) this curated dictionary of common Nigerian/general lab tests and
 * (b) the selected lab's own catalogue (which overrides the dictionary and
 * carries the catalogue id + price downstream).
 *
 * This module is isomorphic — used both client-side (live detection in the
 * composer) and server-side (the segment endpoint and the create route).
 */

export type TestDictEntry = { canonical: string; aliases: string[] };

/**
 * Curated common tests. `canonical` is the label shown on the chip and stored;
 * `aliases` are the spellings/abbreviations a doctor might type. Keep aliases
 * unambiguous — avoid bare 2-letter tokens that collide with clinical shorthand
 * (e.g. "ca", "mg", "pt" alone).
 */
export const TEST_DICTIONARY: TestDictEntry[] = [
  { canonical: "Full Blood Count (FBC)", aliases: ["fbc", "full blood count", "cbc", "complete blood count", "fbc/diff", "fbc diff", "haemogram", "hemogram"] },
  { canonical: "Malaria Parasite (MP)", aliases: ["mp", "mps", "malaria parasite", "malaria parasites", "malaria", "blood film for malaria", "thick film", "malaria rdt", "mrdt", "bf for mps"] },
  { canonical: "Widal Test", aliases: ["widal", "widal test", "typhoid test", "febrile antigen", "febrile antigens"] },
  { canonical: "Liver Function Test (LFT)", aliases: ["lft", "lfts", "liver function", "liver function test", "liver function tests"] },
  { canonical: "Renal Function Test (RFT)", aliases: ["rft", "renal function", "renal function test", "kidney function test", "kft"] },
  { canonical: "Urea, Electrolytes & Creatinine (U/E/Cr)", aliases: ["u/e/cr", "uecr", "e/u/cr", "eucr", "u/e", "u/e/c", "urea and electrolytes", "urea electrolytes creatinine", "urea creatinine electrolytes", "electrolyte urea creatinine", "urea electrolyte"] },
  { canonical: "Packed Cell Volume (PCV)", aliases: ["pcv", "packed cell volume", "haematocrit", "hematocrit", "hct"] },
  { canonical: "Erythrocyte Sedimentation Rate (ESR)", aliases: ["esr", "sed rate", "erythrocyte sedimentation rate"] },
  { canonical: "Random Blood Sugar (RBS)", aliases: ["rbs", "random blood sugar", "random blood glucose"] },
  { canonical: "Fasting Blood Sugar (FBS)", aliases: ["fbs", "fasting blood sugar", "fasting blood glucose"] },
  { canonical: "2-Hour Postprandial Glucose", aliases: ["2hpp", "2 hour postprandial", "post prandial glucose", "ppbs"] },
  { canonical: "HbA1c", aliases: ["hba1c", "hb a1c", "glycated haemoglobin", "glycosylated haemoglobin"] },
  { canonical: "Fasting Lipid Profile", aliases: ["lipid profile", "lipids", "fasting lipid profile", "lipid panel"] },
  { canonical: "Total Cholesterol", aliases: ["cholesterol", "total cholesterol"] },
  { canonical: "Triglycerides", aliases: ["triglycerides", "trig"] },
  { canonical: "HDL Cholesterol", aliases: ["hdl", "hdl cholesterol"] },
  { canonical: "LDL Cholesterol", aliases: ["ldl", "ldl cholesterol"] },
  { canonical: "Prostate Specific Antigen (PSA)", aliases: ["psa", "prostate specific antigen", "total psa"] },
  { canonical: "HIV Screening", aliases: ["hiv", "rvs", "retroviral screening", "hiv screening", "hiv test", "hiv 1&2", "hiv i&ii"] },
  { canonical: "Hepatitis B Surface Antigen (HBsAg)", aliases: ["hbsag", "hepatitis b", "hep b", "hbs ag", "australia antigen"] },
  { canonical: "Hepatitis C Virus (HCV)", aliases: ["hcv", "hepatitis c", "hep c", "anti-hcv", "anti hcv"] },
  { canonical: "Urinalysis", aliases: ["urinalysis", "urine analysis", "urine r/e", "urine routine", "urine dipstick", "urine m/e"] },
  { canonical: "Urine Microscopy, Culture & Sensitivity (m/c/s)", aliases: ["urine mcs", "urine m/c/s", "urine culture", "urine microscopy culture sensitivity", "urine c/s"] },
  { canonical: "Stool Microscopy, Culture & Sensitivity (m/c/s)", aliases: ["stool mcs", "stool m/c/s", "stool culture", "stool microscopy", "stool r/e", "stool analysis"] },
  { canonical: "Stool Occult Blood", aliases: ["occult blood", "stool occult blood", "fobt", "faecal occult blood"] },
  { canonical: "Blood Group & Rhesus", aliases: ["blood group", "abo grouping", "group and rhesus", "blood group and rhesus", "abo and rhesus"] },
  { canonical: "Haemoglobin Genotype", aliases: ["genotype", "hb genotype", "haemoglobin genotype", "hb electrophoresis"] },
  { canonical: "Sickling Test", aliases: ["sickling", "sickling test", "sickle cell test"] },
  { canonical: "Thyroid Function Test (TFT)", aliases: ["tft", "thyroid function", "thyroid function test"] },
  { canonical: "Thyroid Stimulating Hormone (TSH)", aliases: ["tsh", "thyroid stimulating hormone"] },
  { canonical: "Free T4 (FT4)", aliases: ["ft4", "free t4"] },
  { canonical: "Free T3 (FT3)", aliases: ["ft3", "free t3"] },
  { canonical: "Serum Electrolytes", aliases: ["electrolytes", "serum electrolytes"] },
  { canonical: "Serum Creatinine", aliases: ["creatinine", "serum creatinine"] },
  { canonical: "Blood Urea", aliases: ["urea", "blood urea", "bun", "blood urea nitrogen"] },
  { canonical: "Uric Acid", aliases: ["uric acid", "serum uric acid"] },
  { canonical: "C-Reactive Protein (CRP)", aliases: ["crp", "c-reactive protein", "c reactive protein"] },
  { canonical: "Prothrombin Time (PT/INR)", aliases: ["pt/inr", "inr", "prothrombin time", "pt inr"] },
  { canonical: "Activated Partial Thromboplastin Time (APTT)", aliases: ["aptt", "partial thromboplastin time"] },
  { canonical: "D-Dimer", aliases: ["d-dimer", "d dimer", "ddimer"] },
  { canonical: "Pregnancy Test (β-hCG)", aliases: ["bhcg", "beta hcg", "pregnancy test", "urine pregnancy test", "upt", "serum pregnancy test", "b-hcg"] },
  { canonical: "Vitamin D (25-OH)", aliases: ["vitamin d", "vit d", "25-oh vitamin d", "25 oh vit d"] },
  { canonical: "Vitamin B12", aliases: ["vitamin b12", "vit b12", "b12"] },
  { canonical: "Serum Calcium", aliases: ["calcium", "serum calcium"] },
  { canonical: "Serum Magnesium", aliases: ["magnesium", "serum magnesium"] },
  { canonical: "Serum Phosphate", aliases: ["phosphate", "serum phosphate"] },
  { canonical: "Ferritin", aliases: ["ferritin", "serum ferritin"] },
  { canonical: "Iron Studies", aliases: ["iron studies", "serum iron", "tibc"] },
  { canonical: "Folate", aliases: ["folate", "serum folate", "folic acid"] },
  { canonical: "Alanine Aminotransferase (ALT/SGPT)", aliases: ["alt", "sgpt"] },
  { canonical: "Aspartate Aminotransferase (AST/SGOT)", aliases: ["ast", "sgot"] },
  { canonical: "Alkaline Phosphatase (ALP)", aliases: ["alp", "alkaline phosphatase"] },
  { canonical: "Serum Bilirubin", aliases: ["bilirubin", "total bilirubin", "serum bilirubin"] },
  { canonical: "Serum Albumin", aliases: ["albumin", "serum albumin"] },
  { canonical: "Total Protein", aliases: ["total protein", "serum protein"] },
  { canonical: "Serum Amylase", aliases: ["amylase", "serum amylase"] },
  { canonical: "Serum Lipase", aliases: ["lipase", "serum lipase"] },
  { canonical: "Troponin I", aliases: ["troponin", "troponin i", "trop i", "hs-troponin"] },
  { canonical: "Semen Analysis", aliases: ["semen analysis", "seminal fluid analysis", "sfa", "sperm count", "seminal fluid"] },
  { canonical: "High Vaginal Swab (m/c/s)", aliases: ["hvs", "high vaginal swab", "hvs mcs", "hvs m/c/s"] },
  { canonical: "Pap Smear", aliases: ["pap smear", "cervical smear"] },
  { canonical: "Blood Culture & Sensitivity", aliases: ["blood culture", "blood c/s", "blood mcs", "blood culture and sensitivity"] },
  { canonical: "Wound Swab (m/c/s)", aliases: ["wound swab", "wound mcs", "wound c/s"] },
  { canonical: "Throat Swab (m/c/s)", aliases: ["throat swab", "throat mcs"] },
  { canonical: "Rheumatoid Factor (RF)", aliases: ["rheumatoid factor"] },
  { canonical: "ASO Titre", aliases: ["aso", "aso titre", "antistreptolysin o"] },
  { canonical: "VDRL (Syphilis)", aliases: ["vdrl", "syphilis", "rpr", "treponemal test"] },
  { canonical: "CD4 Count", aliases: ["cd4", "cd4 count"] },
  { canonical: "HIV Viral Load", aliases: ["viral load", "hiv viral load"] },
  { canonical: "Sputum AFB", aliases: ["afb", "sputum afb", "acid fast bacilli", "sputum for afb", "zn stain"] },
  { canonical: "GeneXpert (MTB/RIF)", aliases: ["genexpert", "gene xpert", "mtb/rif", "tb genexpert"] },
  { canonical: "Mantoux Test", aliases: ["mantoux", "tuberculin test", "ppd"] },
  { canonical: "Microfilaria", aliases: ["microfilaria", "filaria"] },
  { canonical: "Erythropoietin", aliases: ["erythropoietin", "epo level"] },
];

// ── Index ────────────────────────────────────────────────────────────────────

export type CatalogLite = { id: string; name: string; synonyms?: string[] };

export type DetectedTest = {
  /** Display/canonical name shown on the chip and stored. */
  name: string;
  /** Lab catalogue id when matched against the lab's own catalogue, else null. */
  catalog_test_id: string | null;
  source: "catalog" | "abbrev";
  /** The exact text the doctor typed that produced this match. */
  raw: string;
};

type IndexEntry = { name: string; id: string | null; source: "catalog" | "abbrev" };
export type TestIndex = { map: Map<string, IndexEntry>; maxWords: number };

/** Normalize for matching: lowercase, drop everything but [a-z0-9]. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Build the alias→entry index. The dictionary is added first; the lab catalogue
 * is added second so a catalogued test (with its id) wins over a dictionary
 * entry for the same alias.
 */
export function buildTestIndex(catalog: CatalogLite[] = []): TestIndex {
  const map = new Map<string, IndexEntry>();
  let maxWords = 1;

  const add = (alias: string, entry: IndexEntry) => {
    const key = norm(alias);
    if (key.length < 2) return; // ignore single chars — too ambiguous
    const existing = map.get(key);
    // Don't let a dictionary alias clobber a catalogue match.
    if (existing && existing.source === "catalog" && entry.source !== "catalog") return;
    map.set(key, entry);
    const words = alias.trim().split(/\s+/).length;
    if (words > maxWords) maxWords = words;
  };

  for (const d of TEST_DICTIONARY) {
    add(d.canonical, { name: d.canonical, id: null, source: "abbrev" });
    for (const a of d.aliases) add(a, { name: d.canonical, id: null, source: "abbrev" });
  }
  for (const c of catalog) {
    if (!c.name) continue;
    add(c.name, { name: c.name, id: c.id, source: "catalog" });
    for (const s of c.synonyms ?? []) if (typeof s === "string") add(s, { name: c.name, id: c.id, source: "catalog" });
  }

  return { map, maxWords: Math.min(maxWords, 6) };
}

// ── Detection ────────────────────────────────────────────────────────────────

// Chunk separators: commas, semicolons, slashes, newlines, "and", "plus", & +.
const CHUNK_SPLIT_RE = /[,;\n]|\band\b|\bplus\b|&|\+/gi;

// Words that mark the start of a clinical/diagnosis clause rather than a test,
// so e.g. "query typhoid" / "rule out malaria" aren't chipped as tests.
const CLINICAL_PRECEDERS = new Set([
  "query", "queries", "ro", "rule", "out", "ruleout", "suspected", "suspect",
  "impression", "dx", "indication", "?",
]);

/**
 * Greedily segment `text` into recognised tests using `index`. Within each
 * separator-delimited chunk it matches the longest run of words it can, so
 * space-separated tests with no commas are still split apart.
 *
 * Returns the detected tests (deduped by canonical name, in order) plus the
 * leftover `remainder` text (patient details / clinical notes that didn't match
 * any test) — used server-side to decide whether a patient-details parse is
 * still needed.
 */
export function detectTests(text: string, index: TestIndex): { tests: DetectedTest[]; remainder: string } {
  const tests: DetectedTest[] = [];
  const seen = new Set<string>();
  const remainderParts: string[] = [];

  for (const chunk of text.split(CHUNK_SPLIT_RE)) {
    const tokens = (chunk ?? "").trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < tokens.length) {
      // Skip (as remainder) anything that opens a clinical clause.
      const prev = i > 0 ? norm(tokens[i - 1]) : "";
      const startsClinical = tokens[i].startsWith("?") || CLINICAL_PRECEDERS.has(prev);

      let match: { entry: IndexEntry; raw: string; next: number } | null = null;
      const maxJ = Math.min(tokens.length, i + index.maxWords);
      for (let j = maxJ; j > i; j--) {
        const windowTokens = tokens.slice(i, j);
        const entry = index.map.get(norm(windowTokens.join(" ")));
        if (entry) { match = { entry, raw: windowTokens.join(" "), next: j }; break; }
      }

      if (match && !startsClinical) {
        const key = match.entry.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tests.push({ name: match.entry.name, catalog_test_id: match.entry.id, source: match.entry.source, raw: match.raw });
        }
        i = match.next;
      } else {
        remainderParts.push(tokens[i]);
        i++;
      }
    }
  }

  return { tests, remainder: remainderParts.join(" ").trim() };
}
