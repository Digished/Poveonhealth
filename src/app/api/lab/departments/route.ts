export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { DEFAULT_DEPARTMENTS } from "@/lib/lims-shared";

/**
 * GET /api/lab/departments
 * Returns the lab's configured departments (name, workflow, categories), or the
 * built-in defaults when the lab hasn't customised them. `customized` tells the
 * UI whether the rows are the lab's own or the fallback defaults.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.labDepartment.findMany({
    where: { lab_id: auth.lab_id, is_active: true },
    orderBy: { sort_order: "asc" },
    select: { name: true, workflow: true, categories: true },
  });

  if (rows.length === 0) {
    return NextResponse.json({ departments: DEFAULT_DEPARTMENTS, customized: false });
  }

  return NextResponse.json({
    departments: rows.map((r) => ({
      name: r.name,
      workflow: r.workflow,
      categories: Array.isArray(r.categories) ? r.categories : [],
    })),
    customized: true,
  });
}

const Schema = z.object({
  departments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        workflow: z.enum(["specimen", "imaging", "procedure"]),
        categories: z.array(z.string().trim().min(1).max(60)).max(200).default([]),
      })
    )
    .min(1)
    .max(20),
});

/**
 * PUT /api/lab/departments
 * Replaces the lab's department configuration. Requires team-management rights.
 * Names must be unique (case-insensitive). Categories are lower-cased so routing
 * is case-insensitive.
 */
export async function PUT(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const seen = new Set<string>();
  for (const d of parsed.data.departments) {
    const key = d.name.toLowerCase();
    if (seen.has(key)) return NextResponse.json({ error: `Duplicate department name: ${d.name}` }, { status: 400 });
    seen.add(key);
  }

  await prisma.$transaction([
    prisma.labDepartment.deleteMany({ where: { lab_id: auth.lab_id } }),
    prisma.labDepartment.createMany({
      data: parsed.data.departments.map((d, i) => ({
        lab_id: auth.lab_id,
        name: d.name,
        workflow: d.workflow,
        categories: Array.from(new Set(d.categories.map((c) => c.toLowerCase()))),
        sort_order: i,
        is_active: true,
      })),
    }),
  ]);

  return NextResponse.json({ success: true });
}
