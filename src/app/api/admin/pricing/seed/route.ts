import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

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

export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slugs = CATEGORIES.map((c) => c.slug);
  const before = await prisma.testCategory.count({ where: { slug: { in: slugs } } });

  await prisma.$transaction(
    CATEGORIES.map((cat) =>
      prisma.testCategory.upsert({
        where: { slug: cat.slug },
        update: { name: cat.name, description: cat.description, sort_order: cat.sort_order },
        create: { name: cat.name, slug: cat.slug, description: cat.description, sort_order: cat.sort_order },
      })
    )
  );

  const created = CATEGORIES.length - before;
  const existing = before;

  return NextResponse.json({ ok: true, created, existing, total: CATEGORIES.length });
}
