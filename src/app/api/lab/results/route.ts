export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { computeFlag } from "@/lib/result-render";

/** GET /api/lab/results?requestId= — results for a request. */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("requestId");
  const results = await prisma.requestResult.findMany({
    where: { lab_id: auth.lab_id, ...(requestId ? { request_id: requestId } : {}) },
    orderBy: { created_at: "desc" },
    take: 200,
  });
  return NextResponse.json({ results });
}

const ValueSchema = z.object({
  name: z.string().min(1).max(120),
  value: z.string().max(120).optional().or(z.literal("")),
  unit: z.string().max(40).optional().or(z.literal("")),
  reference_range: z.string().max(80).optional().or(z.literal("")),
  group: z.string().max(80).optional().or(z.literal("")),
});

const Schema = z.object({
  id: z.string().uuid().optional(), // present = update existing draft
  request_id: z.string().uuid(),
  template_id: z.string().uuid().nullable().optional(),
  department: z.string().max(60).nullable().optional(),
  values: z.array(ValueSchema).max(300),
  comment: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * POST /api/lab/results — create or update a draft result. Requires can_mark_done.
 * H/L flags are computed server-side from each value vs its reference range.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_done) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Department scoping.
  if (auth.department && d.department && auth.department !== d.department) {
    return NextResponse.json({ error: "Your role is limited to the " + auth.department + " department" }, { status: 403 });
  }

  const req = await prisma.request.findUnique({ where: { id: d.request_id }, select: { lab_id: true } });
  if (!req || req.lab_id !== auth.lab_id) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const values = d.values.map((v) => ({
    name: v.name,
    value: v.value || "",
    unit: v.unit || "",
    reference_range: v.reference_range || "",
    group: v.group || "",
    flag: computeFlag(v.value || undefined, v.reference_range || undefined),
  }));

  if (d.id) {
    const existing = await prisma.requestResult.findUnique({ where: { id: d.id }, select: { lab_id: true, status: true } });
    if (!existing || existing.lab_id !== auth.lab_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "reported") return NextResponse.json({ error: "This result has already been reported" }, { status: 400 });
    const result = await prisma.requestResult.update({
      where: { id: d.id },
      data: { template_id: d.template_id ?? null, department: d.department ?? null, values, comment: d.comment || null },
    });
    return NextResponse.json({ result });
  }

  const result = await prisma.requestResult.create({
    data: {
      lab_id: auth.lab_id,
      request_id: d.request_id,
      template_id: d.template_id ?? null,
      department: d.department ?? null,
      values,
      comment: d.comment || null,
      status: "draft",
    },
  });
  return NextResponse.json({ result });
}
