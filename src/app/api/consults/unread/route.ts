export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMemberFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/consults/unread — what is waiting for the member.
 *
 * One count, for the badge on the chat button. Deliberately its own endpoint:
 * polling `/api/consults/me` every minute to colour a dot would fetch their
 * whole care plan each time.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ success: true, unread: 0 });

    const unread = await prisma.consultMessage.count({
      where: { patient_id: member.id, sender: "doctor", read_at: null },
    });

    return NextResponse.json({ success: true, unread });
  } catch (err) {
    console.error("[consults/unread]", err);
    return NextResponse.json({ success: true, unread: 0 });
  }
}
