export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { addJourneyEvent, markSeenWithCommission, getLabDepartments, WORKFLOWS, workflowForDepartment, stageLabel } from "@/lib/lims";

const Schema = z.object({
  requestId: z.string().uuid(),
  stage: z.string().min(1).max(40),
  department: z.string().max(60).optional(),
  sample_label: z.string().max(60).optional(),
  note: z.string().max(500).optional(),
  scheduled_at: z.string().datetime().optional(),
});

/**
 * POST /api/lab/journey/advance
 * Appends a journey-stage event to a request's department track. Requires
 * can_mark_seen or can_mark_done. Department-scoped roles may only advance
 * their own department's tracks.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen && !auth.permissions.can_mark_done) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { requestId, stage, department, sample_label, note, scheduled_at } = parsed.data;

  // Validate the stage belongs to the department's workflow (per this lab's config).
  const labDepartments = await getLabDepartments(auth.lab_id);
  const workflow = workflowForDepartment(department, labDepartments);
  if (!WORKFLOWS[workflow].includes(stage)) {
    return NextResponse.json({ error: `Stage "${stage}" is not valid for this department` }, { status: 400 });
  }

  // Department scoping: a scoped member may only touch their own department.
  if (auth.department && department && auth.department !== department) {
    return NextResponse.json({ error: "Your role is limited to the " + auth.department + " department" }, { status: 403 });
  }

  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, lab_id: true, code: true, is_paid: true } });
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.lab_id !== auth.lab_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Registration gate: a request cannot move down the pipeline until the client
  // has been confirmed & marked as paid.
  if (stage !== "registered" && !req.is_paid) {
    return NextResponse.json({ error: "Confirm the tests and mark the client as paid before advancing." }, { status: 409 });
  }

  await addJourneyEvent({ requestId, stage, department: department ?? null, sampleLabel: sample_label ?? null, actorEmail: auth.actor_email, note: note ?? null });

  // Persist the structured appointment time when scheduling (powers the calendar).
  if (stage === "scheduled" && scheduled_at) {
    await prisma.request.update({ where: { id: requestId }, data: { scheduled_at: new Date(scheduled_at) } }).catch(() => {});
  }

  // Derive coarse status from journey progress: any advance past registration
  // marks the patient "seen" (and accrues commission) — so a separate manual
  // "mark seen" step is no longer required. Idempotent. (Completion to "done"
  // is handled when results are reported.)
  if (stage !== "registered" && auth.permissions.can_mark_seen) {
    await markSeenWithCommission(requestId).catch((e) => console.error("[journey/advance] auto-seen failed:", e));
  }

  if (auth.actor_email) {
    logLabActivity({
      lab_id: auth.lab_id,
      actor_email: auth.actor_email,
      actor_role: auth.auth_method === "session" ? "owner" : "member",
      action: "journey_advance",
      detail: `Request ${req.code}${department ? ` · ${department}` : ""} → ${stageLabel(stage)}${sample_label ? ` (${sample_label})` : ""}`,
    });
  }

  return NextResponse.json({ success: true, stage });
}
