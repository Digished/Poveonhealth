/**
 * Seed the test catalog with 24 categories and their tests + synonyms.
 *
 * Uses GPT-4o-mini to generate realistic Nigerian lab test names and
 * common abbreviations for each category.
 *
 * Safe to re-run: upserts categories and tests, never creates duplicates.
 *
 * Usage:
 *   npx ts-node --project tsconfig.seed.json prisma/seed-tests.ts
 *   (or add "seed": "ts-node ..." to package.json scripts)
 */

import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── 24 categories ─────────────────────────────────────────────────────────────

const CATEGORIES: {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
}[] = [
  // Clinical
  { name: "Hematology", slug: "hematology", sort_order: 1, description: "Blood cell counts, morphology, and related indices" },
  { name: "Coagulation & Haemostasis", slug: "coagulation-haemostasis", sort_order: 2, description: "Clotting factors, bleeding time, INR, D-dimer" },
  { name: "Clinical Chemistry & Biochemistry", slug: "clinical-chemistry-biochemistry", sort_order: 3, description: "Metabolic panels, electrolytes, renal and liver function, lipids, glucose" },
  { name: "Endocrinology & Hormones", slug: "endocrinology-hormones", sort_order: 4, description: "Thyroid, pituitary, adrenal, reproductive, and pancreatic hormones" },
  { name: "Immunology & Autoimmune", slug: "immunology-autoimmune", sort_order: 5, description: "Autoantibodies, complement, immunoglobulins, allergy panels" },
  { name: "Tumour Markers & Oncology", slug: "tumour-markers-oncology", sort_order: 6, description: "PSA, CEA, AFP, CA-125, CA 19-9, and other cancer markers" },
  { name: "Virology & Serology", slug: "virology-serology", sort_order: 7, description: "HIV, hepatitis, dengue, EBV, CMV, TORCH, syphilis serology" },
  { name: "Microbiology & Culture", slug: "microbiology-culture", sort_order: 8, description: "Cultures and sensitivity, gram stain, malaria microscopy" },
  { name: "TB & Mycobacteriology", slug: "tb-mycobacteriology", sort_order: 9, description: "AFB smear, GeneXpert, TB culture, Mantoux, IGRA" },
  { name: "Parasitology", slug: "parasitology", sort_order: 10, description: "Malaria RDT/film, filariasis, toxoplasmosis, intestinal parasites" },
  { name: "Molecular & Genetic Diagnostics", slug: "molecular-genetic-diagnostics", sort_order: 11, description: "PCR, viral load, DNA/RNA testing, cytogenetics" },
  { name: "Urinalysis", slug: "urinalysis", sort_order: 12, description: "Urine dipstick, microscopy, protein, culture" },
  { name: "Stool & Faecal Tests", slug: "stool-faecal-tests", sort_order: 13, description: "Stool microscopy, culture, occult blood, H. pylori antigen" },
  { name: "Body Fluids Analysis", slug: "body-fluids-analysis", sort_order: 14, description: "CSF, pleural, pericardial, peritoneal, and synovial fluid analysis" },
  { name: "Histopathology & Cytology", slug: "histopathology-cytology", sort_order: 15, description: "Biopsies, FNAC, Pap smear, HPV, cytology" },
  { name: "Blood Banking & Transfusion", slug: "blood-banking-transfusion", sort_order: 16, description: "Blood grouping, crossmatch, Coombs test, antibody screen" },
  { name: "Toxicology & Drug Testing", slug: "toxicology-drug-testing", sort_order: 17, description: "Drug screens, therapeutic drug monitoring, heavy metals, alcohol" },
  { name: "Others / Uncategorized", slug: "others-uncategorized", sort_order: 18, description: "Catch-all for tests that do not fit any specific category" },
  // Imaging
  { name: "X-Ray", slug: "x-ray", sort_order: 19, description: "Plain film radiography — chest, spine, limbs, abdomen" },
  { name: "Ultrasound & Echocardiography", slug: "ultrasound-echocardiography", sort_order: 20, description: "Abdominal, pelvic, obstetric, thyroid, breast, cardiac ultrasound" },
  { name: "CT Scan", slug: "ct-scan", sort_order: 21, description: "Computed tomography — head, chest, abdomen, pelvis, angiography" },
  { name: "MRI", slug: "mri", sort_order: 22, description: "Magnetic resonance imaging — brain, spine, joints, soft tissue" },
  { name: "Nuclear Medicine & PET", slug: "nuclear-medicine-pet", sort_order: 23, description: "PET scan, bone scan, thyroid scintigraphy, SPECT" },
  { name: "Special Imaging", slug: "special-imaging", sort_order: 24, description: "Mammography, DEXA scan, fluoroscopy, HSG, contrast studies" },
];

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(category: { name: string; description: string }): string {
  return `You are a medical laboratory expert working in Nigeria.

Return a JSON array of lab tests for the category "${category.name}" (${category.description}).

Rules:
- Each item must be: { "name": string, "is_rapid_test": boolean, "synonyms": string[] }
- "name" is the canonical full test name, e.g. "Full Blood Count"
- "synonyms" contains common abbreviations and alternative names used in Nigeria and globally, e.g. ["FBC", "CBC", "Haemogram", "Complete Blood Count"]
- Include 25–40 tests for large categories, 10–20 for smaller ones
- Do NOT include tests that belong to a different category listed below
- is_rapid_test = true only for rapid antigen/antibody bedside tests (e.g. malaria RDT, rapid strep, rapid HIV)
- Return ONLY a valid JSON array, no markdown, no explanation

Other categories (do not include their tests here):
Hematology, Coagulation & Haemostasis, Clinical Chemistry & Biochemistry, Endocrinology & Hormones,
Immunology & Autoimmune, Tumour Markers & Oncology, Virology & Serology, Microbiology & Culture,
TB & Mycobacteriology, Parasitology, Molecular & Genetic Diagnostics, Urinalysis, Stool & Faecal Tests,
Body Fluids Analysis, Histopathology & Cytology, Blood Banking & Transfusion, Toxicology & Drug Testing,
Others / Uncategorized, X-Ray, Ultrasound & Echocardiography, CT Scan, MRI, Nuclear Medicine & PET, Special Imaging`;
}

