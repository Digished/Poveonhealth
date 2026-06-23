// Optional, additive suggestion chips for the consultation editor. The doctor is
// never forced to fill these — they are one-tap shortcuts to insert a labelled
// sub-section into a History or Examination block.

export const HISTORY_SECTIONS = [
  "Presenting Complaint",
  "History of Presenting Complaint",
  "Past Medical History",
  "Drug History",
  "Allergies",
  "Family History",
  "Social History",
  "Review of Systems",
];

export const EXAMINATION_SYSTEMS = [
  "General Examination",
  "Cardiovascular",
  "Respiratory",
  "Abdominal",
  "Central Nervous System",
  "Musculoskeletal",
  "ENT",
  "Skin",
];

export const PLAN_SECTIONS = [
  "Investigations",
  "Medications",
  "Referrals",
  "Patient Education",
  "Follow-up",
];

// Returns the relevant chip set for a block type.
export function suggestionsFor(blockType: string): string[] {
  switch (blockType) {
    case "history":
      return HISTORY_SECTIONS;
    case "examination":
      return EXAMINATION_SYSTEMS;
    case "plan":
      return PLAN_SECTIONS;
    default:
      return [];
  }
}
