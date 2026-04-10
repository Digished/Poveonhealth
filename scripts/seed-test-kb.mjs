#!/usr/bin/env node
/**
 * Seed the Test Knowledge Base with common medical tests, synonyms, and variants
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const testsData = [
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
    canonical_name: "Urea and Electrolytes",
    synonyms: ["U&E", "Electrolytes", "Serum Electrolytes"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Blood Glucose",
    synonyms: ["Glucose", "Fasting Glucose", "Random Blood Sugar", "RBS", "FBS"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "HbA1c",
    synonyms: ["Hemoglobin A1c", "Glycated Hemoglobin"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Lipid Profile",
    synonyms: ["Cholesterol Panel", "Lipids", "Serum Lipids"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Albumin",
    synonyms: ["Serum Albumin"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Total Protein",
    synonyms: ["Serum Protein", "Total Serum Protein"],
    variants: [],
    category: "Biochemistry",
  },
  {
    canonical_name: "Bilirubin",
    synonyms: ["Total Bilirubin", "Direct Bilirubin", "Serum Bilirubin"],
    variants: [],
    category: "Biochemistry",
  },

  // Microbiology
  {
    canonical_name: "Microscopy, Culture & Sensitivity",
    synonyms: ["M/C/S", "MCS", "Culture and Sensitivity", "Gram Stain"],
    variants: ["Sputum", "Urine", "Stool", "Blood", "CSF", "Wound"],
    category: "Microbiology",
  },
  {
    canonical_name: "Sputum Examination",
    synonyms: ["Sputum Test", "Sputum Smear"],
    variants: [],
    category: "Microbiology",
  },
  {
    canonical_name: "Stool Test",
    synonyms: ["Fecal Examination", "Stool Examination", "Stool Culture"],
    variants: [],
    category: "Microbiology",
  },
  {
    canonical_name: "Urine Culture",
    synonyms: ["Urine M/C/S", "Urine Microscopy"],
    variants: [],
    category: "Microbiology",
  },
  {
    canonical_name: "Blood Culture",
    synonyms: ["Culture", "Septic Screen"],
    variants: [],
    category: "Microbiology",
  },
  {
    canonical_name: "WIDAL Test",
    synonyms: ["Widal", "Salmonella Test"],
    variants: [],
    category: "Microbiology",
  },

  // Serology
  {
    canonical_name: "HIV Test",
    synonyms: ["HIV Antibody", "HIV Screening", "HIV 1/2"],
    variants: [],
    category: "Serology",
  },
  {
    canonical_name: "Hepatitis B Surface Antigen",
    synonyms: ["HBsAg", "Hepatitis B", "HBV Antigen"],
    variants: [],
    category: "Serology",
  },
  {
    canonical_name: "Hepatitis C Antibody",
    synonyms: ["HCV Antibody", "Hepatitis C", "Anti-HCV"],
    variants: [],
    category: "Serology",
  },
  {
    canonical_name: "Malaria Test",
    synonyms: ["Malaria Antigen", "RDT", "Malaria Rapid Test"],
    variants: [],
    category: "Serology",
  },
  {
    canonical_name: "Typhoid Test",
    synonyms: ["Typhoid Antibody", "Enteric Fever"],
    variants: [],
    category: "Serology",
  },

  // Imaging
  {
    canonical_name: "Chest X-Ray",
    synonyms: ["CXR", "Chest Radiograph", "X-Ray Chest", "Thoracic X-Ray"],
    variants: ["PA", "Lateral", "AP"],
    category: "Imaging",
  },
  {
    canonical_name: "Computed Tomography Brain",
    synonyms: ["CT Brain", "CT Head", "Brain CT", "Cranial CT"],
    variants: ["with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Computed Tomography Abdomen",
    synonyms: ["CT Abdomen", "CT Abdominal", "Abdominal CT"],
    variants: ["with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Abdominal Ultrasound",
    synonyms: ["Abdomen Ultrasound", "Abdominal Sonography", "Ultrasound Abdomen"],
    variants: [],
    category: "Imaging",
  },
  {
    canonical_name: "Breast Ultrasound",
    synonyms: ["Ultrasound Breast", "Breast Sonography"],
    variants: [],
    category: "Imaging",
  },
  {
    canonical_name: "Breast MRI",
    synonyms: ["Breast Magnetic Resonance Imaging", "MRI Breast"],
    variants: ["1.5T", "3T", "with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Brain MRI",
    synonyms: ["MRI Brain", "Cranial MRI", "Brain Magnetic Resonance Imaging"],
    variants: ["1.5T", "3T", "with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Spine MRI",
    synonyms: ["MRI Spine", "Vertebral MRI"],
    variants: ["1.5T", "3T", "with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Abdominal CT",
    synonyms: ["CT Abdomen", "Abdominal Computed Tomography"],
    variants: ["with contrast", "without contrast"],
    category: "Imaging",
  },
  {
    canonical_name: "Pelvic Ultrasound",
    synonyms: ["Pelvis Ultrasound", "Ultrasound Pelvis", "Pelvic Sonography"],
    variants: ["Transabdominal", "Transvaginal"],
    category: "Imaging",
  },
  {
    canonical_name: "Thyroid Ultrasound",
    synonyms: ["Ultrasound Thyroid", "Thyroid Sonography"],
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
    canonical_name: "Echocardiography",
    synonyms: ["Echo", "2D Echo", "Transthoracic Echo"],
    variants: [],
    category: "Cardiology",
  },

  // Urinalysis
  {
    canonical_name: "Urinalysis",
    synonyms: ["Urine Test", "Urine Routine", "UA"],
    variants: [],
    category: "Urinalysis",
  },

  // Immunology
  {
    canonical_name: "PSA Test",
    synonyms: ["Prostate Specific Antigen", "PSA"],
    variants: [],
    category: "Immunology",
  },
  {
    canonical_name: "CEA Test",
    synonyms: ["Carcinoembryonic Antigen", "CEA"],
    variants: [],
    category: "Immunology",
  },
  {
    canonical_name: "CA-125",
    synonyms: ["Cancer Antigen 125"],
    variants: [],
    category: "Immunology",
  },

  // Coagulation
  {
    canonical_name: "Prothrombin Time",
    synonyms: ["PT", "INR", "International Normalized Ratio"],
    variants: [],
    category: "Coagulation",
  },
  {
    canonical_name: "Activated Partial Thromboplastin Time",
    synonyms: ["aPTT", "APTT", "PTT"],
    variants: [],
    category: "Coagulation",
  },
  {
    canonical_name: "Platelet Count",
    synonyms: ["Platelets", "Thrombocyte Count"],
    variants: [],
    category: "Coagulation",
  },

  // Thyroid Function
  {
    canonical_name: "Thyroid Stimulating Hormone",
    synonyms: ["TSH", "Thyroid Hormone"],
    variants: [],
    category: "Endocrinology",
  },
  {
    canonical_name: "Free Thyroxine",
    synonyms: ["Free T4", "FT4"],
    variants: [],
    category: "Endocrinology",
  },
  {
    canonical_name: "Free Triiodothyronine",
    synonyms: ["Free T3", "FT3"],
    variants: [],
    category: "Endocrinology",
  },

  // Allergy & Immunology
  {
    canonical_name: "Immunoglobulin E",
    synonyms: ["IgE", "Total IgE"],
    variants: [],
    category: "Allergy",
  },

  // Gastroenterology
  {
    canonical_name: "Fecal Occult Blood Test",
    synonyms: ["FOBT", "Stool Occult Blood"],
    variants: [],
    category: "Gastroenterology",
  },

  // Rheumatology
  {
    canonical_name: "Rheumatoid Factor",
    synonyms: ["RF", "Rheumatoid Antibody"],
    variants: [],
    category: "Rheumatology",
  },
  {
    canonical_name: "Anti-Nuclear Antibody",
    synonyms: ["ANA", "Antinuclear Antibody"],
    variants: [],
    category: "Rheumatology",
  },

  // Pulmonary
  {
    canonical_name: "Spirometry",
    synonyms: ["Pulmonary Function Test", "PFT"],
    variants: [],
    category: "Pulmonology",
  },

  // General
  {
    canonical_name: "General Health Checkup",
    synonyms: ["Health Screening", "Physical Examination"],
    variants: [],
    category: "General",
  },
];

async function seedTestKB() {
  console.log("🌱 Seeding Test Knowledge Base...");

  let created = 0;
  let skipped = 0;

  for (const test of testsData) {
    try {
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
        },
      });

      created++;
      console.log(`✓ Created: ${test.canonical_name}`);
    } catch (error) {
      console.error(`✗ Error creating ${test.canonical_name}:`, error.message);
    }
  }

  console.log(`\n✅ Seed complete: ${created} created, ${skipped} skipped`);
  await prisma.$disconnect();
}

seedTestKB().catch((error) => {
  console.error("💥 Seed failed:", error);
  process.exit(1);
});
