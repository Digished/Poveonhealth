/**
 * Sub-views of the Earn panel.
 *
 * Kept in its own module so the dashboard shell can render the sub-menu strip
 * without statically importing (and therefore eagerly downloading) the whole
 * DoctorEncounterSection bundle.
 */
export const EARN_VIEWS = [
  { key: "overview", label: "Revenue" },
  { key: "encounters", label: "Encounters" },
  { key: "patients", label: "Patients" },
  { key: "payouts", label: "Payouts" },
  { key: "coupons", label: "Coupons" },
  { key: "pricing", label: "Pricing" },
] as const;

export type EarnView = (typeof EARN_VIEWS)[number]["key"];
