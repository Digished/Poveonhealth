// Plain-text prescription parser.
//
// Turns a doctor's shorthand (e.g. "tabs pcm 1g tds x 5/7") into structured
// items the pharmacy can read, without the doctor re-typing anything. A purely
// local heuristic engine runs first so parsing works offline / without AI; the
// API route can optionally enrich drug names with an LLM afterwards.

export interface ParsedRxItem {
  drug_name: string;
  strength: string | null;
  form: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null; // canonical abbreviation, e.g. "tds"
  frequency_per_day: number | null;
  duration_days: number | null;
  quantity: string | null;
  instructions: string | null;
  raw_fragment: string;
  confidence: number; // 0–1
}

// ── Dictionaries ─────────────────────────────────────────────────────────────

// Dosing frequency → times per day. Keys are matched as whole words.
const FREQUENCY: Record<string, { canonical: string; perDay: number | null }> = {
  od: { canonical: "od", perDay: 1 },
  daily: { canonical: "od", perDay: 1 },
  qd: { canonical: "od", perDay: 1 },
  mane: { canonical: "mane", perDay: 1 },
  nocte: { canonical: "nocte", perDay: 1 },
  on: { canonical: "nocte", perDay: 1 },
  bd: { canonical: "bd", perDay: 2 },
  bid: { canonical: "bd", perDay: 2 },
  tds: { canonical: "tds", perDay: 3 },
  tid: { canonical: "tds", perDay: 3 },
  qds: { canonical: "qds", perDay: 4 },
  qid: { canonical: "qds", perDay: 4 },
  stat: { canonical: "stat", perDay: 1 },
  prn: { canonical: "prn", perDay: null },
  q4h: { canonical: "q4h", perDay: 6 },
  q6h: { canonical: "q6h", perDay: 4 },
  q8h: { canonical: "q8h", perDay: 3 },
  q12h: { canonical: "q12h", perDay: 2 },
  hourly: { canonical: "hourly", perDay: 24 },
};

// Dose form keyword → canonical form (and implied oral route where relevant).
const FORMS: Record<string, { form: string; route: string | null }> = {
  t: { form: "tablet", route: "PO" }, // common shorthand "T. drug"
  tab: { form: "tablet", route: "PO" },
  tabs: { form: "tablet", route: "PO" },
  tablet: { form: "tablet", route: "PO" },
  tablets: { form: "tablet", route: "PO" },
  cap: { form: "capsule", route: "PO" },
  caps: { form: "capsule", route: "PO" },
  capsule: { form: "capsule", route: "PO" },
  syr: { form: "syrup", route: "PO" },
  syrup: { form: "syrup", route: "PO" },
  susp: { form: "suspension", route: "PO" },
  suspension: { form: "suspension", route: "PO" },
  elixir: { form: "elixir", route: "PO" },
  inj: { form: "injection", route: "IM" },
  injection: { form: "injection", route: "IM" },
  iv: { form: "injection", route: "IV" },
  im: { form: "injection", route: "IM" },
  sc: { form: "injection", route: "SC" },
  infusion: { form: "infusion", route: "IV" },
  supp: { form: "suppository", route: "PR" },
  suppository: { form: "suppository", route: "PR" },
  pessary: { form: "pessary", route: "PV" },
  drops: { form: "drops", route: null },
  cream: { form: "cream", route: "topical" },
  ointment: { form: "ointment", route: "topical" },
  oint: { form: "ointment", route: "topical" },
  gel: { form: "gel", route: "topical" },
  neb: { form: "nebule", route: "inhaled" },
  inhaler: { form: "inhaler", route: "inhaled" },
  sachet: { form: "sachet", route: "PO" },
  lozenge: { form: "lozenge", route: "PO" },
  patch: { form: "patch", route: "transdermal" },
};

const ROUTE_WORDS: Record<string, string> = {
  po: "PO", oral: "PO", iv: "IV", im: "IM", sc: "SC", sl: "SL",
  pr: "PR", pv: "PV", top: "topical", topical: "topical",
  inh: "inhaled", inhaled: "inhaled", neb: "inhaled",
};

const STRENGTH_RE = /\b(\d+(?:\.\d+)?)\s?(mg|mcg|µg|g|kg|ml|l|iu|units?|%)\b/i;
const DOSE_RE = /\b(\d+)\s?(tabs?|caps?|tablets?|capsules?|puffs?|drops?|sprays?|mls?)\b/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Expand a clinical duration token into days. Handles "5/7" (days), "2/52"
// (weeks), "1/12" (months) and plain "x5 days" / "for 2 weeks" forms.
function parseDuration(text: string): number | null {
  const slash = text.match(/\bx?\s*(\d+)\s*\/\s*(7|52|12)\b/);
  if (slash) {
    const n = parseInt(slash[1], 10);
    const denom = slash[2];
    if (denom === "7") return n; // days
    if (denom === "52") return n * 7; // weeks → days
    if (denom === "12") return n * 30; // months → days (approx)
  }
  const explicit = text.match(/\b(?:x|for)\s*(\d+)\s*(day|days|dy|d|week|weeks|wk|wks|month|months|mth|mo)\b/);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    const unit = explicit[2];
    if (/^d/.test(unit)) return n;
    if (/^w/.test(unit)) return n * 7;
    if (/^m/.test(unit)) return n * 30;
  }
  return null;
}

