/**
 * How often the written patient summary is worth rewriting.
 *
 * Split out from lib/patient-summary.ts, which reaches for the database and
 * the model and so cannot be loaded on its own. This is the rule that decides
 * whether money is spent on a summary, so it lives where it can be proved.
 */

/**
 * How long a summary stands before it is worth writing again.
 *
 * Two weeks is roughly the cadence of this programme — a check-in, a refill, a
 * message or two. Shorter and a doctor is reading a differently-worded account
 * of an unchanged patient; longer and a month of new readings goes unmentioned.
 * A doctor who wants it sooner presses re-read.
 */
export const SUMMARY_MAX_AGE_DAYS = 14;

/**
 * Is a summary old enough to be worth rewriting?
 *
 * Takes a string as well as a Date because this value crosses the wire, and
 * anything unreadable counts as stale: erring towards writing one is a cost,
 * erring the other way is a doctor reading a summary that will never update.
 */
export function summaryIsStale(
  at: Date | string | null | undefined,
  now = new Date()
): boolean {
  if (!at) return true;
  const written = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(written.getTime())) return true;
  return now.getTime() - written.getTime() >= SUMMARY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
