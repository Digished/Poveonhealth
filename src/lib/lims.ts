import { prisma } from "@/lib/prisma";
import { requestDepartments, JourneyStage } from "@/lib/lims-shared";

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
  testBreakdown: unknown;
  actorEmail?: string | null;
}): Promise<void> {
  const depts = requestDepartments(params.testBreakdown);
  for (const { department } of depts) {
    await prisma.requestJourneyEvent.create({
      data: { request_id: params.requestId, stage: "registered", department, actor_email: params.actorEmail ?? null },
    }).catch(() => {});
  }
}

/** Push every department track of a request to its workflow's terminal "reported" stage. */
export async function reportAllTracks(requestId: string, testBreakdown: unknown, actorEmail?: string | null): Promise<void> {
  const depts = requestDepartments(testBreakdown);
  for (const { department } of depts) {
    await prisma.requestJourneyEvent.create({
      data: { request_id: requestId, stage: "reported", department, actor_email: actorEmail ?? null, note: "Results delivered" },
    }).catch(() => {});
  }
  await prisma.request.update({ where: { id: requestId }, data: { current_stage: "reported" } }).catch(() => {});
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
