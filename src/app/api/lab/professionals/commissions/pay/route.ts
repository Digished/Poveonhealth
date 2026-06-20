export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

const Schema = z.object({
  // Either settle specific ledger rows, or all accrued for a professional.
  commission_ids: z.array(z.string().uuid()).optional(),
  professional_id: z.string().uuid().optional(),
  note: z.string().max(300).optional(),
});

/**
 * POST /api/lab/professionals/commissions/pay
 * Marks accrued commissions as paid (manual settlement — no money movement).
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { commission_ids, professional_id, note } = parsed.data;
  if (!commission_ids?.length && !professional_id) {
    return NextResponse.json({ error: "Provide commission_ids or professional_id" }, { status: 400 });
  }

  const result = await prisma.professionalCommission.updateMany({
    where: {
      lab_id: auth.lab_id,
      status: "accrued",
      ...(commission_ids?.length ? { id: { in: commission_ids } } : {}),
      ...(professional_id ? { professional_id } : {}),
    },
    data: { status: "paid", paid_at: new Date(), ...(note ? { note } : {}) },
  });

  if (auth.actor_email && result.count > 0) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "commission_paid", detail: `${result.count} commission(s) marked paid` });
  }

  return NextResponse.json({ success: true, paid: result.count });
}
