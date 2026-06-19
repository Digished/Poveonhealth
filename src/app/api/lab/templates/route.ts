export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

/** GET /api/lab/templates — list this lab's test panels. */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await prisma.labTestTemplate.findMany({
    where: { lab_id: auth.lab_id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ templates });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category_label: z.string().max(120).optional(),
  test_names: z.array(z.string().min(1).max(200)).min(1).max(100),
  tat_hours: z.number().int().min(0).max(8760).nullable().optional(),
});

/** POST /api/lab/templates — create a panel. Requires can_manage_templates. */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const exists = await prisma.labTestTemplate.findFirst({ where: { lab_id: auth.lab_id, name: d.name } });
  if (exists) return NextResponse.json({ error: "A template with that name already exists" }, { status: 409 });

  const template = await prisma.labTestTemplate.create({
    data: {
      lab_id: auth.lab_id,
      name: d.name,
      description: d.description || null,
      category_label: d.category_label || null,
      test_names: d.test_names,
      tat_hours: d.tat_hours ?? null,
      created_by: auth.actor_email ?? null,
    },
  });

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, actor_role: auth.auth_method === "session" ? "owner" : "member", action: "template_created", detail: `Template "${d.name}"` });

  return NextResponse.json({ template });
}
