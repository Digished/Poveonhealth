export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

const ParamSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().max(40).optional().or(z.literal("")),
  reference_range: z.string().max(80).optional().or(z.literal("")),
  group: z.string().max(80).optional().or(z.literal("")),
});

/** GET /api/lab/result-templates — list result-report templates. */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await prisma.labResultTemplate.findMany({
    where: { lab_id: auth.lab_id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ templates });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  department: z.string().max(60).optional().or(z.literal("")),
  parameters: z.array(ParamSchema).min(1).max(200),
  interpretation: z.string().max(2000).optional().or(z.literal("")),
});

/** POST /api/lab/result-templates — create a result template. Requires can_manage_templates. */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const exists = await prisma.labResultTemplate.findFirst({ where: { lab_id: auth.lab_id, name: d.name } });
  if (exists) return NextResponse.json({ error: "A result template with that name already exists" }, { status: 409 });

  const template = await prisma.labResultTemplate.create({
    data: {
      lab_id: auth.lab_id,
      name: d.name,
      department: d.department || null,
      parameters: d.parameters.map((p) => ({ name: p.name, unit: p.unit || "", reference_range: p.reference_range || "", group: p.group || "" })),
      interpretation: d.interpretation || null,
      created_by: auth.actor_email ?? null,
    },
  });

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "result_template_created", detail: d.name });
  return NextResponse.json({ template });
}
