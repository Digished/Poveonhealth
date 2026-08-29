/**
 * Reads a prescription the way a doctor writes one.
 *
 *   "tabs amlodipine 10mg daily x 1/12"
 *     → 1 tablet of Amlodipine 10mg, once daily, for 1 month (30 days)
 *
 * The fraction is the convention that matters most: the denominator names the
 * unit — /7 days, /52 weeks, /12 months — and the numerator counts them. So
 * 1/12 is one month, 4/52 is four weeks, 5/7 is five days.
 *
 * Nothing here guesses when it cannot read something. Whatever the parser does
 * not recognise is handed back in `unparsed` so the doctor can see it and the
 * form can ask rather than quietly inventing a dose.
 */

export type ParsedPrescription = {
  raw_text: string;
  medication: string;
  form: string | null;
  dosage: string | null;
  frequency: string | null;
  doses_per_day: number | null;
  duration_days: number | null;
  duration_text: string | null;
  route: string | null;
  instructions: string | null;
  /** Words the parser could not place. Empty when it read the whole line. */
  unparsed: string[];
  /** How much of the line it understood, 0–1. Below ~0.5 is worth a second look. */
  confidence: number;
};

/** Dose forms, longest spelling first so "tablets" wins over "tabs". */
const FORMS: { match: string[]; form: string; unit: string }[] = [
  { match: ["tablets", "tablet", "tabs", "tab", "tb"], form: "tablet", unit: "tablet" },
  { match: ["capsules", "capsule", "caps", "cap"], form: "capsule", unit: "capsule" },
  { match: ["suspension", "susp"], form: "suspension", unit: "ml" },
  { match: ["syrups", "syrup", "syr"], form: "syrup", unit: "ml" },
  { match: ["injections", "injection", "inj"], form: "injection", unit: "dose" },
  { match: ["infusion", "ivf"], form: "infusion", unit: "dose" },
  { match: ["inhalers", "inhaler", "inh"], form: "inhaler", unit: "puff" },
  { match: ["nebules", "nebuliser", "nebulizer", "neb"], form: "nebuliser", unit: "dose" },
  { match: ["suppositories", "suppository", "supp"], form: "suppository", unit: "suppository" },
  { match: ["pessaries", "pessary"], form: "pessary", unit: "pessary" },
  { match: ["ointments", "ointment", "oint"], form: "ointment", unit: "application" },
  { match: ["creams", "cream"], form: "cream", unit: "application" },
  { match: ["lotions", "lotion"], form: "lotion", unit: "application" },
  { match: ["gels", "gel"], form: "gel", unit: "application" },
  { match: ["drops", "drop", "gtt"], form: "drops", unit: "drop" },
  { match: ["sprays", "spray"], form: "spray", unit: "spray" },
  { match: ["sachets", "sachet"], form: "sachet", unit: "sachet" },
  { match: ["patches", "patch"], form: "patch", unit: "patch" },
  { match: ["powder"], form: "powder", unit: "dose" },
];

/** Latin and plain-English dosing, with how many doses a day each means. */
const FREQUENCIES: { match: string[]; label: string; perDay: number | null }[] = [
  { match: ["od", "daily", "once daily", "once a day", "every day", "o.d"], label: "Once daily", perDay: 1 },
  { match: ["bd", "bid", "twice daily", "twice a day", "b.d"], label: "Twice daily", perDay: 2 },
  { match: ["tds", "tid", "three times daily", "thrice daily", "three times a day", "t.d.s"], label: "Three times daily", perDay: 3 },
  { match: ["qds", "qid", "four times daily", "four times a day", "q.d.s"], label: "Four times daily", perDay: 4 },
  { match: ["nocte", "at night", "nightly", "every night"], label: "At night", perDay: 1 },
  { match: ["mane", "in the morning", "every morning"], label: "In the morning", perDay: 1 },
  { match: ["stat", "immediately"], label: "Immediately (stat)", perDay: 1 },
  { match: ["prn", "as needed", "as required", "when necessary"], label: "As needed", perDay: null },
  { match: ["weekly", "once weekly", "once a week"], label: "Once weekly", perDay: 1 / 7 },
  { match: ["fortnightly", "every two weeks"], label: "Every two weeks", perDay: 1 / 14 },
  { match: ["monthly", "once monthly", "once a month"], label: "Once monthly", perDay: 1 / 30 },
  { match: ["alternate days", "every other day", "eod"], label: "Every other day", perDay: 0.5 },
];

