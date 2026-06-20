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

/**
 * Tailwind classes (border + tint + text, dark-theme) giving each pipeline
 * stage its own colour so progress is readable at a glance in the workstation.
 */
export function stageColorClasses(stage: string): string {
  switch (stage) {
    case "registered": return "border-slate-400/20 bg-slate-500/15 text-slate-300";
    case "collected":
    case "scheduled": return "border-sky-400/20 bg-sky-500/15 text-sky-300";
    case "received": return "border-indigo-400/20 bg-indigo-500/15 text-indigo-300";
    case "in_analysis":
    case "performed": return "border-amber-400/20 bg-amber-500/15 text-amber-300";
    case "verified": return "border-violet-400/20 bg-violet-500/15 text-violet-300";
    case "reported": return "border-emerald-400/20 bg-emerald-500/15 text-emerald-300";
    default: return "border-white/10 bg-white/5 text-slate-300";
  }
}

/**
 * A configurable department: a display name, the pipeline it follows, and the
 * lowercase keywords that route a test's category (or name) into it. Labs can
 * customise these via the LabDepartment table; when a lab has none configured
 * the app falls back to DEFAULT_DEPARTMENTS below.
 */
export interface DepartmentConfig {
  name: string;
  workflow: WorkflowType;
  categories: string[];
}

/**
 * Two real-world departments cover how a modern lab actually works:
 *  • Laboratory — anything collected as a sample (blood, urine, swab, stool,
 *    histology / biopsy) → specimen workflow.
 *  • Radiology — anything performed on the patient (x-ray, scans, ultrasound,
 *    ECG, echo, endoscopy) → imaging / scheduled-procedure workflow.
 * Laboratory is the catch-all fallback; Radiology only wins when an imaging
 * keyword is present.
 */
export const DEFAULT_DEPARTMENTS: DepartmentConfig[] = [
  {
    name: "Laboratory",
    workflow: "specimen",
    categories: [
      "blood", "urine", "swab", "stool", "serum", "plasma", "specimen", "sample",
      "hematolog", "haematolog", "blood count", "fbc", "cbc",
      "chemistry", "biochem", "metabolic", "lipid", "liver", "renal", "electrolyt", "endocrin", "hormone",
      "microbiolog", "culture", "parasit", "immunolog", "serolog", "antibody", "antigen",
      "histopath", "cytolog", "biopsy", "pap",
    ],
  },
  {
    name: "Radiology",
    workflow: "imaging",
    categories: [
      "radiolog", "imaging", "x-ray", "x ray", "xray", "ct scan", "ct-scan", "mri", "pet scan",
      "mammogr", "fluoroscop", "dexa", "radiograph", "ultrasound", "doppler", "sonograph", "scan",
      "ecg", "ekg", "echocard", "echo", "treadmill", "holter", "endoscop", "cardiolog",
    ],
  },
];

/** Names of the built-in default departments (fallback for filters / dropdowns). */
export const DEPARTMENTS = DEFAULT_DEPARTMENTS.map((d) => d.name) as readonly string[];

/**
 * Route a piece of text (a test's category, falling back to its name) to the
 * first department whose keywords it matches. When nothing matches we fall back
 * to the "Laboratory" catch-all (or the first configured department).
 */
export function matchDepartment(text: string | null | undefined, departments: DepartmentConfig[] = DEFAULT_DEPARTMENTS): DepartmentConfig {
  const c = (text ?? "").toLowerCase();
  // Imaging-type keywords should win over the broad Laboratory list, so check
  // any non-first department first, then fall through to the catch-all.
  for (const d of departments) {
    if (d.name.toLowerCase() === "laboratory") continue;
    if (d.categories.some((k) => k && c.includes(k))) return d;
  }
  for (const d of departments) {
    if (d.categories.some((k) => k && c.includes(k))) return d;
  }
  return departments.find((d) => d.name.toLowerCase() === "laboratory") ?? departments[0] ?? DEFAULT_DEPARTMENTS[0];
}

/** Map a test category (from resolve-tests / test_breakdown) to a department + workflow. */
export function categoryToDepartment(category: string | null | undefined, departments: DepartmentConfig[] = DEFAULT_DEPARTMENTS): { department: string; workflow: WorkflowType } {
  const d = matchDepartment(category, departments);
  return { department: d.name, workflow: d.workflow };
}

type BreakdownItem = { category?: string | null; raw?: string; canonical_name?: string };

/** Distinct departments (+ workflow) a request touches, derived from its test breakdown. */
export function requestDepartments(testBreakdown: unknown, departments: DepartmentConfig[] = DEFAULT_DEPARTMENTS): { department: string; workflow: WorkflowType }[] {
  const seen = new Map<string, WorkflowType>();
  const items = Array.isArray(testBreakdown) ? (testBreakdown as BreakdownItem[]) : [];
  for (const it of items) {
    const { department, workflow } = categoryToDepartment(it.category, departments);
    if (!seen.has(department)) seen.set(department, workflow);
  }
  if (seen.size === 0) {
    const d = departments.find((x) => x.name.toLowerCase() === "laboratory") ?? departments[0] ?? DEFAULT_DEPARTMENTS[0];
    seen.set(d.name, d.workflow);
  }
  return Array.from(seen.entries()).map(([department, workflow]) => ({ department, workflow }));
}

/** Workflow for a department, looked up in the lab's config (defaults to specimen). */
export function workflowForDepartment(department: string | null | undefined, departments: DepartmentConfig[] = DEFAULT_DEPARTMENTS): WorkflowType {
  return departments.find((d) => d.name === department)?.workflow ?? "specimen";
}
