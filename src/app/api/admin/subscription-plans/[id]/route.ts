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

const UpdatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  fee: z.number().positive().optional(),
  leads_target: z.number().positive().optional(),
  period_type: z.enum(["monthly", "quarterly", "yearly", "custom"]).optional(),
  period_days: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    const body = await req.json();
    const parsed = UpdatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const plan = await prisma.subscriptionPlan.update({
      where: { id: params.id },
      data: { ...parsed.data, updated_at: new Date() },
    });
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    console.error("[subscription-plans/[id]] PUT error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin(req);
    if (!user) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const inUse = await prisma.labSubscription.findFirst({ where: { plan_id: params.id } });
    if (inUse) {
      return NextResponse.json(
        { success: false, error: "Cannot delete a plan that has active or past subscriptions. Deactivate it instead." },
        { status: 409 }
      );
    }

    await prisma.subscriptionPlan.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[subscription-plans/[id]] DELETE error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
