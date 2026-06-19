import { prisma } from "@/lib/prisma";

/**
 * Shared LIMS helpers: the sample / client-journey timeline and the
 * professional referral-commission accrual ledger.
 */

/** Ordered journey stages a sample/request moves through. */
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

/**
 * Append a journey event for a request and denormalize the latest stage onto
 * the request. Fire-and-forget safe: callers may await or ignore.
 */
export async function addJourneyEvent(params: {
  requestId: string;
  stage: JourneyStage;
  actorEmail?: string | null;
  note?: string | null;
}): Promise<void> {
  const { requestId, stage, actorEmail, note } = params;
  await prisma.requestJourneyEvent.create({
    data: {
      request_id: requestId,
      stage,
      actor_email: actorEmail ?? null,
      note: note ?? null,
    },
  });
  await prisma.request.update({
    where: { id: requestId },
    data: { current_stage: stage },
  });
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
 * request): a second call for the same request is a no-op. Never throws.
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
