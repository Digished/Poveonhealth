/**
 * Recognising that the drug a doctor wrote and the drug a pharmacy listed are
 * the same drug.
 *
 * These two sides never agree on shape. A doctor types "tabs amlodipine 10mg
 * daily x 1/12", which the parser stores as name "Amlodipine", form "tablet"
 * and dosage "10mg" — the strength in a *different column* from the name. A
 * pharmacist uploads "Amlodipine 10mg" in one cell, or splits it across a
 * Strength column, or writes "AMLODIPINE 10 MG TABS", or "Amlodipine Besylate
 * 10mg". Keying either side on a single normalised string and hoping the other
 * side produces the same string is how every prescription ends up unpriced.
 *
 * So matching happens on an *identity* — name, strength, form — gathered from
 * wherever each side happened to put it, and then resolved through tiers from
 * strictest to loosest. Two rules the tiers never break:
 *
 *  - **A stated strength must agree.** Amlodipine 5mg is not Amlodipine 10mg.
 *    When both sides name a strength and the strengths differ, that is a
 *    different product, not a near miss.
 *  - **Ambiguity is never resolved by picking one.** If the shop lists three
 *    strengths and the prescription names none, the honest answer is "which
 *    one?", handed back with the alternatives so the member can be told.
 */

/** Dose forms, longest spelling first so "tablets" beats "tabs". */
const FORM_SYNONYMS: [string, string[]][] = [
  ["tablet", ["tablets", "tablet", "tabs", "tab", "tb", "caplet", "caplets"]],
  ["capsule", ["capsules", "capsule", "caps", "cap"]],
  ["suspension", ["suspension", "susp"]],
  ["syrup", ["syrups", "syrup", "syr", "elixir", "solution", "soln"]],
  ["injection", ["injections", "injection", "inj", "ampoule", "ampoules", "vial", "vials"]],
  ["infusion", ["infusion", "ivf", "drip"]],
  ["inhaler", ["inhalers", "inhaler", "inh", "puffer"]],
  ["nebuliser", ["nebules", "nebuliser", "nebulizer", "neb"]],
  ["suppository", ["suppositories", "suppository", "supp"]],
  ["pessary", ["pessaries", "pessary"]],
  ["ointment", ["ointments", "ointment", "oint"]],
  ["cream", ["creams", "cream"]],
  ["lotion", ["lotions", "lotion"]],
  ["gel", ["gels", "gel"]],
  ["drops", ["drops", "drop", "gtt", "eyedrops", "eardrops"]],
  ["spray", ["sprays", "spray"]],
  ["sachet", ["sachets", "sachet"]],
  ["patch", ["patches", "patch"]],
  ["powder", ["powder", "powders"]],
  ["pen", ["pen", "pens", "flexpen", "cartridge", "cartridges"]],
];

const FORM_OF = new Map<string, string>();
for (const [form, words] of FORM_SYNONYMS) for (const w of words) FORM_OF.set(w, form);

/** Units that make a number a *strength*. "1 tablet" is a quantity, not one. */
const STRENGTH_UNITS = ["mcg", "µg", "ug", "mg", "gm", "g", "iu", "units", "unit", "ml", "l", "%"];

/** Units that mean the same thing, so mcg and µg never look like two drugs. */
const UNIT_CANON: Record<string, string> = {
  "µg": "mcg", ug: "mcg", mcg: "mcg",
  gm: "g", g: "g",
  mg: "mg", ml: "ml", l: "l",
  iu: "iu", unit: "iu", units: "iu",
  "%": "%",
};

const UNIT_RE = STRENGTH_UNITS.map((u) => u.replace("%", "\\%")).join("|");
/** One strength: a number, optionally /number, and a unit. "5/10mg", "0.5 mg". */
const STRENGTH_RE = new RegExp(
  // The tail is a negated class rather than \b, because "%" is not a word
  // character and \b after it would never match "0.05%".
  `(\\d+(?:\\.\\d+)?)\\s*(?:\\/\\s*(\\d+(?:\\.\\d+)?)\\s*)?(${UNIT_RE})(?![a-z0-9])`,
  "i"
);

/** "010" → "10", "0.50" → "0.5", "5." → "5". A number written two ways is one number. */
function tidyNumber(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw.toLowerCase();
  // Fixed notation, then trim the zeros a spreadsheet added.
  return String(n);
}

