export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/professionals/commissions
 * The referral-commission ledger. Optional ?professional_id=&status=accrued|paid
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const professionalId = searchParams.get("professional_id");
  const status = searchParams.get("status");

  const ledger = await prisma.professionalCommission.findMany({
    where: {
      lab_id: auth.lab_id,
      ...(professionalId ? { professional_id: professionalId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 500,
    include: { professional: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    ledger: ledger.map((l) => ({
      id: l.id,
      professional_id: l.professional_id,
      professional_name: l.professional.name,
      request_id: l.request_id,
      basis_amount: l.basis_amount != null ? Number(l.basis_amount) : null,
      amount: Number(l.amount),
      status: l.status,
      paid_at: l.paid_at,
      note: l.note,
      created_at: l.created_at,
    })),
  });
}
