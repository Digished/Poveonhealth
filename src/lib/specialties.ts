// =============================================================================
// POVEON HEALTH - STANDARD MEDICAL SPECIALTIES
// Standard specialty list for hospital profiles and patient referrals,
// tailored to specialties commonly available in Nigerian hospitals.
// =============================================================================

export const MEDICAL_SPECIALTIES = [
  "Accident & Emergency",
  "Anaesthesia",
  "Cardiology",
  "Cardiothoracic Surgery",
  "Dentistry / Oral & Maxillofacial",
  "Dermatology",
  "Ear, Nose & Throat (ENT)",
  "Endocrinology",
  "Family Medicine / General Practice",
  "Gastroenterology",
  "General Surgery",
  "Haematology",
  "Infectious Diseases",
  "Intensive Care (ICU)",
  "Internal Medicine",
  "Nephrology",
  "Neurology",
  "Neurosurgery",
  "Obstetrics & Gynaecology",
  "Oncology",
  "Ophthalmology",
  "Orthopaedics & Trauma",
  "Paediatric Surgery",
  "Paediatrics",
  "Physiotherapy & Rehabilitation",
  "Plastic & Reconstructive Surgery",
  "Psychiatry / Mental Health",
  "Pulmonology / Respiratory Medicine",
  "Radiology / Imaging",
  "Rheumatology",
  "Urology",
] as const;

export type MedicalSpecialty = (typeof MEDICAL_SPECIALTIES)[number];

export function isKnownSpecialty(value: string): boolean {
  return (MEDICAL_SPECIALTIES as readonly string[]).includes(value);
}
