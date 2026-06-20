export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { resolveTests } from "@/lib/resolve-tests";

const Schema = z.object({
  requestId: z.string().uuid(),
  tests: z.string().min(1).max(2000),
});

/**
 * POST /api/lab/requests/update-tests
 * During registration (walk-in, QR, or a Poveon check-in) let the lab add or
 * remove the tests to be done. Recomputes test_breakdown so the per-department
 * journey tracks update accordingly. Blocked once the request is completed.
 * Requires can_mark_seen.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  const { requestId, tests } = parsed.data;

  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, lab_id: true, code: true, status: true } });
  if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  if (req.status === "done") return NextResponse.json({ success: false, error: "This request is completed and can no longer be edited" }, { status: 409 });

  let breakdown: unknown[] = [];
  try { breakdown = await resolveTests(tests, req.lab_id); } catch { /* keep tests, leave breakdown empty */ }

  await prisma.request.update({
    where: { id: requestId },
    data: { tests: tests.trim(), test_breakdown: breakdown.length ? (breakdown as object[]) : undefined },
  });

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "request_tests_updated", detail: `Request ${req.code}` });

  return NextResponse.json({ success: true });
}