// ── AI call ───────────────────────────────────────────────────────────────────

type AiTest = {
  name: string;
  is_rapid_test: boolean;
  synonyms: string[];
};

async function fetchTestsForCategory(category: { name: string; description: string }): Promise<AiTest[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "You are a precise JSON generator for medical lab catalogs." },
      { role: "user", content: buildPrompt(category) },
    ],
  });

  const raw = response.choices[0].message.content?.trim() ?? "[]";
  // Strip markdown code fences if present
  const json = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  return JSON.parse(json) as AiTest[];
}

// ── Seed logic ────────────────────────────────────────────────────────────────

async function seedCategory(cat: (typeof CATEGORIES)[number]) {
  // Upsert the category
  const category = await prisma.testCategory.upsert({
    where: { slug: cat.slug },
    create: { name: cat.name, slug: cat.slug, description: cat.description, sort_order: cat.sort_order },
    update: { name: cat.name, description: cat.description, sort_order: cat.sort_order },
  });

  console.log(`\n[${cat.sort_order}/24] ${cat.name} (id: ${category.id})`);

  // Skip AI call for catch-all category
  if (cat.slug === "others-uncategorized") {
    console.log("  → catch-all, no tests to seed");
    return;
  }

  let tests: AiTest[];
  try {
    tests = await fetchTestsForCategory(cat);
  } catch (err) {
    console.error(`  ✗ AI call failed for ${cat.name}:`, err);
    return;
  }

  console.log(`  → ${tests.length} tests received`);

  for (const t of tests) {
    // Upsert the catalog test
    const catalogTest = await prisma.catalogTest.upsert({
      where: { category_id_canonical_name: { category_id: category.id, canonical_name: t.name } },
      create: {
        category_id: category.id,
        canonical_name: t.name,
        is_rapid_test: t.is_rapid_test ?? false,
        base_price: 0,
      },
      update: { is_rapid_test: t.is_rapid_test ?? false },
    });

    // Build synonym list: always include the canonical name itself
    const allSynonyms = Array.from(
      new Set([t.name, ...t.synonyms.filter((s) => s && s.trim())])
    );

    // Upsert each synonym individually (ignore conflicts on same test+synonym)
    for (const syn of allSynonyms) {
      await prisma.testSynonym.upsert({
        where: { catalog_test_id_synonym: { catalog_test_id: catalogTest.id, synonym: syn } },
        create: { catalog_test_id: catalogTest.id, synonym: syn },
        update: {},
      });
    }
  }

  console.log(`  ✓ seeded`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Starting test catalog seed...\n");
  console.log(`Categories: ${CATEGORIES.length}`);
  console.log("Model: gpt-4o-mini\n");

  for (const cat of CATEGORIES) {
    await seedCategory(cat);
    // Small delay to avoid rate-limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  const totals = await prisma.$transaction([
    prisma.testCategory.count(),
    prisma.catalogTest.count(),
    prisma.testSynonym.count(),
  ]);

  console.log("\n── Seed complete ─────────────────────────────────────────────");
  console.log(`  Categories : ${totals[0]}`);
  console.log(`  Tests      : ${totals[1]}`);
  console.log(`  Synonyms   : ${totals[2]}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
