export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { addJourneyEvent, JOURNEY_STAGES, STAGE_LABELS, JourneyStage } from "@/lib/lims";

const Schema = z.object({
  requestId: z.string().uuid(),
  stage: z.enum(JOURNEY_STAGES),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/lab/journey/advance
 * Appends a journey-stage event to a request. Requires can_mark_seen
 * (the journey is part of moving a sample through the lab).
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { requestId, stage, note } = parsed.data;

  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, lab_id: true, code: true } });
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.lab_id !== auth.lab_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await addJourneyEvent({ requestId, stage: stage as JourneyStage, actorEmail: auth.actor_email, note: note ?? null });

  if (auth.actor_email) {
    logLabActivity({
      lab_id: auth.lab_id,
      actor_email: auth.actor_email,
      actor_role: auth.auth_method === "session" ? "owner" : "member",
      action: "journey_advance",
      detail: `Request ${req.code} → ${STAGE_LABELS[stage as JourneyStage]}`,
    });
  }

  return NextResponse.json({ success: true, stage });
}
