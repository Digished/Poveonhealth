/**
 * The cadence rules behind a treatment checklist.
 *
 * Nothing is scheduled ahead of time. An item is due when enough time has
 * passed since it was last ticked — so a member who misses a week comes back to
 * one outstanding item, not seven.
 */

export const CADENCES = [
  { value: "daily", label: "Every day", days: 1 },
  { value: "weekly", label: "Every week", days: 7 },
  { value: "biweekly", label: "Every two weeks", days: 14 },
  { value: "monthly", label: "Every month", days: 30 },
  { value: "once", label: "Just once", days: 0 },
] as const;

export type Cadence = (typeof CADENCES)[number]["value"];

export const CADENCE_LABEL: Record<string, string> = Object.fromEntries(
  CADENCES.map((c) => [c.value, c.label])
);

export function cadenceDays(cadence: string): number {
  return CADENCES.find((c) => c.value === cadence)?.days ?? 7;
}

export type PlanItemState = {
  due: boolean;
  /** Days until it comes due again; negative means overdue by that many. */
  days_until: number | null;
  last_done_at: string | null;
};

/** Where one item stands right now. */
export function itemState(
  item: { cadence: string; last_done_at: Date | string | null },
  now: Date = new Date()
): PlanItemState {
  const last = item.last_done_at ? new Date(item.last_done_at) : null;
  const lastIso = last ? last.toISOString() : null;

  // A one-off is due until it is done, and then never again.
  if (item.cadence === "once") {
    return { due: !last, days_until: null, last_done_at: lastIso };
  }
  if (!last) return { due: true, days_until: 0, last_done_at: null };

  const period = cadenceDays(item.cadence);
  const elapsedDays = (now.getTime() - last.getTime()) / 86_400_000;
  const remaining = Math.ceil(period - elapsedDays);
  return { due: remaining <= 0, days_until: remaining, last_done_at: lastIso };
}

/** How the member's week is going: how many of their items are outstanding. */
export function dueCount(
  items: { cadence: string; last_done_at: Date | string | null }[],
  now: Date = new Date()
): number {
  return items.filter((i) => itemState(i, now).due).length;
}


/**
 * What to ask the member for when they tick an item.
 *
 * A tick alone says someone pressed a button. A reading says how they are
 * doing — and it is what re-rates them for their doctor's list.
 */
export const MEASURES = [
  { value: "none", label: "Just tick it", hint: "No number to record" },
  { value: "bp", label: "Blood pressure", hint: "Systolic and diastolic" },
  { value: "glucose", label: "Blood sugar", hint: "mg/dL" },
  { value: "weight", label: "Weight", hint: "kg" },
  { value: "number", label: "A number", hint: "Whatever you name below" },
  { value: "text", label: "A few words", hint: "How it went" },
] as const;

export type Measure = (typeof MEASURES)[number]["value"];

export const MEASURE_LABEL: Record<string, string> = Object.fromEntries(
  MEASURES.map((m) => [m.value, m.label])
);

/** One log entry as a single line, for the doctor's history. */
export function describeLog(log: {
  systolic?: number | null;
  diastolic?: number | null;
  glucose_mg_dl?: number | null;
  weight_kg?: number | null;
  value_number?: number | null;
  value_text?: string | null;
  measure_label?: string | null;
  note?: string | null;
}): string {
  const bits: string[] = [];
  if (log.systolic != null && log.diastolic != null) bits.push(`${log.systolic}/${log.diastolic} mmHg`);
  if (log.glucose_mg_dl != null) bits.push(`${log.glucose_mg_dl} mg/dL`);
  if (log.weight_kg != null) bits.push(`${log.weight_kg} kg`);
  if (log.value_number != null) bits.push(`${log.value_number}${log.measure_label ? ` ${log.measure_label}` : ""}`);
  if (log.value_text) bits.push(log.value_text);
  if (log.note) bits.push(log.note);
  return bits.join(" · ") || "Done";
}
