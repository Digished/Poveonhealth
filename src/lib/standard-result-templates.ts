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
    ],
  },
];
