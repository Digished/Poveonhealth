import { prisma } from "@/lib/prisma";
import { requestDepartments, JourneyStage, DEFAULT_DEPARTMENTS, type DepartmentConfig, type WorkflowType } from "@/lib/lims-shared";
import { resolveTests } from "@/lib/resolve-tests";

/**
 * Load a lab's configured departments, falling back to the built-in defaults
 * when the lab hasn't customised them. Used wherever a request's department
 * tracks are derived so server and client agree on the same routing.
 */
export async function getLabDepartments(labId: string): Promise<DepartmentConfig[]> {
  try {
    const rows = await prisma.labDepartment.findMany({
      where: { lab_id: labId, is_active: true },
      orderBy: { sort_order: "asc" },
      select: { name: true, workflow: true, categories: true },
    });
    if (rows.length === 0) return DEFAULT_DEPARTMENTS;
    return rows.map((r) => ({
      name: r.name,
      workflow: (r.workflow as WorkflowType) || "specimen",
      categories: Array.isArray(r.categories) ? (r.categories as unknown[]).map((c) => String(c).toLowerCase()) : [],
    }));
  } catch {
    return DEFAULT_DEPARTMENTS;
  }
}

/**
 * Server-side LIMS helpers (DB): the sample / client-journey timeline and the
 * professional referral-commission accrual ledger. Pure constants/helpers live
 * in `lims-shared.ts` and are re-exported here for existing server imports.
 */
export * from "@/lib/lims-shared";
export type { JourneyStage } from "@/lib/lims-shared";

/**
 * Append a journey event for a request and denormalize the latest stage onto
 * the request.
 */
export async function addJourneyEvent(params: {
  requestId: string;
  stage: string;
  department?: string | null;
  sampleLabel?: string | null;
  actorEmail?: string | null;
  note?: string | null;
}): Promise<void> {
  const { requestId, stage, department, sampleLabel, actorEmail, note } = params;
  await prisma.requestJourneyEvent.create({
    data: {
      request_id: requestId,
      stage,
      department: department ?? null,
      sample_label: sampleLabel ?? null,
      actor_email: actorEmail ?? null,
      note: note ?? null,
    },
  });
  await prisma.request.update({
    where: { id: requestId },
    data: { current_stage: stage },
  });
}

/** Seed a `registered` event for each department a request touches. */
export async function seedDepartmentTracks(params: {
  requestId: string;
  labId: string;
  testBreakdown: unknown;
  actorEmail?: string | null;
}): Promise<void> {
  const departments = await getLabDepartments(params.labId);
  const depts = requestDepartments(params.testBreakdown, departments);
  for (const { department } of depts) {
    await prisma.requestJourneyEvent.create({
      data: { request_id: params.requestId, stage: "registered", department, actor_email: params.actorEmail ?? null },
    }).catch(() => {});
  }
}

/** Push every department track of a request to its workflow's terminal "reported" stage. */
export async function reportAllTracks(requestId: string, labId: string, testBreakdown: unknown, actorEmail?: string | null): Promise<void> {
  const departments = await getLabDepartments(labId);
  const depts = requestDepartments(testBreakdown, departments);
  for (const { department } of depts) {
    await prisma.requestJourneyEvent.create({
      data: { request_id: requestId, stage: "reported", department, actor_email: actorEmail ?? null, note: "Results delivered" },
    }).catch(() => {});
  }
  await prisma.request.update({ where: { id: requestId }, data: { current_stage: "reported" } }).catch(() => {});
}

/**
 * Promote an `incoming` request to `seen`, computing & recording Poveon
 * commission and (if a wallet exists and the lab isn't on free trial) deducting
 * the fee. Idempotent — only acts while the request is still `incoming`, so it
 * is safe whether triggered by the manual "mark seen" action or automatically
 * by the first journey advance. Returns true if it promoted the request.
 */
