/**
 * The baseline questions a member answers before paying.
 *
 * Shared by the enrolment form, the API that stores the answers, and the
 * doctor's view of them, so the wording a member reads is the wording their
 * doctor sees.
 */

export const ADHERENCE_OPTIONS = [
  { value: "daily", label: "Every day", blurb: "I don't miss doses" },
  { value: "skip_monthly", label: "I skip a few days monthly", blurb: "Mostly on track" },
  { value: "few_weekly", label: "A few times a week", blurb: "I miss doses often" },
  { value: "rarely", label: "Hardly ever", blurb: "I struggle to keep up" },
  { value: "none", label: "I'm not on medication", blurb: "Nothing prescribed yet" },
] as const;

export type Adherence = (typeof ADHERENCE_OPTIONS)[number]["value"];

export const ADHERENCE_LABEL: Record<string, string> = Object.fromEntries(
  ADHERENCE_OPTIONS.map((o) => [o.value, o.label])
);

/** How long someone has lived with the condition, in bands people can answer. */
export const DURATION_OPTIONS = [
  { value: 0, label: "Under a year" },
  { value: 2, label: "1–3 years" },
  { value: 5, label: "3–7 years" },
  { value: 10, label: "7–15 years" },
  { value: 20, label: "Over 15 years" },
] as const;

export function durationLabel(years: number | null | undefined): string | null {
  if (years == null) return null;
  const match = DURATION_OPTIONS.find((o) => o.value === years);
  if (match) return match.label;
  return years === 1 ? "1 year" : `${years} years`;
}

export const GLUCOSE_CONTEXTS = [
  { value: "fasting", label: "Fasting" },
  { value: "random", label: "Random / after eating" },
] as const;

/**
 * A rough read on a blood-pressure pair, for the doctor's triage — not a
 * diagnosis, and deliberately conservative about saying anything is fine.
 */
export function bpBand(systolic: number | null, diastolic: number | null): {
  label: string;
  tone: "emerald" | "amber" | "red" | "slate";
} {
  if (systolic == null || diastolic == null) return { label: "—", tone: "slate" };
  if (systolic >= 180 || diastolic >= 120) return { label: "Very high", tone: "red" };
  if (systolic >= 140 || diastolic >= 90) return { label: "High", tone: "amber" };
  if (systolic >= 130 || diastolic >= 80) return { label: "Raised", tone: "amber" };
  return { label: "At target", tone: "emerald" };
}


/** When they were last seen about the condition — a proxy for how held they are. */
export const LAST_VISIT_OPTIONS = [
  { value: "under_3m", label: "In the last 3 months" },
  { value: "3_6m", label: "3 to 6 months ago" },
  { value: "6_12m", label: "6 to 12 months ago" },
  { value: "over_12m", label: "Over a year ago" },
  { value: "never", label: "Never been seen for it" },
] as const;

export const LAST_VISIT_LABEL: Record<string, string> = Object.fromEntries(
  LAST_VISIT_OPTIONS.map((o) => [o.value, o.label])
);
