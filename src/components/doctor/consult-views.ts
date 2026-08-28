/**
 * Sub-views of the doctor's Care Plan panel.
 *
 * In its own module so the dashboard shell can draw the sub-menu strip without
 * statically importing (and eagerly downloading) the whole panel.
 */
export const CONSULT_VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "members", label: "My members" },
  { key: "earnings", label: "Earnings" },
  { key: "intake", label: "Intake" },
] as const;

export type ConsultView = (typeof CONSULT_VIEWS)[number]["key"];
