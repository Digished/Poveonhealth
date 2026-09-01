/**
 * What a care plan can cover.
 *
 * The two the programme was built for, plus what turns up alongside them often
 * enough that a doctor will want it on the record. Shared by the API that
 * validates a change and the dashboards that render one, so a condition is
 * never spelled one way in the database and another on screen.
 */
export const CONDITIONS = [
  "hypertension",
  "diabetes",
  "high_cholesterol",
  "obesity",
  "asthma",
  "ckd",
  "heart_failure",
  "stroke",
  "sickle_cell",
  "thyroid",
] as const;

export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABEL: Record<string, string> = {
  hypertension: "Hypertension",
  diabetes: "Diabetes",
  high_cholesterol: "High cholesterol",
  obesity: "Obesity",
  asthma: "Asthma",
  ckd: "Kidney disease",
  heart_failure: "Heart failure",
  stroke: "Stroke",
  sickle_cell: "Sickle cell",
  thyroid: "Thyroid",
};

/** How a condition should read on screen, falling back to its raw key. */
export function conditionLabel(key: string): string {
  return CONDITION_LABEL[key] ?? key;
}
