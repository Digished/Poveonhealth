/**
 * How worried should a doctor be about this member, right now?
 *
 * Two things make triage useful in a list of hundreds: it has to be stored
 * (so the list can be sorted without loading every reading), and it has to be
 * recomputed the moment a new reading lands rather than nightly.
 *
 * The thresholds below are the ordinary clinical ones. They are deliberately
 * cautious and are a prompt to look, never a diagnosis — the doctor decides.
 */

export type RiskLevel = "none" | "watch" | "high" | "critical";

export const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 3,
  high: 2,
  watch: 1,
  none: 0,
};

export const RISK_LABEL: Record<string, string> = {
  critical: "Needs attention now",
  high: "High",
  watch: "Watch",
  none: "Stable",
};

export type Reading = {
  systolic?: number | null;
  diastolic?: number | null;
  glucose_mg_dl?: number | null;
  glucose_context?: string | null;
};

/** The worse of two levels. */
export function worse(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/** Blood pressure, on its own. */
export function bpRisk(systolic?: number | null, diastolic?: number | null): { level: RiskLevel; reason: string | null } {
  if (systolic == null || diastolic == null) return { level: "none", reason: null };
  // A hypertensive crisis: this is the one that means "today", not "next visit".
  if (systolic >= 180 || diastolic >= 120) {
    return { level: "critical", reason: `BP ${systolic}/${diastolic} — hypertensive range` };
  }
  if (systolic >= 160 || diastolic >= 100) {
    return { level: "high", reason: `BP ${systolic}/${diastolic}` };
  }
  if (systolic >= 140 || diastolic >= 90) {
    return { level: "watch", reason: `BP ${systolic}/${diastolic}` };
  }
  // Symptomatically low readings matter too.
  if (systolic < 90 || diastolic < 60) {
    return { level: "high", reason: `BP ${systolic}/${diastolic} — low` };
  }
  return { level: "none", reason: null };
}

/** Blood sugar, read against what the member said it was. */
export function glucoseRisk(
  value?: number | null,
  context?: string | null
): { level: RiskLevel; reason: string | null } {
  if (value == null) return { level: "none", reason: null };
  const fasting = context !== "random";
  const label = `Sugar ${value} mg/dL${fasting ? " fasting" : ""}`;

  if (value < 54) return { level: "critical", reason: `${label} — very low` };
  if (value < 70) return { level: "high", reason: `${label} — low` };

  if (fasting) {
    if (value >= 300) return { level: "critical", reason: label };
    if (value >= 180) return { level: "high", reason: label };
    if (value >= 126) return { level: "watch", reason: label };
  } else {
    if (value >= 350) return { level: "critical", reason: label };
    if (value >= 250) return { level: "high", reason: label };
    if (value >= 200) return { level: "watch", reason: label };
  }
  return { level: "none", reason: null };
}

/** Everything we know from one reading, combined. */
export function rateReading(r: Reading): { level: RiskLevel; reason: string | null } {
  const bp = bpRisk(r.systolic, r.diastolic);
  const sugar = glucoseRisk(r.glucose_mg_dl, r.glucose_context);
  const level = worse(bp.level, sugar.level);
  if (level === "none") return { level, reason: null };
  const reasons = [bp, sugar]
    .filter((x) => x.reason && RISK_ORDER[x.level] === RISK_ORDER[level])
    .map((x) => x.reason);
  return { level, reason: reasons.join(" · ") || null };
}

/**
 * The level to act on: a doctor's own call, or the automatic one.
 *
 * A threshold sees one number. A doctor sees the person, so when they have
 * made a judgement it stands until they change it — including marking someone
 * low risk whose numbers look alarming for reasons the doctor understands.
 */
export function effectiveRisk(member: {
  risk_level?: string | null;
  risk_manual?: string | null;
}): { level: RiskLevel; manual: boolean } {
  const manual = member.risk_manual;
  if (manual && manual in RISK_ORDER) return { level: manual as RiskLevel, manual: true };
  const auto = member.risk_level ?? "none";
  return { level: (auto in RISK_ORDER ? auto : "none") as RiskLevel, manual: false };
}

/**
 * Rate what a member told us when they joined.
 *
 * The baseline is the first thing we know about them, and until they log
 * something it is the only thing — so someone who enrols with a reading in
 * crisis range should be flagged from the moment they pay, not from their
 * first tick weeks later.
 */
export function rateBaseline(b: {
  baseline_bp_systolic?: number | null;
  baseline_bp_diastolic?: number | null;
  baseline_glucose_mg_dl?: number | null | { toString(): string };
  baseline_glucose_context?: string | null;
  medication_adherence?: string | null;
}): { level: RiskLevel; reason: string | null } {
  const glucose =
    b.baseline_glucose_mg_dl == null ? null : Number(b.baseline_glucose_mg_dl.toString());

  const rated = rateReading({
    systolic: b.baseline_bp_systolic,
    diastolic: b.baseline_bp_diastolic,
    glucose_mg_dl: glucose,
    glucose_context: b.baseline_glucose_context,
  });

  // Someone who barely takes their medication is worth a look even when the
  // numbers they gave us look fine — often because they are guessing.
  if (b.medication_adherence === "rarely" || b.medication_adherence === "few_weekly") {
    const level = worse(rated.level, "watch");
    const note = "Reported missing doses often";
    return { level, reason: rated.reason ? `${rated.reason} · ${note}` : note };
  }
  return rated;
}
