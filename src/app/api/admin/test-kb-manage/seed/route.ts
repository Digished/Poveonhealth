export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const SEED_TESTS = [
  // Hematology
  {
    canonical_name: "Full Blood Count",
    synonyms: ["FBC", "CBC", "Complete Blood Count", "Hemogram", "Full Hemogram", "Blood Count"],
    variants: [],
    category: "Hematology",
  },
  {
    canonical_name: "Erythrocyte Sedimentation Rate",
    synonyms: ["ESR", "ESR Test", "Sedimentation Rate"],
    variants: [],
    category: "Hematology",
  },
  {
    canonical_name: "Packed Cell Volume",
    synonyms: ["PCV", "Hematocrit", "HCT"],
    variants: [],
    category: "Hematology",
  },
  {
    canonical_name: "Blood Film",
    synonyms: ["Peripheral Blood Film", "Smear", "Blood Smear"],
    variants: [],
    category: "Hematology",
  },
  // Biochemistry
  {
    canonical_name: "Liver Function Test",
    synonyms: ["LFT", "Liver Function Tests", "Hepatic Function Test"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Renal Function Test",
    synonyms: ["RFT", "Kidney Function Test", "Renal Profile"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Lipid Profile",
    synonyms: ["Lipid Panel", "Cholesterol Test", "Lipids"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Random Blood Sugar",
    synonyms: ["RBS", "Blood Glucose", "Blood Sugar"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Fasting Blood Sugar",
    synonyms: ["FBS", "Fasting Glucose"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "HbA1c",
    synonyms: ["Hemoglobin A1c", "Glycated Hemoglobin", "Glycosylated Hemoglobin"],
    variants: [],
    category: "Biochemistry",
  },
  // Serology
  {
    canonical_name: "Widal Test",
    synonyms: ["Widal Reaction", "Widal Agglutination"],
    variants: [],
    category: "Serology",
  },
  {
    canonical_name: "Blood Group and Typing",
    synonyms: ["ABO Typing", "Blood Typing", "Cross Match"],
    variants: [],
    category: "Serology",
  },
  {
    canonical_name: "Rapid Plasma Reagin",
    synonyms: ["RPR", "VDRL", "Syphilis Test"],
    variants: [],
    category: "Serology",
  },
  // Microbiology
  {
    canonical_name: "Blood Culture",
    synonyms: ["Culture Blood", "Sepsis Culture"],
    variants: [],
    category: "Microbiology",
  },
  {
    canonical_name: "Urine Culture",
    synonyms: ["Urine Sensitivity", "Urine C&S"],
    variants: [],
    category: "Microbiology",
  },
  {
    canonical_name: "Stool Culture",
    synonyms: ["Stool C&S"],
    variants: [],
    category: "Microbiology",
  },
  // Imaging
  {
    canonical_name: "Chest X-ray",
    synonyms: ["CXR", "Chest Radiograph", "Chest Imaging"],
    variants: [],
    category: "Imaging",
  },
  {
    canonical_name: "Abdominal X-ray",
    synonyms: ["Abd X-ray", "Abdominal Radiograph"],
    variants: [],
    category: "Imaging",
  },
  {
    canonical_name: "Breast MRI",
    synonyms: ["MRI Breast"],
    variants: ["1.5T", "3T", "with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Brain CT",
    synonyms: ["CT Brain", "Cranial CT"],
    variants: ["with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Abdominal Ultrasound",
    synonyms: ["Abdominal USG", "Abdomen Ultrasound"],
    variants: [],
    category: "Imaging",
  },
  // Cardiology
  {
    canonical_name: "Electrocardiogram",
    synonyms: ["ECG", "EKG", "12-lead ECG"],
    variants: [],
    category: "Cardiology",
  },
  {
    canonical_name: "Echocardiogram",
    synonyms: ["Echo", "Cardiac Echo", "Heart Ultrasound"],
    variants: [],
    category: "Cardiology",
  },
  {
    canonical_name: "Stress ECG",
    synonyms: ["Treadmill Test", "Exercise ECG"],
    variants: [],
    category: "Cardiology",
  },
];

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { action } = await req.json();

    if (action === "seed") {
      let created = 0;
      let skipped = 0;

      for (const test of SEED_TESTS) {
        const existing = await prisma.testKnowledgeBase.findUnique({
          where: { canonical_name: test.canonical_name },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.testKnowledgeBase.create({
          data: {
            canonical_name: test.canonical_name,
            synonyms: test.synonyms,
            variants: test.variants,
            category: test.category,
            is_active: true,
          },
        });

        created++;
      }

      console.log(`[KB Seed] Created ${created} tests, skipped ${skipped} existing`);

      return NextResponse.json({
        success: true,
        message: `Seeded ${created} tests, ${skipped} already existed`,
        created,
        skipped,
        total: SEED_TESTS.length,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[KB Seed] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to seed KB" },
      { status: 500 }
    );
  }
}
