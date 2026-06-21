/**
 * Pure helper that derives the single next action a lab must take to move a
 * client forward. Used to (a) badge list rows that need attention and (b)
 * highlight the matching button inside the request drawer. Client-safe — no DB.
 */
import {
  requestDepartments,
  categoryToDepartment,
  WORKFLOWS,
  stageLabel,
  DEFAULT_DEPARTMENTS,
  type DepartmentConfig,
} from "@/lib/lims-shared";

export type PendingActionKind =
  | "confirm_tests"
  | "mark_paid"
  | "collect"
  | "advance"
  | "enter_results"
  | "none";

export interface PendingAction {
  kind: PendingActionKind;
  /** Short imperative label, e.g. "Confirm tests", "Collect sample". */
  label: string;
  /** Department track the action belongs to (pipeline actions only). */
  department?: string;
  /** Target stage for an advance action. */
  stage?: string;
}

interface PendingRequestLike {
  status: string;
  is_paid: boolean;
  tests_confirmed: boolean;
  test_breakdown: unknown;
  journey_events: { stage: string; department: string | null }[];
}

/** Latest reached stage for a department track (defaults to "registered"). */
function currentStageFor(req: PendingRequestLike, department: string): string {
  const events = req.journey_events.filter((e) => e.department === department);
  return events.length ? events[events.length - 1].stage : "registered";
}

/**
 * The one next action that moves this client forward, or `null` when the request
 * is complete / nothing is pending. Registration steps (confirm tests → take
 * payment) take priority; once paid, the earliest-incomplete department track's
 * next pipeline step is returned.
 */
export function nextPendingAction(
  req: PendingRequestLike,
  departments: DepartmentConfig[] = DEFAULT_DEPARTMENTS,
): PendingAction | null {
  if (req.status === "done") return null;

  // Registration gate.
  if (!req.tests_confirmed) return { kind: "confirm_tests", label: "Confirm tests" };
  if (!req.is_paid) return { kind: "mark_paid", label: "Mark as paid" };

  // Pipeline — find the first track that hasn't reached its terminal stage.
  const tracks = requestDepartments(req.test_breakdown, departments);
  for (const { department, workflow } of tracks) {
    const stages = WORKFLOWS[workflow] ?? WORKFLOWS.specimen;
    const cur = currentStageFor(req, department);
    const idx = stages.indexOf(cur);
    if (idx >= 0 && idx < stages.length - 1) {
      const next = stages[idx + 1];
      if (next === "collected") return { kind: "collect", label: "Add collection", department };
      return { kind: "advance", label: stageLabel(next), department, stage: next };
    }
  }

  // All tracks at terminal stage but request not marked done → results pending.
  return { kind: "enter_results", label: "Send results", department: tracks[0]?.department };
}

/** Convenience: does this request need any lab action right now? */
export function hasPendingAction(req: PendingRequestLike, departments?: DepartmentConfig[]): boolean {
  return nextPendingAction(req, departments) !== null;
}

/** Departments a request must be routed to, with a human hint per workflow. */
export function directToDepartments(
  testBreakdown: unknown,
  departments: DepartmentConfig[] = DEFAULT_DEPARTMENTS,
): { department: string; workflow: string; hint: string }[] {
  return requestDepartments(testBreakdown, departments).map(({ department, workflow }) => ({
    department,
    workflow,
    hint:
      workflow === "imaging"
        ? "Schedule the scan / imaging"
        : workflow === "procedure"
          ? "Perform the procedure"
          : "Collect the sample",
  }));
}

export { categoryToDepartment };