export async function markSeenWithCommission(requestId: string): Promise<boolean> {
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    select: {
      id: true, lab_id: true, tests: true, test_breakdown: true, status: true, doctor_email: true,
      lab: { select: { free_trial: true } },
    },
  });
  if (!req || req.status !== "incoming") return false;

  const testsString = req.tests && req.tests !== "See attached image" ? req.tests : null;
  type BreakdownItem = { source?: string; poveon_fee?: number | null; unit_price?: number };
  let breakdown: BreakdownItem[] = [];
  if (testsString) {
    try { breakdown = (await resolveTests(testsString, req.lab_id)) as BreakdownItem[]; } catch { /* non-fatal */ }
  } else if (Array.isArray(req.test_breakdown)) {
    breakdown = req.test_breakdown as BreakdownItem[];
  }

  let poveonFee = 0;
  let labRevenue = 0;
  for (const item of breakdown) {
    if (item.source === "lab_catalog") {
      poveonFee += Number(item.poveon_fee ?? 0);
      labRevenue += Number(item.unit_price ?? 0);
    }
  }

  // Deduct commission from wallet — balance may go negative (lab owes Poveon).
  // Skipped only if the lab has no wallet provisioned, or is on free trial.
  let isPaidToPoveon = false;
  if (poveonFee > 0 && !req.lab.free_trial) {
    const wallet = await prisma.labWallet.findUnique({ where: { lab_id: req.lab_id } });
    if (wallet) {
      await prisma.labWallet.update({ where: { lab_id: req.lab_id }, data: { balance: { decrement: poveonFee } } });
      isPaidToPoveon = true;
    }
  }

  // Guarded UPDATE (status='incoming') keeps the wallet deduction single-shot
  // even under a concurrent manual + journey-driven trigger.
  const breakdownJson = breakdown.length > 0 ? JSON.stringify(breakdown) : null;
  if (breakdownJson) {
    await prisma.$executeRawUnsafe(
      `UPDATE requests SET status='seen', seen_at=NOW(), test_breakdown=$1::jsonb, poveon_amount=$2, lab_revenue_amount=$3, is_paid_to_poveon=$4 WHERE id=$5 AND status='incoming'`,
      breakdownJson, poveonFee, labRevenue, isPaidToPoveon, requestId,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE requests SET status='seen', seen_at=NOW(), poveon_amount=$1, lab_revenue_amount=$2, is_paid_to_poveon=$3 WHERE id=$4 AND status='incoming'`,
      poveonFee, labRevenue, isPaidToPoveon, requestId,
    );
  }

  await accrueProfessionalCommission({ labId: req.lab_id, requestId, doctorEmail: req.doctor_email, labRevenue });
  return true;
}

/** Map the coarse request status to its canonical journey stage. */
export function stageForStatus(status: string): JourneyStage | null {
  if (status === "incoming") return "registered";
  if (status === "seen") return "received";
  if (status === "done") return "reported";
  return null;
}

/**
 * Accrue a referral commission for the professional linked to a request
 * (matched by doctor_email within the same lab). Idempotent per (professional,
 * request). Never throws.
 */
export async function accrueProfessionalCommission(params: {
  labId: string;
  requestId: string;
  doctorEmail?: string | null;
  labRevenue: number;
}): Promise<void> {
  const { labId, requestId, doctorEmail, labRevenue } = params;
  if (!doctorEmail) return;
  try {
    const pro = await prisma.labProfessional.findFirst({
      where: { lab_id: labId, email: doctorEmail, active: true },
    });
    if (!pro) return;

    const existing = await prisma.professionalCommission.findFirst({
      where: { professional_id: pro.id, request_id: requestId },
      select: { id: true },
    });
    if (existing) return;

    const value = Number(pro.commission_value ?? 0);
    const amount =
      pro.commission_type === "flat"
        ? value
        : Math.round(((labRevenue * value) / 100) * 100) / 100;
    if (amount <= 0) return;

    await prisma.professionalCommission.create({
      data: {
        lab_id: labId,
        professional_id: pro.id,
        request_id: requestId,
        basis_amount: labRevenue,
        amount,
        status: "accrued",
      },
    });
  } catch (e) {
    console.error("[lims] accrueProfessionalCommission failed:", e);
  }
}
