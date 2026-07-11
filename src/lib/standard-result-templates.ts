/**
 * Curated, ready-to-use result-report templates seeded into a lab's catalog.
 * Reference ranges are typical adult values and should be reviewed/adjusted by
 * each lab to match its own analysers and population.
 */
export interface StandardTemplate {
  name: string;
  department: string;
  parameters: { name: string; unit?: string; reference_range?: string; group?: string }[];
}

export const STANDARD_RESULT_TEMPLATES: StandardTemplate[] = [
  {
    name: "Full Blood Count (FBC)",
    department: "Hematology",
    parameters: [
      { name: "Haemoglobin (Hb)", unit: "g/dL", reference_range: "M 13.0–17.0 / F 12.0–15.0" },
      { name: "PCV / Haematocrit", unit: "%", reference_range: "M 40–52 / F 36–46" },
      { name: "Red Cell Count (RBC)", unit: "x10¹²/L", reference_range: "M 4.5–6.5 / F 3.8–5.8" },
      { name: "MCV", unit: "fL", reference_range: "80–100" },
      { name: "MCH", unit: "pg", reference_range: "27–32" },
      { name: "MCHC", unit: "g/dL", reference_range: "32–36" },
      { name: "White Cell Count (WBC)", unit: "x10⁹/L", reference_range: "4.0–11.0" },
      { name: "Neutrophils", unit: "%", reference_range: "40–75" },
      { name: "Lymphocytes", unit: "%", reference_range: "20–45" },
      { name: "Monocytes", unit: "%", reference_range: "2–10" },
      { name: "Eosinophils", unit: "%", reference_range: "1–6" },
      { name: "Basophils", unit: "%", reference_range: "0–1" },
      { name: "Platelet Count", unit: "x10⁹/L", reference_range: "150–400" },
    ],
  },
  {
    name: "Lipid Profile",
    department: "Chemistry",
    parameters: [
      { name: "Total Cholesterol", unit: "mg/dL", reference_range: "< 200" },
      { name: "Triglycerides", unit: "mg/dL", reference_range: "< 150" },
      { name: "HDL Cholesterol", unit: "mg/dL", reference_range: "> 40" },
      { name: "LDL Cholesterol", unit: "mg/dL", reference_range: "< 100" },
      { name: "VLDL Cholesterol", unit: "mg/dL", reference_range: "5–40" },
      { name: "Total Cholesterol / HDL Ratio", unit: "", reference_range: "< 5.0" },
    ],
  },
  {
    name: "Liver Function Test (LFT)",
    department: "Chemistry",
    parameters: [
      { name: "Total Bilirubin", unit: "mg/dL", reference_range: "0.1–1.2" },
      { name: "Direct Bilirubin", unit: "mg/dL", reference_range: "0.0–0.3" },
      { name: "AST (SGOT)", unit: "U/L", reference_range: "0–40" },
      { name: "ALT (SGPT)", unit: "U/L", reference_range: "0–41" },
      { name: "Alkaline Phosphatase (ALP)", unit: "U/L", reference_range: "40–129" },
      { name: "Total Protein", unit: "g/dL", reference_range: "6.4–8.3" },
      { name: "Albumin", unit: "g/dL", reference_range: "3.5–5.2" },
      { name: "Globulin", unit: "g/dL", reference_range: "2.0–3.5" },
    ],
  },
  {
    name: "Kidney Function Test (U&E/Cr)",
    department: "Chemistry",
    parameters: [
      { name: "Urea", unit: "mg/dL", reference_range: "15–45" },
      { name: "Creatinine", unit: "mg/dL", reference_range: "M 0.7–1.3 / F 0.6–1.1" },
      { name: "Sodium (Na⁺)", unit: "mmol/L", reference_range: "135–145" },
      { name: "Potassium (K⁺)", unit: "mmol/L", reference_range: "3.5–5.1" },
      { name: "Chloride (Cl⁻)", unit: "mmol/L", reference_range: "98–107" },
      { name: "Bicarbonate (HCO₃⁻)", unit: "mmol/L", reference_range: "22–29" },
    ],
  },
  {
    name: "Fasting Blood Sugar (FBS)",
    department: "Chemistry",
    parameters: [
      { name: "Fasting Blood Glucose", unit: "mg/dL", reference_range: "70–100" },
    ],
  },
  {
    name: "HbA1c",
    department: "Chemistry",
    parameters: [
      { name: "HbA1c", unit: "%", reference_range: "< 5.7 (non-diabetic)" },
      { name: "Estimated Average Glucose", unit: "mg/dL", reference_range: "—" },
    ],
  },
  {
    name: "Thyroid Function Test (TFT)",
    department: "Immunology",
    parameters: [
      { name: "TSH", unit: "µIU/mL", reference_range: "0.4–4.0" },
      { name: "Free T4", unit: "ng/dL", reference_range: "0.8–1.8" },
      { name: "Free T3", unit: "pg/mL", reference_range: "2.3–4.2" },
    ],
  },
  {
    name: "Urinalysis",
    department: "Microbiology",
    parameters: [
      { name: "Colour", unit: "", reference_range: "Straw / Pale yellow" },
      { name: "Appearance", unit: "", reference_range: "Clear" },
      { name: "pH", unit: "", reference_range: "4.5–8.0" },
      { name: "Specific Gravity", unit: "", reference_range: "1.005–1.030" },
      { name: "Protein", unit: "", reference_range: "Negative" },
      { name: "Glucose", unit: "", reference_range: "Negative" },
      { name: "Ketones", unit: "", reference_range: "Negative" },
      { name: "Blood", unit: "", reference_range: "Negative" },
      { name: "Leucocytes", unit: "", reference_range: "Negative" },
      { name: "Nitrites", unit: "", reference_range: "Negative" },
    ],
  },
  {
    name: "Malaria Parasite (MP)",
    department: "Microbiology",
    parameters: [
      { name: "Malaria Parasite", unit: "", reference_range: "Not seen" },
      { name: "Parasite Density", unit: "/µL", reference_range: "—" },
    ],
  },
  {
    name: "Prostate Specific Antigen (PSA)",
    department: "Immunology",
    parameters: [
      { name: "Total PSA", unit: "ng/mL", reference_range: "< 4.0" },
      { name: "Free PSA", unit: "ng/mL", reference_range: "—" },
      { name: "Free/Total PSA Ratio", unit: "%", reference_range: "> 25" },
    ],
  },

  // ── Chemistry ───────────────────────────────────────────────────────────────
  {
    name: "Random Blood Sugar (RBS)",
    department: "Chemistry",
    parameters: [
      { name: "Random Blood Glucose", unit: "mg/dL", reference_range: "< 140" },
    ],
  },
  {
    name: "2-Hour Post-Prandial Glucose (2HPP)",
    department: "Chemistry",
    parameters: [
      { name: "2-Hour Post-Prandial Glucose", unit: "mg/dL", reference_range: "< 140" },
    ],
  },
  {
    name: "Oral Glucose Tolerance Test (OGTT)",
    department: "Chemistry",
    parameters: [
      { name: "Fasting", unit: "mg/dL", reference_range: "70–100" },
      { name: "1 Hour", unit: "mg/dL", reference_range: "< 180" },
      { name: "2 Hour", unit: "mg/dL", reference_range: "< 140" },
    ],
  },
  {
    name: "Serum Electrolytes, Urea & Creatinine (E/U/Cr)",
    department: "Chemistry",
    parameters: [
      { name: "Sodium (Na⁺)", unit: "mmol/L", reference_range: "135–145" },
      { name: "Potassium (K⁺)", unit: "mmol/L", reference_range: "3.5–5.1" },
      { name: "Chloride (Cl⁻)", unit: "mmol/L", reference_range: "98–107" },
      { name: "Bicarbonate (HCO₃⁻)", unit: "mmol/L", reference_range: "22–29" },
      { name: "Urea", unit: "mg/dL", reference_range: "15–45" },
      { name: "Creatinine", unit: "mg/dL", reference_range: "M 0.7–1.3 / F 0.6–1.1" },
    ],
  },
  {
    name: "Serum Uric Acid",
    department: "Chemistry",
    parameters: [
      { name: "Uric Acid", unit: "mg/dL", reference_range: "M 3.4–7.0 / F 2.4–6.0" },
    ],
  },
  {
    name: "C-Reactive Protein (CRP)",
    department: "Chemistry",
    parameters: [
      { name: "CRP", unit: "mg/L", reference_range: "< 5" },
    ],
  },
  {
    name: "Bone Profile (Ca / PO₄ / Mg)",
    department: "Chemistry",
    parameters: [
      { name: "Total Calcium", unit: "mg/dL", reference_range: "8.5–10.5" },
      { name: "Phosphate", unit: "mg/dL", reference_range: "2.5–4.5" },
      { name: "Magnesium", unit: "mg/dL", reference_range: "1.7–2.2" },
      { name: "Albumin", unit: "g/dL", reference_range: "3.5–5.2" },
    ],
  },
  {
    name: "Iron Studies",
    department: "Chemistry",
    parameters: [
      { name: "Serum Iron", unit: "µg/dL", reference_range: "60–170" },
      { name: "TIBC", unit: "µg/dL", reference_range: "240–450" },
      { name: "Transferrin Saturation", unit: "%", reference_range: "20–50" },
      { name: "Ferritin", unit: "ng/mL", reference_range: "M 30–400 / F 15–150" },
    ],
  },
  {
    name: "Vitamin D (25-OH)",
    department: "Chemistry",
    parameters: [
      { name: "25-Hydroxy Vitamin D", unit: "ng/mL", reference_range: "30–100 (sufficient)" },
    ],
  },
  {
    name: "Serum Amylase & Lipase",
    department: "Chemistry",
    parameters: [
      { name: "Amylase", unit: "U/L", reference_range: "28–100" },
      { name: "Lipase", unit: "U/L", reference_range: "13–60" },
    ],
  },

  // ── Hematology ───────────────────────────────────────────────────────────────
  {
    name: "Erythrocyte Sedimentation Rate (ESR)",
    department: "Hematology",
    parameters: [
      { name: "ESR (1 hour)", unit: "mm/hr", reference_range: "M < 15 / F < 20" },
    ],
  },
  {
    name: "Blood Group & Rhesus",
    department: "Hematology",
    parameters: [
      { name: "ABO Blood Group", unit: "", reference_range: "—" },
      { name: "Rhesus (D) Factor", unit: "", reference_range: "—" },
    ],
  },
  {
    name: "Haemoglobin Genotype",
    department: "Hematology",
    parameters: [
      { name: "Genotype", unit: "", reference_range: "AA" },
    ],
  },
  {
    name: "Clotting Profile (PT / INR / APTT)",
    department: "Hematology",
    parameters: [
      { name: "Prothrombin Time (PT)", unit: "sec", reference_range: "11–13.5" },
      { name: "INR", unit: "", reference_range: "0.8–1.1" },
      { name: "APTT", unit: "sec", reference_range: "25–35" },
    ],
  },
  {
    name: "Reticulocyte Count",
    department: "Hematology",
    parameters: [
      { name: "Reticulocyte Count", unit: "%", reference_range: "0.5–2.5" },
    ],
  },

  // ── Serology / Immunology ────────────────────────────────────────────────────
  {
    name: "HIV Screening (Retroviral)",
    department: "Serology",
    parameters: [
      { name: "HIV 1 & 2 Antibody", unit: "", reference_range: "Non-reactive" },
    ],
  },
  {
    name: "Hepatitis B Surface Antigen (HBsAg)",
    department: "Serology",
    parameters: [
      { name: "HBsAg", unit: "", reference_range: "Non-reactive" },
    ],
  },
  {
    name: "Hepatitis B Profile",
    department: "Serology",
    parameters: [
      { name: "HBsAg", unit: "", reference_range: "Non-reactive" },
      { name: "HBsAb (Anti-HBs)", unit: "", reference_range: "—" },
      { name: "HBeAg", unit: "", reference_range: "Non-reactive" },
      { name: "HBeAb (Anti-HBe)", unit: "", reference_range: "—" },
      { name: "HBcAb (Anti-HBc)", unit: "", reference_range: "—" },
    ],
  },
  {
    name: "Hepatitis C Antibody (Anti-HCV)",
    department: "Serology",
    parameters: [
      { name: "Anti-HCV", unit: "", reference_range: "Non-reactive" },
    ],
  },
  {
    name: "VDRL (Syphilis)",
    department: "Serology",
    parameters: [
      { name: "VDRL", unit: "", reference_range: "Non-reactive" },
    ],
  },
  {
    name: "Widal Test",
    department: "Serology",
    parameters: [
      { name: "S. typhi O", unit: "titre", reference_range: "< 1:80" },
      { name: "S. typhi H", unit: "titre", reference_range: "< 1:80" },
      { name: "S. paratyphi A (O)", unit: "titre", reference_range: "< 1:80" },
      { name: "S. paratyphi B (O)", unit: "titre", reference_range: "< 1:80" },
    ],
  },
  {
    name: "Helicobacter Pylori (H. pylori)",
    department: "Serology",
    parameters: [
      { name: "H. pylori Antibody/Antigen", unit: "", reference_range: "Negative" },
    ],
  },
  {
    name: "Beta-hCG (Pregnancy)",
    department: "Serology",
    parameters: [
      { name: "Beta-hCG", unit: "mIU/mL", reference_range: "< 5 (non-pregnant)" },
    ],
  },

  // ── Microbiology ─────────────────────────────────────────────────────────────
  {
    name: "Urine Microscopy, Culture & Sensitivity (M/C/S)",
    department: "Microbiology",
    parameters: [
      { name: "Appearance", unit: "", reference_range: "Clear", group: "Microscopy" },
      { name: "Pus Cells", unit: "/hpf", reference_range: "0–5", group: "Microscopy" },
      { name: "Red Cells", unit: "/hpf", reference_range: "0–2", group: "Microscopy" },
      { name: "Epithelial Cells", unit: "/hpf", reference_range: "Few", group: "Microscopy" },
      { name: "Casts / Crystals", unit: "", reference_range: "Nil", group: "Microscopy" },
      { name: "Culture", unit: "", reference_range: "No growth", group: "Culture" },
      { name: "Colony Count", unit: "cfu/mL", reference_range: "< 10⁴", group: "Culture" },
      { name: "Organism Isolated", unit: "", reference_range: "—", group: "Culture" },
      { name: "Antibiotic Sensitivity", unit: "", reference_range: "—", group: "Culture" },
    ],
  },
  {
    name: "Stool Microscopy (Stool R/E)",
    department: "Microbiology",
    parameters: [
      { name: "Colour", unit: "", reference_range: "Brown" },
      { name: "Consistency", unit: "", reference_range: "Formed" },
      { name: "Ova / Parasites", unit: "", reference_range: "Not seen" },
      { name: "Cysts", unit: "", reference_range: "Not seen" },
      { name: "Pus Cells", unit: "/hpf", reference_range: "0–2" },
      { name: "Occult Blood", unit: "", reference_range: "Negative" },
    ],
  },
  {
    name: "Seminal Fluid Analysis (Semen)",
    department: "Microbiology",
    parameters: [
      { name: "Volume", unit: "mL", reference_range: "≥ 1.5" },
      { name: "pH", unit: "", reference_range: "7.2–8.0" },
      { name: "Liquefaction Time", unit: "min", reference_range: "< 60" },
      { name: "Sperm Concentration", unit: "million/mL", reference_range: "≥ 15" },
      { name: "Total Motility", unit: "%", reference_range: "≥ 40" },
      { name: "Progressive Motility", unit: "%", reference_range: "≥ 32" },
      { name: "Normal Morphology", unit: "%", reference_range: "≥ 4" },
      { name: "Round Cells", unit: "million/mL", reference_range: "< 1" },
    ],
  },

  // ── Radiology / Imaging ──────────────────────────────────────────────────────
  // Narrative reports: parameters with no unit/range are free-text sections the
  // reporter fills in (they render as report sections rather than a value table).
  {
    name: "Electrocardiogram (ECG)",
    department: "Radiology",
    parameters: [
      { name: "Heart Rate", unit: "bpm", reference_range: "60–100" },
      { name: "Rhythm", unit: "", reference_range: "Sinus" },
      { name: "Axis", unit: "", reference_range: "Normal (−30° to +90°)" },
      { name: "PR Interval", unit: "ms", reference_range: "120–200" },
      { name: "QRS Duration", unit: "ms", reference_range: "80–120" },
      { name: "QTc", unit: "ms", reference_range: "< 440" },
      { name: "ST-T Changes", unit: "", reference_range: "None" },
      { name: "Interpretation", unit: "", reference_range: "" },
    ],
  },
  {
    name: "Chest X-Ray (PA)",
    department: "Radiology",
    parameters: [
      { name: "Clinical Indication", unit: "", reference_range: "" },
      { name: "Technique / Views", unit: "", reference_range: "" },
      { name: "Lung Fields", unit: "", reference_range: "" },
      { name: "Cardiac Silhouette", unit: "", reference_range: "" },
      { name: "Mediastinum & Hila", unit: "", reference_range: "" },
      { name: "Bony Thorax & Soft Tissues", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
  {
    name: "Abdominal Ultrasound Scan",
    department: "Radiology",
    parameters: [
      { name: "Clinical Indication", unit: "", reference_range: "" },
      { name: "Liver", unit: "", reference_range: "" },
      { name: "Gallbladder & Biliary Tree", unit: "", reference_range: "" },
      { name: "Pancreas", unit: "", reference_range: "" },
      { name: "Spleen", unit: "", reference_range: "" },
      { name: "Right Kidney", unit: "", reference_range: "" },
      { name: "Left Kidney", unit: "", reference_range: "" },
      { name: "Urinary Bladder", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
  {
    name: "Obstetric Ultrasound Scan",
    department: "Radiology",
    parameters: [
      { name: "Clinical Indication", unit: "", reference_range: "" },
      { name: "Gestational Age", unit: "weeks", reference_range: "" },
      { name: "Fetal Heart Rate", unit: "bpm", reference_range: "110–160" },
      { name: "Fetal Presentation", unit: "", reference_range: "" },
      { name: "Placenta", unit: "", reference_range: "" },
      { name: "Amniotic Fluid", unit: "", reference_range: "" },
      { name: "Estimated Fetal Weight", unit: "g", reference_range: "" },
      { name: "Estimated Delivery Date (EDD)", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
  {
    name: "Pelvic Ultrasound Scan",
    department: "Radiology",
    parameters: [
      { name: "Clinical Indication", unit: "", reference_range: "" },
      { name: "Uterus", unit: "", reference_range: "" },
      { name: "Endometrium", unit: "", reference_range: "" },
      { name: "Right Ovary", unit: "", reference_range: "" },
      { name: "Left Ovary", unit: "", reference_range: "" },
      { name: "Pouch of Douglas", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
  {
    name: "Echocardiography",
    department: "Radiology",
    parameters: [
      { name: "LV Ejection Fraction", unit: "%", reference_range: "55–70" },
      { name: "Left Ventricle", unit: "", reference_range: "" },
      { name: "Other Chambers", unit: "", reference_range: "" },
      { name: "Valves", unit: "", reference_range: "" },
      { name: "Pericardium", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
  {
    name: "CT Scan (Brain)",
    department: "Radiology",
    parameters: [
      { name: "Clinical Indication", unit: "", reference_range: "" },
      { name: "Technique", unit: "", reference_range: "" },
      { name: "Findings", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
  {
    name: "MRI Report",
    department: "Radiology",
    parameters: [
      { name: "Clinical Indication", unit: "", reference_range: "" },
      { name: "Region / Sequences", unit: "", reference_range: "" },
      { name: "Findings", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
  {
    name: "Mammography",
    department: "Radiology",
    parameters: [
      { name: "Clinical Indication", unit: "", reference_range: "" },
      { name: "Right Breast", unit: "", reference_range: "" },
      { name: "Left Breast", unit: "", reference_range: "" },
      { name: "BI-RADS Category", unit: "", reference_range: "" },
      { name: "Impression", unit: "", reference_range: "" },
    ],
  },
];
