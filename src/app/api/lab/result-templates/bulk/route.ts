export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { normalizeParam } from "@/lib/result-template-shared";

const ParamSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().max(40).optional().or(z.literal("")),
  reference_range: z.string().max(80).optional().or(z.literal("")),
  group: z.string().max(80).optional().or(z.literal("")),
  loinc: z.string().max(20).optional().or(z.literal("")),
  test_code: z.string().max(40).optional().or(z.literal("")),
  specimen: z.string().max(40).optional().or(z.literal("")),
});

const TemplateSchema = z.object({
  name: z.string().min(1).max(120),
  department: z.string().max(60).optional().or(z.literal("")),
  interpretation: z.string().max(2000).optional().or(z.literal("")),
  parameters: z.array(ParamSchema).min(1).max(200),
});

const BodySchema = z.object({
  templates: z.array(TemplateSchema).max(500),
  /** When true, templates absent from the payload are deleted (full-sheet sync). */
  prune: z.boolean().optional(),
});

/**
 * PUT /api/lab/result-templates/bulk
 * Spreadsheet-grid save: upsert every template in the payload by name, and
 * (when prune=true) delete any of the lab's templates not present — so the
 * whole set is edited like one document. Requires can_manage_templates.
 */
export async function PUT(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const { templates, prune } = parsed.data;

  // Reject duplicate names within the payload (case-insensitive) — they'd
  // collide on the (lab_id, name) unique constraint.
  const seen = new Set<string>();
  for (const t of templates) {
    const key = t.name.trim().toLowerCase();
    if (seen.has(key)) return NextResponse.json({ error: `Duplicate template name: "${t.name}"` }, { status: 400 });
    seen.add(key);
  }

  const existing = await prisma.labResultTemplate.findMany({
    where: { lab_id: auth.lab_id },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));

  let created = 0;
  let updated = 0;
  for (const t of templates) {
    const data = {
      department: t.department || null,
      interpretation: t.interpretation || null,
      parameters: t.parameters.map(normalizeParam),
    };
    const match = byName.get(t.name.trim().toLowerCase());
    if (match) {
      await prisma.labResultTemplate.update({ where: { id: match.id }, data: { name: t.name.trim(), ...data } });
      updated++;
    } else {
      await prisma.labResultTemplate.create({ data: { lab_id: auth.lab_id, name: t.name.trim(), created_by: auth.actor_email ?? null, ...data } });
      created++;
    }
  }

  let deleted = 0;
  if (prune) {
    const keep = new Set(templates.map((t) => t.name.trim().toLowerCase()));
    const toDelete = existing.filter((e) => !keep.has(e.name.toLowerCase())).map((e) => e.id);
    if (toDelete.length) {
      const res = await prisma.labResultTemplate.deleteMany({ where: { id: { in: toDelete }, lab_id: auth.lab_id } });
      deleted = res.count;
    }
  }

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "result_templates_bulk_saved", detail: `${created} new, ${updated} updated, ${deleted} removed` });
  }

  const all = await prisma.labResultTemplate.findMany({ where: { lab_id: auth.lab_id }, orderBy: { name: "asc" } });
  return NextResponse.json({ success: true, created, updated, deleted, templates: all });
}
