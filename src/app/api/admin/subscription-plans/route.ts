export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const admin = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return admin ? user : null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
    return NextResponse.json({ success: true, plans });
  } catch (err) {
    console.error("[subscription-plans] GET error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

const CreatePlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  fee: z.number().positive(),
  leads_target: z.number().positive(),
  period_type: z.enum(["monthly", "quarterly", "yearly", "custom"]),
  period_days: z.number().int().positive().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const body = await req.json();
    const parsed = CreatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { period_type, period_days, ...rest } = parsed.data;
    if (period_type === "custom" && !period_days) {
      return NextResponse.json({ success: false, error: "period_days required for custom period" }, { status: 400 });
    }

    const plan = await prisma.subscriptionPlan.create({
      data: { ...rest, period_type, period_days: period_type === "custom" ? period_days : null },
    });
    return NextResponse.json({ success: true, plan }, { status: 201 });
  } catch (err) {
    console.error("[subscription-plans] POST error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
