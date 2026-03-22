import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const Schema = z.object({
  action: z.string().min(1).max(64),
  detail: z.string().max(255).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false }, { status: 400 });

    // Get actor email from Supabase session
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const actorEmail = user?.email ?? "unknown";
    const actorRole = user?.user_metadata?.role === "lab" ? "owner" : "member";

    logLabActivity({
      lab_id: auth.lab_id,
      actor_email: actorEmail,
      actor_role: actorRole,
      action: parsed.data.action,
      detail: parsed.data.detail,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lab/log-activity]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
