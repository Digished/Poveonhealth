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

// ── Does a member cover their own doctor? ───────────────────────────────────

/**
 * Whole months a membership has been running, counted from the first.
 *
 * A member who joined yesterday is in month one, not month zero: they have
 * already cost their doctor a month's fee, and dividing by zero months would
 * make every new member look infinitely unprofitable.
 */
export function monthsActive(
  subscribedAt: Date | string | null | undefined,
  now = new Date()
): number {
  if (!subscribedAt) return 1;
  const start = subscribedAt instanceof Date ? subscribedAt : new Date(subscribedAt);
  if (Number.isNaN(start.getTime())) return 1;
  const elapsed = now.getTime() - start.getTime();
  if (elapsed <= 0) return 1;
  // 30.44 days: the average month. Whole calendar months would make a member
  // who joined on the 31st jump two months on the 1st.
  return Math.max(1, Math.floor(elapsed / (30.44 * 24 * 60 * 60 * 1000)) + 1);
}

export type MemberEconomics = {
  /** Poveon's margin on this member's medication, in naira. */
  medicationNaira: number;
  /** Poveon's commission on this member's lab tests, in naira. */
  testNaira: number;
  /** The two together. */
  marginNaira: number;
  monthsActive: number;
  /** Margin divided by the months it took to earn. */
  marginPerMonth: number;
  /** What this member costs in doctor pay each month. */
  doctorMonthlyNaira: number;
  /** Margin per month less the doctor's fee. Negative means a loss. */
  netPerMonth: number;
  /** True when this member is not yet earning back their own doctor's fee. */
  belowDoctorFee: boolean;
};

/**
 * What one member is worth against what they cost.
 *
 * The programme's whole premise is that the joining fee does not fund the
 * doctor — the margin on refills, dispensing and tests does. That is a claim
 * about each member, and it is checkable per member: a member whose margin has
 * not reached the doctor's monthly fee is being carried by everyone else.
 *
 * It is a flag, not a verdict. A member in their first month has barely had a
 * chance to fill a prescription, and a member who is simply well may never
 * generate much margin and is still exactly who this programme is for. What
 * the flag is good for is spotting the pattern: a member on a plan nobody is
 * dispensing, or a doctor whose whole list never orders anything.
 */
export function memberEconomics(input: {
  medicationNaira: number;
  testNaira: number;
  subscribedAt: Date | string | null | undefined;
  doctorMonthlyNaira: number;
  now?: Date;
}): MemberEconomics {
  const medicationNaira = Math.max(0, Math.round(input.medicationNaira));
  const testNaira = Math.max(0, Math.round(input.testNaira));
  const marginNaira = medicationNaira + testNaira;
  const months = monthsActive(input.subscribedAt, input.now);
  const marginPerMonth = Math.round(marginNaira / months);
  const doctorMonthlyNaira = Math.max(0, Math.round(input.doctorMonthlyNaira));

  return {
    medicationNaira,
    testNaira,
    marginNaira,
    monthsActive: months,
    marginPerMonth,
    doctorMonthlyNaira,
    netPerMonth: marginPerMonth - doctorMonthlyNaira,
    belowDoctorFee: marginPerMonth < doctorMonthlyNaira,
  };
}
