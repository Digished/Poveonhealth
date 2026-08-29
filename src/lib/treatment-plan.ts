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
