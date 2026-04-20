export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plans = await prisma.subscriptionPlan.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: "asc" }, { fee: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      fee: true,
      leads_target: true,
      period_type: true,
      period_days: true,
    },
  });

  return NextResponse.json({
    success: true,
    plans: plans.map((p) => ({
      ...p,
      fee: Number(p.fee),
      leads_target: Number(p.leads_target),
    })),
  });
}
