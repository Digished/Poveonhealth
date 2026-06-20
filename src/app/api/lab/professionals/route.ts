export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

/** GET /api/lab/professionals — list professionals with commission totals. */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const professionals = await prisma.labProfessional.findMany({
    where: { lab_id: auth.lab_id },
    orderBy: { created_at: "desc" },
  });

  // Accrued vs paid totals per professional.
  const grouped = await prisma.professionalCommission.groupBy({
    by: ["professional_id", "status"],
    where: { lab_id: auth.lab_id },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const totals: Record<string, { accrued: number; paid: number; count: number }> = {};
  for (const g of grouped) {
    const t = (totals[g.professional_id] ??= { accrued: 0, paid: 0, count: 0 });
    const amt = Number(g._sum.amount ?? 0);
    if (g.status === "paid") t.paid += amt; else t.accrued += amt;
    t.count += g._count._all;
  }

  return NextResponse.json({
    professionals: professionals.map((p) => ({
      ...p,
      commission_value: Number(p.commission_value),
      totals: totals[p.id] ?? { accrued: 0, paid: 0, count: 0 },
    })),
  });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  specialty: z.string().max(120).optional(),
  hospital: z.string().max(200).optional(),
  commission_type: z.enum(["percent", "flat"]).default("percent"),
  commission_value: z.number().min(0).max(1_000_000).default(0),
  bank_name: z.string().max(120).optional(),
  account_number: z.string().max(40).optional(),
  account_name: z.string().max(200).optional(),
});

/** POST /api/lab/professionals — add a professional. */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (d.commission_type === "percent" && d.commission_value > 100) {
    return NextResponse.json({ error: "Percentage commission cannot exceed 100" }, { status: 400 });
  }
  const email = d.email?.trim() || null;

  if (email) {
    const dup = await prisma.labProfessional.findFirst({ where: { lab_id: auth.lab_id, email } });
    if (dup) return NextResponse.json({ error: "A professional with that email already exists" }, { status: 409 });
  }

  const professional = await prisma.labProfessional.create({
    data: {
      lab_id: auth.lab_id,
      name: d.name,
      email,
      phone: d.phone || null,
      specialty: d.specialty || null,
      hospital: d.hospital || null,
      commission_type: d.commission_type,
      commission_value: d.commission_value,
      bank_name: d.bank_name || null,
      account_number: d.account_number || null,
      account_name: d.account_name || null,
    },
  });
  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "professional_added", detail: d.name });
  return NextResponse.json({ professional: { ...professional, commission_value: Number(professional.commission_value) } });
}
