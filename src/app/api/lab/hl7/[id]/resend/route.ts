export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { resendHl7Message } from "@/lib/hl7/send";

/** POST /api/lab/hl7/[id]/resend — re-post a stored HL7 message to Mirth. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_api_keys) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await resendHl7Message(params.id, auth.lab_id);
  if (result.skipped) {
    const msg = result.reason === "mirth-disabled" ? "Mirth integration is not enabled" : "Message not found";
    return NextResponse.json({ error: msg }, { status: result.reason === "not-found" ? 404 : 400 });
  }

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "hl7_resent", detail: `${params.id} → ${result.status}` });
  return NextResponse.json({ success: true, status: result.status });
}
