export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/hl7 — HL7 message log for the lab (most recent first).
 * Optional ?direction=outbound|inbound and ?status= filters. Requires
 * can_manage_api_keys (integration operator).
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_api_keys) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const direction = request.nextUrl.searchParams.get("direction");
  const status = request.nextUrl.searchParams.get("status");

  const messages = await prisma.hL7Message.findMany({
    where: {
      lab_id: auth.lab_id,
      ...(direction === "outbound" || direction === "inbound" ? { direction } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 100,
    select: { id: true, request_id: true, result_id: true, direction: true, message_type: true, control_id: true, status: true, ack_text: true, attempts: true, created_at: true },
  });
  return NextResponse.json({ messages });
}
