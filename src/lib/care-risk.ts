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
