import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

// Extend Vercel function timeout to maximum allowed
export const maxDuration = 300;

/**
 * ONE-TIME seed endpoint — runs the test catalog seed on staging.
 * DELETE THIS FILE after seeding is confirmed.
 *
 * Usage:
 *   POST /api/run-seed
 *   Body: { "secret": "poveon-seed" }
 */

const CATEGORIES = [
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
  { name: "X-Ray", slug: "x-ray", sort_order: 19, description: "Plain film radiography — chest, spine, limbs, abdomen" },
  { name: "Ultrasound & Echocardiography", slug: "ultrasound-echocardiography", sort_order: 20, description: "Abdominal, pelvic, obstetric, thyroid, breast, cardiac ultrasound" },
  { name: "CT Scan", slug: "ct-scan", sort_order: 21, description: "Computed tomography — head, chest, abdomen, pelvis, angiography" },
  { name: "MRI", slug: "mri", sort_order: 22, description: "Magnetic resonance imaging — brain, spine, joints, soft tissue" },
  { name: "Nuclear Medicine & PET", slug: "nuclear-medicine-pet", sort_order: 23, description: "PET scan, bone scan, thyroid scintigraphy, SPECT" },
  { name: "Special Imaging", slug: "special-imaging", sort_order: 24, description: "Mammography, DEXA scan, fluoroscopy, HSG, contrast studies" },
];

type AiTest = { name: string; is_rapid_test: boolean; synonyms: string[] };

function buildPrompt(category: { name: string; description: string }): string {
  return `You are a medical laboratory expert working in Nigeria.

Return a JSON array of lab tests for the category "${category.name}" (${category.description}).

Rules:
- Each item must be: { "name": string, "is_rapid_test": boolean, "synonyms": string[] }
- "name" is the canonical full test name, e.g. "Full Blood Count"
- "synonyms" contains common abbreviations and alternative names used in Nigeria and globally
- Include 25–40 tests for large categories, 10–20 for smaller ones
- Do NOT include tests that belong to a different category
- is_rapid_test = true only for rapid antigen/antibody bedside tests
- Return ONLY a valid JSON array, no markdown, no explanation`;
}

async function seedCategory(
  openai: OpenAI,
  cat: (typeof CATEGORIES)[number]
): Promise<{ tests: number; synonyms: number }> {
  const category = await prisma.testCategory.upsert({
    where: { slug: cat.slug },
    create: { name: cat.name, slug: cat.slug, description: cat.description, sort_order: cat.sort_order },
    update: { name: cat.name, description: cat.description, sort_order: cat.sort_order },
  });

  if (cat.slug === "others-uncategorized") return { tests: 0, synonyms: 0 };

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "You are a precise JSON generator for medical lab catalogs." },
      { role: "user", content: buildPrompt(cat) },
    ],
  });

  const raw = response.choices[0].message.content?.trim() ?? "[]";
  const json = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  const tests: AiTest[] = JSON.parse(json);

  let synonymCount = 0;
  for (const t of tests) {
    const catalogTest = await prisma.catalogTest.upsert({
      where: { category_id_canonical_name: { category_id: category.id, canonical_name: t.name } },
      create: { category_id: category.id, canonical_name: t.name, is_rapid_test: t.is_rapid_test ?? false, base_price: 0 },
      update: { is_rapid_test: t.is_rapid_test ?? false },
    });

    const allSynonyms = Array.from(new Set([t.name, ...t.synonyms.filter(Boolean)]));
    for (const syn of allSynonyms) {
      await prisma.testSynonym.upsert({
        where: { catalog_test_id_synonym: { catalog_test_id: catalogTest.id, synonym: syn } },
        create: { catalog_test_id: catalogTest.id, synonym: syn },
        update: {},
      });
      synonymCount++;
    }
  }

  return { tests: tests.length, synonyms: synonymCount };
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== "poveon-seed") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const results: { category: string; tests: number; synonyms: number }[] = [];

  for (const cat of CATEGORIES) {
    try {
      const { tests, synonyms } = await seedCategory(openai, cat);
      results.push({ category: cat.name, tests, synonyms });
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      results.push({ category: cat.name, tests: -1, synonyms: -1 });
      console.error(`Seed failed for ${cat.name}:`, err);
    }
  }

  const totals = await prisma.$transaction([
    prisma.testCategory.count(),
    prisma.catalogTest.count(),
    prisma.testSynonym.count(),
  ]);

  return NextResponse.json({
    success: true,
    results,
    totals: { categories: totals[0], tests: totals[1], synonyms: totals[2] },
  });
}
