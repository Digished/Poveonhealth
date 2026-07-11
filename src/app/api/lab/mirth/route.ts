export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

/** Mask a secret for display — show only that one exists. */
function maskToken(token: string | null): boolean {
  return !!token && token.length > 0;
}

/** GET /api/lab/mirth — current Mirth integration config (token masked). */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_api_keys) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lab = await prisma.lab.findUnique({
    where: { id: auth.lab_id },
    select: { mirth_enabled: true, mirth_url: true, mirth_auth_token: true },
  });
  return NextResponse.json({
    enabled: lab?.mirth_enabled ?? false,
    url: lab?.mirth_url ?? "",
    has_token: maskToken(lab?.mirth_auth_token ?? null),
  });
}

const PutSchema = z.object({
  enabled: z.boolean().optional(),
  url: z.string().url().max(500).optional().or(z.literal("")),
  // Omit to leave unchanged; empty string clears it; a value sets it.
  token: z.string().max(500).optional(),
});

/** PUT /api/lab/mirth — update Mirth integration config. Requires can_manage_api_keys. */
export async function PUT(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_api_keys) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Guard: enabling requires a URL (either already stored or supplied now).
  if (d.enabled) {
    const current = await prisma.lab.findUnique({ where: { id: auth.lab_id }, select: { mirth_url: true } });
    const effectiveUrl = d.url !== undefined ? d.url : current?.mirth_url ?? "";
    if (!effectiveUrl) return NextResponse.json({ error: "A Mirth endpoint URL is required to enable the integration" }, { status: 400 });
  }

  await prisma.lab.update({
    where: { id: auth.lab_id },
    data: {
      ...(d.enabled !== undefined ? { mirth_enabled: d.enabled } : {}),
      ...(d.url !== undefined ? { mirth_url: d.url || null } : {}),
      ...(d.token !== undefined ? { mirth_auth_token: d.token || null } : {}),
    },
  });

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "mirth_config_updated", detail: d.enabled !== undefined ? `enabled=${d.enabled}` : "updated" });

  const lab = await prisma.lab.findUnique({ where: { id: auth.lab_id }, select: { mirth_enabled: true, mirth_url: true, mirth_auth_token: true } });
  return NextResponse.json({ enabled: lab?.mirth_enabled ?? false, url: lab?.mirth_url ?? "", has_token: maskToken(lab?.mirth_auth_token ?? null) });
}