const ROUTES: { match: string[]; label: string }[] = [
  { match: ["po", "orally", "by mouth", "oral"], label: "Oral" },
  { match: ["iv", "intravenous"], label: "Intravenous" },
  { match: ["im", "intramuscular"], label: "Intramuscular" },
  { match: ["sc", "subcut", "subcutaneous"], label: "Subcutaneous" },
  { match: ["sl", "sublingual"], label: "Sublingual" },
  { match: ["pr", "rectally", "rectal"], label: "Rectal" },
  { match: ["pv", "vaginally"], label: "Vaginal" },
  { match: ["top", "topically", "topical"], label: "Topical" },
  { match: ["neb"], label: "Nebulised" },
];

const DOSE_UNITS = ["mcg", "µg", "mg", "gm", "g", "iu", "units", "unit", "ml", "l", "%"];

/** "1/12" → 30 days. The denominator is the unit, the numerator the count. */
export function parseFraction(text: string): { days: number; label: string } | null {
  const m = /^(\d{1,3})\s*\/\s*(7|12|24|52|365)$/.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1) return null;
  switch (m[2]) {
    case "7":
      return { days: n, label: n === 1 ? "1 day" : `${n} days` };
    case "52":
      return { days: n * 7, label: n === 1 ? "1 week" : `${n} weeks` };
    case "12":
      return { days: n * 30, label: n === 1 ? "1 month" : `${n} months` };
    case "24":
      // Half-months are written this way now and then: 1/24 is a fortnight.
      return { days: n * 15, label: n === 1 ? "2 weeks" : `${n * 15} days` };
    case "365":
      return { days: n * 365, label: n === 1 ? "1 year" : `${n} years` };
    default:
      return null;
  }
}

/** "for 2 weeks", "x 30 days", "3 months" — the ways people write it out. */
function parseWrittenDuration(tokens: string[], i: number): { days: number; label: string; used: number } | null {
  const n = Number(tokens[i]);
  if (!Number.isFinite(n) || n < 1) return null;
  const unit = (tokens[i + 1] ?? "").replace(/[.,]/g, "");
  const map: Record<string, number> = {
    day: 1, days: 1, d: 1,
    week: 7, weeks: 7, wk: 7, wks: 7, w: 7,
    month: 30, months: 30, mth: 30, mths: 30, mo: 30,
    year: 365, years: 365, yr: 365, yrs: 365,
  };
  const mult = map[unit];
  if (!mult) return null;
  const noun = mult === 1 ? "day" : mult === 7 ? "week" : mult === 30 ? "month" : "year";
  return { days: n * mult, label: `${n} ${noun}${n === 1 ? "" : "s"}`, used: 2 };
}

/** Does this token look like a dose — "10mg", "5", "2.5mg", "5/10mg"? */
function doseAt(tokens: string[], i: number): { text: string; used: number } | null {
  const t = tokens[i];
  if (!t) return null;
  const glued = new RegExp(`^(\\d+(?:[./]\\d+)?)(${DOSE_UNITS.join("|")})$`, "i").exec(t);
  if (glued) return { text: `${glued[1]}${glued[2].toLowerCase()}`, used: 1 };
  if (/^\d+(?:[./]\d+)?$/.test(t)) {
    const next = (tokens[i + 1] ?? "").toLowerCase();
    if (DOSE_UNITS.includes(next)) return { text: `${t}${next}`, used: 2 };
  }
  return null;
}

/**
 * Match a phrase from a table at position i, preferring the longest phrase.
 * Returns the entry and how many tokens it swallowed.
 */
function phraseAt<T extends { match: string[] }>(
  table: T[],
  tokens: string[],
  i: number
): { entry: T; used: number } | null {
  let best: { entry: T; used: number } | null = null;
  for (const entry of table) {
    for (const phrase of entry.match) {
      const words = phrase.split(" ");
      const slice = tokens.slice(i, i + words.length).map((w) => w.replace(/[.,;]+$/, "").toLowerCase());
      if (slice.length === words.length && slice.every((w, k) => w === words[k])) {
        if (!best || words.length > best.used) best = { entry, used: words.length };
      }
    }
  }
  return best;
}

