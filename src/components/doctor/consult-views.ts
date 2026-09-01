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
  { key: "credentials", label: "Credentials" },
] as const;

export type ConsultView = (typeof CONSULT_VIEWS)[number]["key"];

/**
 * The strip only carries the two views a doctor lives in. Earnings, intake and
 * credentials are things you set up once and revisit occasionally, so they sit
 * behind a "More" menu rather than competing for the same row.
 */
export const CONSULT_PRIMARY_VIEWS = CONSULT_VIEWS.filter(
  (v) => v.key === "overview" || v.key === "members"
);

export const CONSULT_MORE_VIEWS = CONSULT_VIEWS.filter(
  (v) => v.key === "earnings" || v.key === "intake" || v.key === "credentials"
);
