export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

/** POST /api/lab/results/[id]/verify — authorize a result for release. Requires can_mark_done. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_done) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await prisma.requestResult.findUnique({ where: { id: params.id }, select: { lab_id: true, status: true, department: true, request: { select: { code: true } } } });
  if (!result || result.lab_id !== auth.lab_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth.department && result.department && auth.department !== result.department) {
    return NextResponse.json({ error: "Your role is limited to the " + auth.department + " department" }, { status: 403 });
  }

  const updated = await prisma.requestResult.update({
    where: { id: params.id },
    data: { status: "verified", verified_by: auth.actor_email ?? null, verified_at: new Date() },
  });

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "result_verified", detail: `Result verified for ${result.request.code}` });
  return NextResponse.json({ result: updated });
}