/** Read one line of a prescription. */
export function parsePrescriptionLine(raw: string): ParsedPrescription | null {
  const line = raw.trim().replace(/\s+/g, " ");
  if (!line) return null;

  // Anything after a "--", "(" or ":" is an instruction, not a structured field.
  let instructions: string | null = null;
  const noteSplit = /\s(?:--|—|\(|:)\s*(.+)$/.exec(line);
  let body = line;
  if (noteSplit) {
    instructions = noteSplit[1].replace(/\)\s*$/, "").trim() || null;
    body = line.slice(0, noteSplit.index).trim();
  }

  const tokens = body.split(" ").filter(Boolean);
  const nameParts: string[] = [];
  const unparsed: string[] = [];
  let form: string | null = null;
  let dosage: string | null = null;
  let frequency: string | null = null;
  let dosesPerDay: number | null = null;
  let durationDays: number | null = null;
  let durationText: string | null = null;
  let route: string | null = null;
  let matched = 0;

  for (let i = 0; i < tokens.length; ) {
    const bare = tokens[i].replace(/[.,;]+$/, "").toLowerCase();

    // "x" and "for" only introduce a duration — they are never drug names.
    if ((bare === "x" || bare === "for" || bare === "×") && i + 1 < tokens.length) {
      const frac = parseFraction(tokens[i + 1]);
      if (frac) {
        durationDays = frac.days;
        durationText = frac.label;
        matched += 2;
        i += 2;
        continue;
      }
      const written = parseWrittenDuration(tokens, i + 1);
      if (written) {
        durationDays = written.days;
        durationText = written.label;
        matched += 1 + written.used;
        i += 1 + written.used;
        continue;
      }
      // "x2" style: a bare count with no unit is a quantity, not a duration.
      i += 1;
      matched += 1;
      continue;
    }

    // A bare fraction, with or without the leading x.
    const frac = parseFraction(bare);
    if (frac && durationDays == null) {
      durationDays = frac.days;
      durationText = frac.label;
      matched += 1;
      i += 1;
      continue;
    }

    if (!form) {
      const f = phraseAt(FORMS, tokens, i);
      // Only treat it as the form if we have not started reading a dose — a
      // trailing "drops" after the name is the form too, but "tab" mid-name is
      // vanishingly rare and this keeps the rule simple.
      if (f) {
        form = f.entry.form;
        matched += f.used;
        i += f.used;
        continue;
      }
    }

    const d = doseAt(tokens, i);
    if (d) {
      // A second dose after the first is the strength it is dissolved in —
      // "syrup paracetamol 120mg 5ml" is 120mg per 5ml, not two doses.
      dosage = dosage ? `${dosage}/${d.text}` : d.text;
      matched += d.used;
      i += d.used;
      continue;
    }

    const fr = phraseAt(FREQUENCIES, tokens, i);
    if (fr) {
      if (!frequency) {
        frequency = fr.entry.label;
        dosesPerDay = fr.entry.perDay;
      } else if (fr.entry.perDay === null) {
        // "tds prn" — as-needed qualifies the schedule rather than replacing it,
        // and it makes the quantity a ceiling rather than a count.
        if (!/as needed/i.test(frequency)) frequency = `${frequency} as needed`;
        dosesPerDay = null;
      }
      matched += fr.used;
      i += fr.used;
      continue;
    }

    const rt = phraseAt(ROUTES, tokens, i);
    if (rt && !route) {
      route = rt.entry.label;
      matched += rt.used;
      i += rt.used;
      continue;
    }

    // Anything alphabetic that is not a keyword belongs to the drug name, but
    // only until we have a dose — after that it is a stray we should surface.
    if (/^[a-z][a-z'-]*$/i.test(bare) && (!dosage || nameParts.length === 0)) {
      nameParts.push(tokens[i]);
      matched += 1;
      i += 1;
      continue;
    }

    unparsed.push(tokens[i]);
    i += 1;
  }

  const medication = nameParts
    .join(" ")
    .replace(/^[^a-z0-9]+|[^a-z0-9)%]+$/gi, "")
    .trim();
  if (!medication) return null;

  return {
    raw_text: line,
    medication: medication.charAt(0).toUpperCase() + medication.slice(1),
    form,
    dosage,
    frequency,
    doses_per_day: dosesPerDay,
    duration_days: durationDays,
    duration_text: durationText,
    route,
    instructions,
    unparsed,
    confidence: tokens.length ? Math.min(1, matched / tokens.length) : 0,
  };
}

/** Read a whole block — one prescription per line, or separated by ";". */
export function parsePrescriptionBlock(text: string): ParsedPrescription[] {
  return text
    .split(/[\n;]+/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "")) // strip list bullets
    .map(parsePrescriptionLine)
    .filter((p): p is ParsedPrescription => p !== null);
}

/** How many units to dispense, when we know enough to say. */
export function estimateQuantity(p: ParsedPrescription): number | null {
  if (p.doses_per_day == null || p.duration_days == null) return null;
  const qty = Math.ceil(p.doses_per_day * p.duration_days);
  return qty > 0 && qty < 10000 ? qty : null;
}

/** A one-line rendering of a parse, for confirming it back to the doctor. */
export function describePrescription(p: ParsedPrescription): string {
  const bits = [
    p.form ? `${p.form.charAt(0).toUpperCase()}${p.form.slice(1)}` : null,
    p.medication,
    p.dosage,
    p.frequency,
    p.route,
    p.duration_text ? `for ${p.duration_text}` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}
