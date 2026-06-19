export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

/** GET /api/lab/sops — list this lab's Standard Operating Procedures. */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sops = await prisma.labSop.findMany({
    where: { lab_id: auth.lab_id },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return NextResponse.json({ sops });
}

const CreateSchema = z.object({
  title: z.string().min(1).max(160),
  category: z.string().max(80).optional().or(z.literal("")),
  department: z.string().max(60).optional().or(z.literal("")),
  content: z.string().max(20000).optional().or(z.literal("")),
});

/** POST /api/lab/sops — create an SOP. Requires can_manage_templates. */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const sop = await prisma.labSop.create({
    data: {
      lab_id: auth.lab_id,
      title: d.title.trim(),
      category: d.category?.trim() || null,
      department: d.department?.trim() || null,
      content: d.content ?? "",
      created_by: auth.actor_email ?? null,
    },
  });

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "sop_created", detail: d.title });
  return NextResponse.json({ sop });
}
