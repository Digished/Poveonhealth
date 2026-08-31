/**
 * The arithmetic behind the doctor bonus pool.
 *
 * Split out from doctor-bonus.ts so it can be run without a database. This is
 * the sum that decides what a doctor is paid; it should be possible to check it
 * without standing up Postgres, and it is checked in scripts/check-bonus-math.mjs.
 */

/**
 * Split a fixed amount by weight so the parts sum to the whole, exactly.
 *
 * Rounding each share independently loses or invents kobo — three doctors
 * splitting ₦100 by equal weight get ₦33.33 each and the pool is a kobo short,
 * every month, for ever. This is the largest-remainder method: floor everything,
 * then hand the leftover kobo out one at a time to whoever was rounded down
 * hardest. Ties go to the larger weight, then to the earlier entry, so the same
 * inputs always produce the same answer.
 *
 * Works in integer kobo. Returns kobo.
 */
export function allocate(totalKobo: number, weights: number[]): number[] {
  const total = Math.max(0, Math.round(totalKobo));
  const clean = weights.map((w) => Math.max(0, Math.round(w)));
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return clean.map(() => 0);

  const exact = clean.map((w) => (total * w) / sum);
  const base = exact.map((x) => Math.floor(x));
  let left = total - base.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, remainder: x - Math.floor(x), weight: clean[i] }))
    .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.i - b.i);

  for (let k = 0; k < order.length && left > 0; k++, left--) base[order[k].i] += 1;
  return base;
}

/** "2026-08" for a date, in UTC so a period never depends on where it is read. */
export function periodOf(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The half-open [start, end) range of a "YYYY-MM" period. */
export function periodRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

/** Every period from the first with any activity up to now, newest first. */
export function periodsBack(count = 12, from: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(periodOf(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1))));
  }
  return out;
}
