export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { markSeenWithCommission } from "@/lib/lims";

const Schema = z.object({
  requestId: z.string().uuid(),
  tests_confirmed: z.boolean().optional(),
  is_paid: z.boolean().optional(),
  arrived: z.boolean().optional(),
});

/**
 * POST /api/lab/requests/registration
 * Records the registration gate flags — staff confirm the tests and mark the
 * client as paid before the request can move down the pipeline. Marking paid
 * also promotes the request to "seen" (and accrues commission). Requires
 * can_mark_seen.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  const { requestId, tests_confirmed, is_paid, arrived } = parsed.data;

  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, lab_id: true, code: true } });
  if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const data: Record<string, unknown> = {};
  if (tests_confirmed !== undefined) data.tests_confirmed = tests_confirmed;
  if (is_paid !== undefined) data.is_paid = is_paid;
  if (arrived !== undefined) data.arrived_at = arrived ? new Date() : null;
  if (Object.keys(data).length === 0) return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });

  await prisma.request.update({ where: { id: requestId }, data });

  // Marking the client as paid also marks the request seen + accrues commission.
  if (is_paid === true) {
    await markSeenWithCommission(requestId).catch((e) => console.error("[registration] markSeen failed:", e));
  }

  if (auth.actor_email) {
    const parts = [tests_confirmed !== undefined ? `tests ${tests_confirmed ? "confirmed" : "unconfirmed"}` : null, is_paid !== undefined ? (is_paid ? "marked paid" : "marked unpaid") : null, arrived !== undefined ? (arrived ? "marked arrived" : "arrival cleared") : null].filter(Boolean).join(", ");
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "request_registration", detail: `Request ${req.code}: ${parts}` });
  }

  return NextResponse.json({ success: true });
}