function titleCaseDrug(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  // Keep short all-caps tokens (likely abbreviations) as-is, title-case the rest.
  // Drop tokens that carry no letters (stray punctuation like a leading ".").
  return cleaned
    .split(" ")
    .filter((w) => /[a-z0-9]/i.test(w))
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase()
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

// Split a free-text block into individual prescription lines.
export function splitRxLines(text: string): string[] {
  return text
    .split(/\r?\n|;|(?<=\d)\)|•|·/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

// ── Core: parse one line ─────────────────────────────────────────────────────

export function parseRxLine(line: string): ParsedRxItem | null {
  const raw = line.trim();
  if (!raw || raw.length < 2) return null;

  const lower = ` ${raw.toLowerCase()} `;
  const consumed = new Set<string>(); // tokens we've claimed for non-drug fields

  // Form
  let form: string | null = null;
  let route: string | null = null;
  for (const [kw, def] of Object.entries(FORMS)) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(raw)) {
      form = def.form;
      route = def.route;
      consumed.add(kw);
      break;
    }
  }

  // Explicit route overrides the form's implied route
  for (const [kw, r] of Object.entries(ROUTE_WORDS)) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(raw)) {
      route = r;
      consumed.add(kw);
    }
  }

  // Strength
  let strength: string | null = null;
  const sMatch = raw.match(STRENGTH_RE);
  if (sMatch) {
    strength = `${sMatch[1]}${sMatch[2].toLowerCase()}`;
    consumed.add(sMatch[0].toLowerCase().replace(/\s/g, ""));
  }

  // Dose (e.g. "2 tabs", "10ml")
  let dose: string | null = null;
  const dMatch = raw.match(DOSE_RE);
  if (dMatch) {
    dose = dMatch[0].trim();
  }

  // Frequency
  let frequency: string | null = null;
  let frequencyPerDay: number | null = null;
  for (const [kw, def] of Object.entries(FREQUENCY)) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) {
      frequency = def.canonical;
      frequencyPerDay = def.perDay;
      consumed.add(kw);
      break;
    }
  }

  // Duration
  const durationDays = parseDuration(lower);

  // prn / "as needed" instruction
  let instructions: string | null = null;
  if (/\bprn\b/i.test(raw) || /as needed|as required/i.test(raw)) {
    instructions = "as needed";
  }

  // Drug name = whatever's left after stripping the structured tokens.
  let nameRaw = raw;
  // strip strength
  if (sMatch) nameRaw = nameRaw.replace(sMatch[0], " ");
  // strip dose
  if (dMatch) nameRaw = nameRaw.replace(dMatch[0], " ");
  // strip duration phrases
  nameRaw = nameRaw.replace(/\bx?\s*\d+\s*\/\s*(?:7|52|12)\b/gi, " ");
  nameRaw = nameRaw.replace(/\b(?:x|for)\s*\d+\s*(?:day|days|dy|d|week|weeks|wk|wks|month|months|mth|mo)\b/gi, " ");
  // strip consumed keywords (forms, routes, frequencies)
  Array.from(consumed).forEach((kw) => {
    nameRaw = nameRaw.replace(new RegExp(`\\b${kw}\\b`, "gi"), " ");
  });
  // strip leftover lone "x" separators and punctuation
  nameRaw = nameRaw.replace(/\bx\b/gi, " ").replace(/[,()]/g, " ");

  const drugName = titleCaseDrug(nameRaw);
  if (!drugName) return null;

  // Confidence: more recognised fields → higher confidence.
  let score = 0.3;
  if (form) score += 0.15;
  if (strength) score += 0.2;
  if (frequency) score += 0.25;
  if (durationDays != null) score += 0.1;
  const confidence = Math.min(1, score);

  return {
    drug_name: drugName,
    strength,
    form,
    dose,
    route,
    frequency,
    frequency_per_day: frequencyPerDay,
    duration_days: durationDays,
    quantity: null,
    instructions,
    raw_fragment: raw,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// Parse a whole free-text prescription block locally.
export function parsePrescription(text: string): ParsedRxItem[] {
  return splitRxLines(text)
    .map(parseRxLine)
    .filter((x): x is ParsedRxItem => x !== null);
}

// Human-readable one-line summary for tables / the pharmacy queue.
export function describeRxItem(item: ParsedRxItem): string {
  const parts = [
    item.form ? item.form : null,
    item.drug_name,
    item.strength,
    item.frequency,
    item.duration_days != null ? `for ${item.duration_days} day${item.duration_days === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(" ");
}
