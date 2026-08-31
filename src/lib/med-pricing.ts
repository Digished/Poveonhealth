/**
 * What a member pays for a medication, and how that money splits three ways.
 *
 * A pharmacy tells us two things per item: the price it sells at over the
 * counter (the list price), and the naira it will take off for a Poveon member.
 * Poveon then adds a margin, set as a percentage of the list price.
 *
 *   list        ₦2,000     what it costs anyone off the street
 *   concession  ₦  300     what the pharmacy takes off for our members
 *   margin 5%   ₦  100     5% of list, Poveon's cut
 *
 *   pharmacy is paid   list − concession        = ₦1,700
 *   member pays        pharmacy + margin        = ₦1,800
 *   member saves       list − member price      = ₦  200
 *
 * The pharmacy is made whole at the price it agreed to; Poveon's margin comes
 * out of the concession, not out of the pharmacy; and whatever is left of the
 * concession is the member's saving. Nobody is charged more than the shop
 * price — see `clamped` below, which is the case that needs watching.
 *
 * Everything is integer kobo internally. Naira decimals with three parties
 * splitting them is how you end up a kobo short on a reconciliation, and
 * "₦1,799.995" is not a number anyone can pay.
 */

export type MedPriceInput = {
  /** Shop price, in naira. */
  listNaira: number;
  /** What the pharmacy takes off for a member, in naira. */
  concessionNaira: number;
  /** Poveon's cut as a percentage of the list price. */
  marginPercent: number;
};

export type MedPrice = {
  /** What the member is charged. */
  memberNaira: number;
  /** What the pharmacy receives. */
  pharmacyNaira: number;
  /** What Poveon keeps. */
  poveonNaira: number;
  /** list − member price. Never negative. */
  savingNaira: number;
  /** The member's saving as a percentage of list, rounded to a whole number. */
  savingPercent: number;
  /**
   * True when the margin was reduced to keep the member's price at or under
   * the shop price.
   *
   * It happens whenever the margin is worth more than the concession — a 5%
   * margin against a 2% concession, say. Left alone the arithmetic charges a
   * member *more* than walking in off the street would, which is the one
   * outcome the programme cannot produce. So the margin gives way, and the
   * caller is told, because a catalogue full of clamped rows is a pricing
   * problem for an admin to fix rather than a rounding detail.
   */
  clamped: boolean;
};

const toKobo = (naira: number) => Math.round(naira * 100);
const toNaira = (kobo: number) => kobo / 100;

/** Price one item. All figures in naira; safe with sloppy input. */
export function priceMedication(input: MedPriceInput): MedPrice {
  const list = Math.max(0, toKobo(input.listNaira || 0));
  // A concession bigger than the price would pay the pharmacy nothing.
  const concession = Math.min(list, Math.max(0, toKobo(input.concessionNaira || 0)));
  const pct = Math.min(100, Math.max(0, input.marginPercent || 0));

  const pharmacy = list - concession;
  const wantedMargin = Math.round((list * pct) / 100);

  // The member never pays more than the shop price: the margin is capped at
  // whatever the concession actually freed up.
  const margin = Math.min(wantedMargin, concession);
  const clamped = margin < wantedMargin;

  const member = pharmacy + margin;

  return {
    memberNaira: toNaira(member),
    pharmacyNaira: toNaira(pharmacy),
    poveonNaira: toNaira(margin),
    savingNaira: toNaira(list - member),
    savingPercent: list > 0 ? Math.round(((list - member) / list) * 100) : 0,
    clamped,
  };
}

/** The same sum over a basket, with the parts summed rather than re-derived. */
export function priceBasket(
  items: (MedPriceInput & { quantity?: number })[]
): MedPrice & { itemCount: number; clampedCount: number } {
  let member = 0, pharmacy = 0, poveon = 0, list = 0, clampedCount = 0;

  for (const item of items) {
    const qty = Math.max(1, Math.round(item.quantity ?? 1));
    const p = priceMedication(item);
    member += toKobo(p.memberNaira) * qty;
    pharmacy += toKobo(p.pharmacyNaira) * qty;
    poveon += toKobo(p.poveonNaira) * qty;
    list += toKobo(item.listNaira || 0) * qty;
    if (p.clamped) clampedCount += 1;
  }

  return {
    memberNaira: toNaira(member),
    pharmacyNaira: toNaira(pharmacy),
    poveonNaira: toNaira(poveon),
    savingNaira: toNaira(list - member),
    savingPercent: list > 0 ? Math.round(((list - member) / list) * 100) : 0,
    clamped: clampedCount > 0,
    itemCount: items.length,
    clampedCount,
  };
}

/**
 * The largest margin that still leaves the member a saving of at least
 * `minSavingPercent` of list — what an admin needs to know before typing a
 * number into the margin box.
 */
export function maxMargin(
  listNaira: number,
  concessionNaira: number,
  minSavingPercent = 0
): number {
  const list = toKobo(listNaira || 0);
  if (list <= 0) return 0;
  const concession = Math.min(list, Math.max(0, toKobo(concessionNaira || 0)));
  const floor = Math.round((list * minSavingPercent) / 100);
  const room = Math.max(0, concession - floor);
  return Math.floor((room / list) * 100);
}

export const naira = (n: number) =>
  `₦${Math.round(n).toLocaleString("en-NG")}`;