/**
 * The strength inside anything — a Strength cell, a dosage field, a drug name.
 * Null when there is no strength in it, which is the right answer for "1 tablet".
 */
export function normaliseStrength(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const m = STRENGTH_RE.exec(text);
  if (!m) return null;
  const unit = UNIT_CANON[m[3].toLowerCase()] ?? m[3].toLowerCase();
  const head = tidyNumber(m[1]);
  return m[2] ? `${head}/${tidyNumber(m[2])}${unit}` : `${head}${unit}`;
}

/** "TABS" / "Tablets" / "caps" → "tablet" / "capsule". Null when unrecognised. */
export function normaliseForm(raw: unknown): string | null {
  const text = String(raw ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!text) return null;
  return FORM_OF.get(text) ?? null;
}

/** Words that carry no identity, so their presence or absence never decides a match. */
const NOISE = new Set([
  "tabs", "tab", "tablet", "tablets", "caps", "cap", "capsule", "capsules",
  "syrup", "susp", "suspension", "inj", "injection", "cream", "gel", "drops",
  "oral", "po", "generic", "brand", "the", "and", "of", "usp", "bp",
]);

/** The name reduced to the words that identify the drug. */
export function nameTokens(raw: string): string[] {
  return String(raw ?? "")
    .toLowerCase()
    // A strength inside the name is identity, but it is carried separately.
    .replace(new RegExp(STRENGTH_RE.source, "gi"), " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NOISE.has(w));
}

/** The name as one comparable string. */
export function normaliseName(raw: string): string {
  return nameTokens(raw).join("");
}

export type MedIdentity = {
  /** Comparable name, stripped of strength, form and filler. */
  name: string;
  tokens: string[];
  strength: string | null;
  form: string | null;
};

/**
 * Gather an identity from whichever fields a side happened to fill in.
 *
 * Both sides go through this, which is the whole point: a doctor's
 * {medication:"Amlodipine", dosage:"10mg", form:"tablet"} and a pharmacy's
 * {name:"AMLODIPINE 10MG TABS"} come out identical.
 */
export function identify(input: {
  name: string;
  strength?: string | null;
  /** A prescription's dosage column, which sometimes holds the strength. */
  dosage?: string | null;
  form?: string | null;
}): MedIdentity {
  const rawName = String(input.name ?? "");
  const strength =
    normaliseStrength(input.strength) ??
    normaliseStrength(rawName) ??
    normaliseStrength(input.dosage) ??
    null;

  let form = normaliseForm(input.form);
  if (!form) {
    // A form written into the name — "Amlodipine 10mg tabs".
    for (const word of rawName.toLowerCase().split(/[^a-z]+/)) {
      const f = FORM_OF.get(word);
      if (f) { form = f; break; }
    }
  }

  const tokens = nameTokens(rawName);
  return { name: tokens.join(""), tokens, strength, form };
}

export type MatchRow = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  [k: string]: unknown;
};

type Indexed<T> = { row: T; id: MedIdentity };

export type MedIndex<T extends MatchRow> = {
  all: Indexed<T>[];
  byName: Map<string, Indexed<T>[]>;
};

/** Index a pharmacy's price list for matching. */
export function buildMedIndex<T extends MatchRow>(rows: T[]): MedIndex<T> {
  const all = rows.map((row) => ({
    row,
    id: identify({ name: row.name, strength: row.strength, form: row.form }),
  }));
  const byName = new Map<string, Indexed<T>[]>();
  for (const entry of all) {
    if (!entry.id.name) continue;
    const list = byName.get(entry.id.name);
    if (list) list.push(entry);
    else byName.set(entry.id.name, [entry]);
  }
  return { all, byName };
}

export type MatchResult<T> =
  | { row: T; how: "exact" | "strength" | "form" | "name" | "similar"; alternatives?: never }
  | {
      row: null;
      /** Why not: nothing like it, the strengths disagree, or too many candidates. */
      how: "none" | "strength_differs" | "ambiguous";
      alternatives: T[];
    };

/**
 * Find the pharmacy's row for one prescription.
 *
 * The tiers run strictest first. A tier only ever answers when it answers
 * *uniquely* — two rows reaching the same tier means the question has not been
 * settled, and settling it by taking the first would sell somebody the wrong
 * strength.
 */
