/**
 * The plan a new member already has on day one.
 *
 * A doctor picking up a new member used to start from a blank page: write the
 * checklist, retype whatever the member said they were taking, then schedule
 * it. That is the same work every time for two conditions whose routine care is
 * well settled, so it is drafted at activation and the doctor reviews it.
 *
 * Two rules, and they are the whole design:
 *
 *  - **The checklist is monitoring and self-care, never a prescription.** Check
 *    your blood pressure weekly, walk thirty minutes, cut the salt, keep your
 *    review appointment. None of it needs a doctor's judgement to be safe, and
 *    all of it is what the doctor would have written anyway.
 *  - **Suggested medication is only what the member says they already take.**
 *    The parser reads their own baseline answer ("amlodipine 10mg daily,
 *    metformin 500mg bd") into structured rows so the doctor confirms or
 *    corrects a list instead of retyping it. Nothing is invented, and nothing
 *    suggested is shown to the member or honoured at a pharmacy until a doctor
 *    confirms it — see MED_SUGGESTED_STATUS.
 */

import { parsePrescriptionBlock, type ParsedPrescription } from "@/lib/prescription-parse";

export type DraftItem = {
  label: string;
  detail: string | null;
  cadence: "daily" | "weekly" | "biweekly" | "monthly" | "once";
  measure: "none" | "bp" | "glucose" | "weight" | "number" | "text";
  measure_label: string | null;
  remind: boolean;
};

/** Everything anyone on the programme is asked to do. */
const SHARED: DraftItem[] = [
  {
    label: "Take your medication every day",
    detail: "Same time each day is easier to remember than the right time.",
    cadence: "daily",
    measure: "none",
    measure_label: null,
    remind: true,
  },
  {
    label: "Walk for 30 minutes",
    detail: "Split it if you need to — three brisk ten-minute walks count the same.",
    cadence: "daily",
    measure: "number",
    measure_label: "minutes walked",
    remind: true,
  },
  {
    label: "Cut down on salt",
    detail: "Most of it is in seasoning cubes, tinned food and dried fish, not the salt shaker.",
    cadence: "weekly",
    measure: "none",
    measure_label: null,
    remind: true,
  },
  {
    label: "Check your weight",
    detail: "Same scale, same time of day.",
    cadence: "monthly",
    measure: "weight",
    measure_label: null,
    remind: true,
  },
  {
    label: "Answer your symptom check",
    detail: "A short set of questions so your doctor catches anything changing early.",
    cadence: "monthly",
    measure: "none",
    measure_label: null,
    remind: true,
  },
];

const HYPERTENSION: DraftItem[] = [
  {
    label: "Check your blood pressure",
    detail: "Sit quietly for five minutes first, arm resting at heart level.",
    cadence: "weekly",
    measure: "bp",
    measure_label: null,
    remind: true,
  },
];

const DIABETES: DraftItem[] = [
  {
    label: "Check your blood sugar",
    detail: "Your doctor will tell you whether to do it fasting or after food.",
    cadence: "weekly",
    measure: "glucose",
    measure_label: null,
    remind: true,
  },
  {
    label: "Look at your feet",
    detail: "Check the soles and between the toes for cuts, blisters or colour changes.",
    cadence: "weekly",
    measure: "none",
    measure_label: null,
    remind: true,
  },
];

/**
 * The starting checklist for someone with these conditions.
 *
 * Ordered so the daily habits come first — that is the order a member reads it
 * in, and the order the doctor is most likely to keep.
 */
export function draftPlanItems(conditions: string[]): DraftItem[] {
  const items: DraftItem[] = [];
  if (conditions.includes("hypertension")) items.push(...HYPERTENSION);
  if (conditions.includes("diabetes")) items.push(...DIABETES);
  items.push(...SHARED);

  const order = { daily: 0, weekly: 1, biweekly: 2, monthly: 3, once: 4 };
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => order[a.item.cadence] - order[b.item.cadence] || a.i - b.i)
    .map(({ item }) => item);
}

/** The note at the top of a drafted plan, so the doctor knows what they are looking at. */
export function draftPlanNote(conditions: string[]): string {
  const which = conditions.includes("hypertension") && conditions.includes("diabetes")
    ? "hypertension and diabetes"
    : conditions.includes("diabetes")
      ? "diabetes"
      : "hypertension";
  return (
    `Drafted automatically from this member's ${which} at sign-up, so there is ` +
    "something running from day one. Edit anything that does not fit them and confirm it — " +
    "until you do, it is marked as a suggestion."
  );
}

export type DraftMedication = ParsedPrescription & {
  /** Why this row exists, shown to the doctor beside it. */
  from_baseline: true;
};

/**
 * What the member says they are already taking, read into rows.
 *
 * Free text as people actually write it — "amlodipine 10mg daily and
 * metformin 500mg twice daily" — separated on commas, "and", semicolons and
 * newlines before parsing, because a member does not write one drug per line.
 *
 * A row the parser barely understood is still returned: the doctor correcting a
 * half-read line is faster than typing it from scratch, and they can see the
 * original text on every row.
 */
export function draftMedications(baselineText: string | null | undefined): DraftMedication[] {
  const text = (baselineText ?? "").trim();
  if (!text) return [];
  // "none", "nil", "not on any" — an answered question, not a list.
  if (/^(none|nil|no(ne)?|not on any\w*|n\/a|-+)\.?$/i.test(text)) return [];

  const lines = text
    .split(/[\n;,]+|\band\b/gi)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const parsed = parsePrescriptionBlock(lines.join("\n"));
  return parsed
    .filter(looksLikeMedication)
    .slice(0, 12) // a guard against a paragraph being read as forty drugs
    .map((p) => ({ ...p, from_baseline: true as const }));
}

/**
 * Is this row a drug, or a sentence?
 *
 * Members answer this question in prose as often as in a list — "I take my BP
 * drugs but I don't know the name" parses as a medication called exactly that,
 * with full confidence, because the parser's confidence measures how much of
 * the line it placed, not whether the line was ever a prescription. A row earns
 * its place if it carries a dose or a frequency, or if the name is short enough
 * to plausibly be a drug.
 */
function looksLikeMedication(p: ParsedPrescription): boolean {
  const name = p.medication.trim();
  if (name.length <= 2) return false;
  if (p.dosage || p.frequency || p.doses_per_day || p.form) return true;
  return name.split(/\s+/).length <= 3;
}
