export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { STANDARD_RESULT_TEMPLATES } from "@/lib/standard-result-templates";

/**
 * POST /api/lab/result-templates/seed
 * Bulk-creates the curated set of standard result templates for this lab,
 * skipping any whose name already exists. Requires can_manage_templates.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.labResultTemplate.findMany({
    where: { lab_id: auth.lab_id },
    select: { name: true },
  });
  const have = new Set(existing.map((t) => t.name.trim().toLowerCase()));

  const toCreate = STANDARD_RESULT_TEMPLATES.filter((t) => !have.has(t.name.trim().toLowerCase()));

  let created = 0;
  for (const t of toCreate) {
    await prisma.labResultTemplate.create({
      data: {
        lab_id: auth.lab_id,
        name: t.name,
        department: t.department || null,
        icon: t.icon || null,
        description: t.description || null,
        parameters: t.parameters.map((p) => ({ name: p.name, unit: p.unit || "", reference_range: p.reference_range || "", group: p.group || "" })),
        created_by: auth.actor_email ?? null,
      },
    });
    created++;
  }

  if (created > 0 && auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "result_templates_seeded", detail: `${created} standard templates` });
  }

  return NextResponse.json({ success: true, created, skipped: STANDARD_RESULT_TEMPLATES.length - toCreate.length });
}
