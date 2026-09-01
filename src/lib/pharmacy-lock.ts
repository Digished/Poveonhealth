/**
 * A member's pharmacy settles for 30 days once they choose it.
 *
 * The pharmacy side of this programme only works if a shop can plan. A
 * pharmacy that has stocked a member's refill, given a concession on it and
 * been counted as that member's first choice needs to know they are not going
 * to switch away the week before collection. So the choice is deliberate: the
 * member is told what they are committing to before it is made, and it holds
 * for a month.
 *
 * It is not a lock on care. The care code still works at every partner, the
 * member can still walk into any pharmacy and pay the counter price, and a
 * doctor is never blocked from prescribing. What is fixed for 30 days is only
 * *which* shop the app prices against and pays.
 */

export const PHARMACY_LOCK_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export type PharmacyLock = {
  /** True when the member may not switch yet. */
  locked: boolean;
  /** When they will be able to, or null when nothing is locked. */
  unlocksOn: Date | null;
  /** Whole days remaining, 0 once it is free. */
  daysLeft: number;
};

/**
 * Where a member stands, given when they last chose.
 *
 * `setAt` null means they have never chosen one — always free, because a first
 * choice cannot be a switch.
 */
export function pharmacyLock(setAt: Date | string | null | undefined, now = new Date()): PharmacyLock {
  if (!setAt) return { locked: false, unlocksOn: null, daysLeft: 0 };
  const chosen = setAt instanceof Date ? setAt : new Date(setAt);
  if (Number.isNaN(chosen.getTime())) return { locked: false, unlocksOn: null, daysLeft: 0 };

  const unlocksOn = new Date(chosen.getTime() + PHARMACY_LOCK_DAYS * DAY);
  const remaining = unlocksOn.getTime() - now.getTime();
  if (remaining <= 0) return { locked: false, unlocksOn, daysLeft: 0 };

  return { locked: true, unlocksOn, daysLeft: Math.ceil(remaining / DAY) };
}

/** How the wait reads to the member. */
export function lockMessage(lock: PharmacyLock, pharmacyName?: string | null): string {
  if (!lock.locked || !lock.unlocksOn) return "";
  const when = lock.unlocksOn.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const days = lock.daysLeft === 1 ? "tomorrow" : `in ${lock.daysLeft} days`;
  return `${pharmacyName ? `${pharmacyName} is your pharmacy` : "Your pharmacy is set"} until ${when}. You can change it ${days}.`;
}

/** What the member agrees to before the choice is made. */
export function lockWarning(pharmacyName: string): string {
  return (
    `${pharmacyName} will be your pharmacy for the next ${PHARMACY_LOCK_DAYS} days. ` +
    `They will price your medication, hold your refills and be paid when you pay. ` +
    `You can still use your care code anywhere — but you won't be able to change ` +
    `this choice in the app until the ${PHARMACY_LOCK_DAYS} days are up.`
  );
}
