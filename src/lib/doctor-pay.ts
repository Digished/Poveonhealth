/**
 * What a doctor is owed for one member, for one month.
 *
 * A doctor is paid a flat fee for each month a member is still with them —
 * ₦500 by default. Not a share of what the member paid to join: the joining
 * fee is one-off and small, and the doctor's pay is funded by what the
 * programme earns from refills, dispensing and tests. A year of doctor pay
 * exceeding the joining fee is the model working, not a mistake, and the rule
 * that used to enforce the opposite is why the price could not be changed at
 * all.
 *
 * Split out from lib/consult.ts so it can be proved without a database — the
 * release runs once a month against every live member, and getting it wrong is
 * either a doctor underpaid or money paid twice.
 */

export type Entitlement = {
  /**
   * The rate this entitlement pays each month, fixed when it was opened. Null
   * for entitlements from the old terms, where a year was committed at
   * activation and released in equal parts.
   */
  monthlyNaira: number | null;
  /** The ceiling: a full year of the monthly rate, or the old lump sum. */
  totalNaira: number;
  /** Paid out so far. */
  releasedNaira: number;
};

/**
 * This month's instalment, in whole naira.
 *
 * Never more than what is left, so the ceiling holds however the numbers were
 * set, and never negative, so a corrected total cannot claw money back — money
 * already released to a doctor is theirs.
 */
export function monthlyInstalment(e: Entitlement, releaseMonths: number): number {
  const months = Math.max(1, Math.round(releaseMonths));
  const total = Math.max(0, e.totalNaira);
  const already = Math.max(0, e.releasedNaira);

  // The old terms spread a lump sum; the current ones pay a fixed rate.
  const rate = e.monthlyNaira != null ? e.monthlyNaira : total / months;

  const remaining = total - already;
  if (remaining <= 0) return 0;

  return Math.max(0, Math.min(Math.round(rate), Math.round(remaining)));
}

/** True once nothing is left to pay, so the entitlement can be closed. */
export function isSettled(e: Entitlement): boolean {
  return e.releasedNaira >= e.totalNaira;
}

/**
 * What a doctor should expect next month, if nobody leaves.
 *
 * Derived from the members they hold rather than from the pool, because that
 * is the arithmetic a doctor does in their head — "I have forty members, that
 * is twenty thousand" — and a figure they cannot check is a figure they do not
 * trust.
 */
export function monthlyEstimate(activeMembers: number, monthlyNaira: number): number {
  return Math.max(0, Math.round(activeMembers * monthlyNaira));
}

/** A full year of one member, which is what an entitlement is opened for. */
export function yearlyCommitment(monthlyNaira: number, releaseMonths: number): number {
  return Math.max(0, Math.round(monthlyNaira * Math.max(1, Math.round(releaseMonths))));
}
