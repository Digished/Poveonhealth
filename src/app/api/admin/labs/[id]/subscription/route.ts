export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

// GET /api/admin/labs/[id]/subscription — current subscription + history
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyAdmin();
    if (!user) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const subscriptions = await prisma.labSubscription.findMany({
      where: { lab_id: params.id },
      include: { plan: true },
      orderBy: { created_at: "desc" },
    });

    const active = subscriptions.find((s) => s.status === "active" || s.status === "exceeded");
    return NextResponse.json({ success: true, active: active ?? null, history: subscriptions });
  } catch (err) {
    console.error("[lab/subscription] GET error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

const AssignSchema = z.object({
  plan_id: z.string().uuid(),
  start_date: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

// POST /api/admin/labs/[id]/subscription — manually assign a plan
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyAdmin();
    if (!user) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const body = await req.json();
    const parsed = AssignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: parsed.data.plan_id } });
    if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    const lab = await prisma.lab.findUnique({ where: { id: params.id } });
    if (!lab) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

    const startDate = new Date(parsed.data.start_date);
    const endDate = computeEndDate(startDate, plan.period_type, plan.period_days);

    // Expire any currently active subscription for this lab
    await prisma.labSubscription.updateMany({
      where: { lab_id: params.id, status: { in: ["active", "exceeded"] } },
      data: { status: "cancelled", updated_at: new Date() },
    });

    const subscription = await prisma.labSubscription.create({
      data: {
        lab_id: params.id,
        plan_id: plan.id,
        start_date: startDate,
        end_date: endDate,
        leads_used: 0,
        status: "active",
        notes: parsed.data.notes ?? null,
        assigned_by: user.email ?? null,
      },
      include: { plan: true },
    });

    return NextResponse.json({ success: true, subscription }, { status: 201 });
  } catch (err) {
    console.error("[lab/subscription] POST error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

function computeEndDate(start: Date, periodType: string, periodDays: number | null): Date {
  const end = new Date(start);
  switch (periodType) {
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
    case "quarterly":
      end.setMonth(end.getMonth() + 3);
      break;
    case "yearly":
      end.setFullYear(end.getFullYear() + 1);
      break;
    case "custom":
      end.setDate(end.getDate() + (periodDays ?? 90));
      break;
    default:
      end.setMonth(end.getMonth() + 3);
  }
  return end;
}
