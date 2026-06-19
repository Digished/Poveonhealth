/**
 * Client-safe LIMS constants & pure helpers (no DB imports) — shared by both
 * server code (`src/lib/lims.ts` re-exports these) and client components.
 */

/** Ordered journey stages a specimen/request moves through (specimen workflow). */
export const JOURNEY_STAGES = [
  "registered",
  "collected",
  "received",
  "in_analysis",
  "verified",
  "reported",
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export const STAGE_LABELS: Record<JourneyStage, string> = {
  registered: "Registered",
  collected: "Collected",
  received: "Received",
  in_analysis: "In analysis",
  verified: "Verified",
  reported: "Reported",
};

export function isJourneyStage(value: string): value is JourneyStage {
  return (JOURNEY_STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: string): number {
  return (JOURNEY_STAGES as readonly string[]).indexOf(stage);
}

// ─── Departments & per-department workflows ──────────────────────────────────

export type WorkflowType = "specimen" | "imaging" | "procedure";

/** Ordered stages for each workflow type. */
export const WORKFLOWS: Record<WorkflowType, string[]> = {
  specimen: ["registered", "collected", "received", "in_analysis", "verified", "reported"],
  imaging: ["registered", "scheduled", "performed", "verified", "reported"],
  procedure: ["registered", "performed", "verified", "reported"],
};

/** Human labels for every stage used across workflows. */
export const ALL_STAGE_LABELS: Record<string, string> = {
  registered: "Registered",
  collected: "Collected",
  received: "Received",
  in_analysis: "In analysis",
  scheduled: "Scheduled",
  performed: "Performed",
  verified: "Verified",
  reported: "Reported",
};

export function stageLabel(stage: string): string {
  return ALL_STAGE_LABELS[stage] ?? stage;
}

/** All selectable departments (for filters / role scoping). */
export const DEPARTMENTS = [
  "Laboratory",
  "Hematology",
  "Chemistry",
  "Microbiology",
  "Immunology",
  "Histopathology",
  "Radiology",
  "Sonography",
  "Cardiology",
] as const;

/** Map a test category (from resolve-tests / test_breakdown) to a department + workflow. */
export function categoryToDepartment(category: string | null | undefined): { department: string; workflow: WorkflowType } {
  const c = (category ?? "").toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => c.includes(k));

  if (has("ultrasound", "doppler", "echocard", "sonograph")) return { department: "Sonography", workflow: "imaging" };
  if (has("x-ray", "x ray", "xray", "ct", "mri", "pet", "mammogr", "fluoroscop", "dexa", "radiograph", "radiology", "interventional", "imaging")) return { department: "Radiology", workflow: "imaging" };
  if (has("ecg", "ekg", "cardiac", "echo", "treadmill", "holter")) return { department: "Cardiology", workflow: "procedure" };
  if (has("hematolog", "haematolog", "blood count", "fbc", "cbc")) return { department: "Hematology", workflow: "specimen" };
  if (has("chemistry", "biochem", "metabolic", "lipid", "liver", "renal", "electrolyt", "endocrin", "hormone")) return { department: "Chemistry", workflow: "specimen" };
  if (has("microbiolog", "culture", "parasit", "stool", "swab")) return { department: "Microbiology", workflow: "specimen" };
  if (has("immunolog", "serolog", "antibody", "antigen")) return { department: "Immunology", workflow: "specimen" };
  if (has("histopath", "cytolog", "biopsy", "pap")) return { department: "Histopathology", workflow: "specimen" };
  return { department: "Laboratory", workflow: "specimen" };
}

type BreakdownItem = { category?: string | null; raw?: string; canonical_name?: string };

/** Distinct departments (+ workflow) a request touches, derived from its test breakdown. */
export function requestDepartments(testBreakdown: unknown): { department: string; workflow: WorkflowType }[] {
  const seen = new Map<string, WorkflowType>();
  const items = Array.isArray(testBreakdown) ? (testBreakdown as BreakdownItem[]) : [];
  for (const it of items) {
    const { department, workflow } = categoryToDepartment(it.category);
    if (!seen.has(department)) seen.set(department, workflow);
  }
  if (seen.size === 0) seen.set("Laboratory", "specimen");
  return Array.from(seen.entries()).map(([department, workflow]) => ({ department, workflow }));
}

/** Workflow for a department (defaults to specimen). */
export function workflowForDepartment(department: string | null | undefined): WorkflowType {
  if (department === "Radiology" || department === "Sonography") return "imaging";
  if (department === "Cardiology") return "procedure";
  return "specimen";
}