export function matchMedication<T extends MatchRow>(
  index: MedIndex<T>,
  want: MedIdentity
): MatchResult<T> {
  if (!want.name) return { row: null, how: "none", alternatives: [] };

  let candidates = index.byName.get(want.name) ?? [];

  // Nothing on the name outright: try the names that contain each other, which
  // is how "Amlodipine" meets "Amlodipine Besylate".
  let similar = false;
  if (candidates.length === 0) {
    candidates = index.all.filter((e) => tokensOverlap(e.id.tokens, want.tokens));
    similar = candidates.length > 0;
  }
  if (candidates.length === 0) return { row: null, how: "none", alternatives: [] };

  const rowsOf = (list: Indexed<T>[]) => list.map((e) => e.row);

  if (want.strength) {
    const sameStrength = candidates.filter((e) => e.id.strength === want.strength);
    if (sameStrength.length === 0) {
      // The shop stocks the drug but not this strength — or never said which.
      const unstated = candidates.filter((e) => !e.id.strength);
      if (unstated.length === 1) return { row: unstated[0].row, how: similar ? "similar" : "name" };
      if (unstated.length > 1) return { row: null, how: "ambiguous", alternatives: rowsOf(unstated) };
      return { row: null, how: "strength_differs", alternatives: rowsOf(candidates) };
    }
    candidates = sameStrength;
  } else {
    // No strength on the prescription. One row is an answer; several are a
    // question, because they are different products.
    const strengths = new Set(candidates.map((e) => e.id.strength ?? ""));
    if (strengths.size > 1) return { row: null, how: "ambiguous", alternatives: rowsOf(candidates) };
  }

  if (candidates.length === 1) {
    const how = similar ? "similar" : want.strength ? "strength" : "name";
    return { row: candidates[0].row, how };
  }

  // Same name and strength, several forms: the form decides, and a row that
  // never stated one is compatible with whatever was asked for.
  if (want.form) {
    const sameForm = candidates.filter((e) => e.id.form === want.form);
    if (sameForm.length === 1) return { row: sameForm[0].row, how: similar ? "similar" : "exact" };
    if (sameForm.length > 1) return { row: null, how: "ambiguous", alternatives: rowsOf(sameForm) };
    const unstated = candidates.filter((e) => !e.id.form);
    if (unstated.length === 1) return { row: unstated[0].row, how: similar ? "similar" : "strength" };
  }

  return { row: null, how: "ambiguous", alternatives: rowsOf(candidates) };
}

/**
 * Is one name a longer spelling of the other? "amlodipine" vs "amlodipine
 * besylate" — yes. "metformin" vs "metoprolol" — no, and a prefix test would
 * have said yes, which is why this is a whole-token containment test.
 */
function tokensOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  const set = new Set(long);
  return short.every((t) => set.has(t));
}

/** A one-line reason a member can act on. */
export function unmatchedReason(
  how: "none" | "strength_differs" | "ambiguous",
  pharmacyName: string,
  alternatives: { strength?: string | null }[]
): string {
  const list = Array.from(
    new Set(alternatives.map((a) => a.strength).filter(Boolean) as string[])
  );
  switch (how) {
    case "strength_differs":
      return list.length
        ? `${pharmacyName} lists this in ${list.join(", ")} only — not the strength you were prescribed.`
        : `${pharmacyName} does not list the strength you were prescribed.`;
    case "ambiguous":
      return list.length
        ? `${pharmacyName} lists more than one strength (${list.join(", ")}). Ask your doctor which one, or ask the pharmacy.`
        : `${pharmacyName} lists more than one version of this. Ask them which is yours.`;
    default:
      return `${pharmacyName} has not listed a price for this. You can still collect it and pay them directly.`;
  }
}

/**
 * One row per drug, newest first.
 *
 * A prescription row is a drug's current state rather than an entry in a log,
 * so the same drug appearing twice is a mistake somewhere upstream — a renewal
 * written out again, a suggestion confirmed by retyping — and showing both of
 * them to a member is how a dashboard ends up listing their medication three
 * times. Rows are assumed to arrive newest first; the first of each drug wins.
 */
export function dedupeByDrug<T extends { medication: string; dosage?: string | null; form?: string | null }>(
  rows: T[]
): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const id = identify({ name: r.medication, dosage: r.dosage, form: r.form });
    // A name that normalises to nothing cannot be judged a duplicate of
    // anything, so it stays — dropping it would hide a real medication.
    if (!id.name) return true;
    const k = `${id.name}|${id.strength ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
