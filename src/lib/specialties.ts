// =============================================================================
// POVEON HEALTH - MEDICAL SPECIALTIES & SUB-SPECIALTIES
// Standard taxonomy for hospital profiles and patient referrals — globally
// recognised specialties/sub-specialties (120+), tailored to what is commonly
// available in Nigerian hospitals.
// =============================================================================

export type SpecialtyGroup = {
  name: string;
  subspecialties: string[];
};

export const SPECIALTY_TREE: SpecialtyGroup[] = [
  {
    name: "Accident & Emergency",
    subspecialties: ["Clinical Toxicology", "Pre-hospital & Retrieval Medicine"],
  },
  {
    name: "Anaesthesia",
    subspecialties: [
      "Cardiothoracic Anaesthesia",
      "Obstetric Anaesthesia",
      "Paediatric Anaesthesia",
      "Pain Medicine",
      "Regional Anaesthesia",
    ],
  },
  {
    name: "Cardiology",
    subspecialties: [
      "Interventional Cardiology",
      "Cardiac Electrophysiology",
      "Heart Failure & Transplant Cardiology",
      "Echocardiography & Non-invasive Imaging",
      "Paediatric Cardiology",
    ],
  },
  {
    name: "Cardiothoracic Surgery",
    subspecialties: ["Adult Cardiac Surgery", "Thoracic Surgery", "Congenital Cardiac Surgery"],
  },
  {
    name: "Dentistry / Oral & Maxillofacial",
    subspecialties: [
      "Oral & Maxillofacial Surgery",
      "Orthodontics",
      "Periodontology",
      "Prosthodontics",
      "Endodontics",
      "Paediatric Dentistry",
    ],
  },
  {
    name: "Dermatology",
    subspecialties: ["Paediatric Dermatology", "Dermatologic Surgery", "Dermatopathology"],
  },
  {
    name: "Ear, Nose & Throat (ENT)",
    subspecialties: [
      "Otology & Audiology",
      "Rhinology",
      "Laryngology",
      "Head & Neck Surgery",
      "Paediatric Otolaryngology",
    ],
  },
  {
    name: "Endocrinology",
    subspecialties: ["Diabetes & Metabolism", "Thyroid Disorders", "Paediatric Endocrinology"],
  },
  {
    name: "Family Medicine / General Practice",
    subspecialties: [],
  },
  {
    name: "Gastroenterology",
    subspecialties: ["Hepatology", "Interventional Endoscopy", "Paediatric Gastroenterology"],
  },
  {
    name: "General Surgery",
    subspecialties: [
      "Colorectal Surgery",
      "Hepatobiliary & Pancreatic Surgery",
      "Breast & Endocrine Surgery",
      "Upper GI Surgery",
      "Trauma Surgery",
      "Vascular Surgery",
      "Transplant Surgery",
    ],
  },
  {
    name: "Geriatrics / Care of the Elderly",
    subspecialties: [],
  },
  {
    name: "Haematology",
    subspecialties: ["Haemato-Oncology", "Transfusion Medicine", "Haemoglobinopathies / Sickle Cell"],
  },
  {
    name: "Infectious Diseases",
    subspecialties: ["HIV Medicine", "Tuberculosis & Mycobacterial Diseases", "Tropical Medicine"],
  },
  {
    name: "Intensive Care (ICU)",
    subspecialties: ["Paediatric Intensive Care", "Neonatal Intensive Care"],
  },
  {
    name: "Internal Medicine",
    subspecialties: [],
  },
  {
    name: "Nephrology",
    subspecialties: ["Dialysis & Renal Replacement Therapy", "Renal Transplant Medicine", "Paediatric Nephrology"],
  },
  {
    name: "Neurology",
    subspecialties: [
      "Stroke Medicine",
      "Epilepsy",
      "Movement Disorders",
      "Clinical Neurophysiology",
      "Paediatric Neurology",
    ],
  },
  {
    name: "Neurosurgery",
    subspecialties: ["Spine Surgery", "Paediatric Neurosurgery", "Skull Base & Cerebrovascular Surgery"],
  },
  {
    name: "Obstetrics & Gynaecology",
    subspecialties: [
      "Maternal-Fetal Medicine",
      "Gynaecological Oncology",
      "Reproductive Endocrinology & Infertility",
      "Urogynaecology",
      "Minimal Access Gynaecological Surgery",
    ],
  },
  {
    name: "Oncology",
    subspecialties: ["Medical Oncology", "Radiation Oncology", "Surgical Oncology", "Paediatric Oncology", "Palliative Care"],
  },
  {
    name: "Ophthalmology",
    subspecialties: [
      "Vitreoretinal Surgery",
      "Glaucoma",
      "Cornea & Anterior Segment",
      "Paediatric Ophthalmology & Strabismus",
      "Oculoplastics",
    ],
  },
  {
    name: "Orthopaedics & Trauma",
    subspecialties: [
      "Spine Surgery (Orthopaedic)",
      "Arthroplasty / Joint Replacement",
      "Sports Medicine & Arthroscopy",
      "Hand & Upper Limb Surgery",
      "Paediatric Orthopaedics",
      "Limb Reconstruction",
    ],
  },
  {
    name: "Paediatric Surgery",
    subspecialties: ["Neonatal Surgery", "Paediatric Urology (Surgical)"],
  },
  {
    name: "Paediatrics",
    subspecialties: [
      "Neonatology",
      "Paediatric Infectious Diseases",
      "Paediatric Emergency Medicine",
      "Developmental Paediatrics",
      "Paediatric Pulmonology",
    ],
  },
  {
    name: "Pathology / Laboratory Medicine",
    subspecialties: ["Anatomical Pathology", "Chemical Pathology", "Medical Microbiology", "Haematopathology"],
  },
  {
    name: "Physiotherapy & Rehabilitation",
    subspecialties: ["Neuro-rehabilitation", "Orthopaedic & Sports Physiotherapy", "Cardiopulmonary Rehabilitation"],
  },
  {
    name: "Plastic & Reconstructive Surgery",
    subspecialties: ["Burns Care", "Hand Surgery (Plastic)", "Craniofacial Surgery", "Aesthetic Surgery"],
  },
  {
    name: "Psychiatry / Mental Health",
    subspecialties: [
      "Child & Adolescent Psychiatry",
      "Geriatric Psychiatry",
      "Addiction Psychiatry",
      "Forensic Psychiatry",
    ],
  },
  {
    name: "Public Health / Community Medicine",
    subspecialties: ["Epidemiology", "Occupational Health"],
  },
  {
    name: "Pulmonology / Respiratory Medicine",
    subspecialties: ["Sleep Medicine", "Interventional Pulmonology"],
  },
  {
    name: "Radiology / Imaging",
    subspecialties: ["Interventional Radiology", "Neuroradiology", "Paediatric Radiology", "Breast Imaging"],
  },
  {
    name: "Rheumatology",
    subspecialties: ["Paediatric Rheumatology"],
  },
  {
    name: "Urology",
    subspecialties: ["Endourology & Stone Disease", "Uro-Oncology", "Paediatric Urology", "Andrology & Male Infertility"],
  },
];

/** Top-level specialty names only (backwards compatible with the original flat list). */
export const MEDICAL_SPECIALTIES: string[] = SPECIALTY_TREE.map((g) => g.name);

/** Every selectable label — top-level specialties and all sub-specialties. */
export const ALL_SPECIALTY_LABELS: string[] = SPECIALTY_TREE.flatMap((g) => [g.name, ...g.subspecialties]);

const LABEL_SET = new Set(ALL_SPECIALTY_LABELS);

const PARENT_OF = new Map<string, string>();
for (const group of SPECIALTY_TREE) {
  for (const sub of group.subspecialties) PARENT_OF.set(sub, group.name);
}

export function isKnownSpecialty(value: string): boolean {
  return LABEL_SET.has(value);
}

/** Returns the parent specialty for a sub-specialty, or null for top-level names. */
export function parentSpecialtyOf(label: string): string | null {
  return PARENT_OF.get(label) ?? null;
}

/** Sub-specialties under a top-level specialty (empty when none exist). */
export function subspecialtiesOf(specialty: string): string[] {
  return SPECIALTY_TREE.find((g) => g.name === specialty)?.subspecialties ?? [];
}
