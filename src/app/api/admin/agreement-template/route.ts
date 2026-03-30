export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { serializeAgreementToText } from "@/lib/agreement/content";

const TEMPLATE_KEY = "agreement_template";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const admin = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return admin ? user : null;
}

/** GET /api/admin/agreement-template
 *  Returns the current global template. Falls back to the hardcoded default. */
export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await prisma.systemSetting.findUnique({ where: { key: TEMPLATE_KEY } });
  const template = row?.value ?? serializeAgreementToText("[LAB NAME]");

  return NextResponse.json({ success: true, template });
}

/** PUT /api/admin/agreement-template
 *  Saves a new global template. */
export async function PUT(request: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { template } = await request.json();
  if (!template || typeof template !== "string" || !template.trim()) {
    return NextResponse.json({ error: "Template text is required" }, { status: 400 });
  }

  await prisma.systemSetting.upsert({
    where: { key: TEMPLATE_KEY },
    create: { key: TEMPLATE_KEY, value: template.trim() },
    update: { value: template.trim() },
  });

  return NextResponse.json({ success: true });
}
