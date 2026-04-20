export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // Find the most recent active/exceeded subscription, or the latest one
  const subscriptions = await prisma.labSubscription.findMany({
    where: { lab_id: auth.lab_id },
    include: { plan: true },
    orderBy: { created_at: "desc" },
    take: 10,
  });

  // Auto-expire subscriptions whose end_date has passed
  for (const sub of subscriptions) {
    if (sub.status === "active" && sub.end_date < now) {
      await prisma.labSubscription.update({
        where: { id: sub.id },
        data: { status: "expired", updated_at: now },
      });
      sub.status = "expired";
    }
  }

  const active = subscriptions.find((s) => s.status === "active" || s.status === "exceeded") ?? null;

  // Fetch DVA details for payment instructions
  const wallet = await prisma.labWallet.findUnique({ where: { lab_id: auth.lab_id } });

  return NextResponse.json({
    success: true,
    subscription: active
      ? {
          id: active.id,
          plan: {
            id: active.plan.id,
            name: active.plan.name,
            description: active.plan.description,
            fee: Number(active.plan.fee),
            leads_target: Number(active.plan.leads_target),
            period_type: active.plan.period_type,
          },
          start_date: active.start_date,
          end_date: active.end_date,
          leads_used: Number(active.leads_used),
          leads_target: Number(active.plan.leads_target),
          status: active.status,
          days_remaining: Math.max(0, Math.ceil((active.end_date.getTime() - now.getTime()) / 86_400_000)),
        }
      : null,
    dva: wallet?.dva_account_number
      ? {
          bank_name: wallet.dva_bank_name ?? "",
          account_number: wallet.dva_account_number,
          account_name: wallet.dva_account_name ?? "",
        }
      : null,
  });
}
