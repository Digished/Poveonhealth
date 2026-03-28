export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  return await prisma.adminUser.findUnique({ where: { user_id: user.id } }) ? user : null;
}

/** GET /api/admin/wallet/[labId] — wallet status + credit history for a single lab */
export async function GET(
  _req: NextRequest,
  { params }: { params: { labId: string } },
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [wallet, commissionRaw] = await Promise.all([
    prisma.labWallet.findUnique({
      where:   { lab_id: params.labId },
      include: { credits: { orderBy: { created_at: "desc" }, take: 20 } },
    }),
    prisma.$queryRaw<[{ poveon_sum: string }]>`
      SELECT COALESCE(SUM(poveon_amount),0)::text AS poveon_sum
      FROM requests WHERE lab_id = ${params.labId} AND status IN ('seen','done')`,
  ]);

  const commissionAccrued = Number(commissionRaw[0]?.poveon_sum ?? 0);
  const totalDeposited    = wallet?.credits.reduce((s: number, c: { amount: unknown }) => s + Number(c.amount), 0) ?? 0;

  return NextResponse.json({
    balance:             wallet ? Number(wallet.balance) : 0,
    dva_provisioned:     !!wallet?.dva_account_number,
    dva_bank_name:       wallet?.dva_bank_name      ?? null,
    dva_account_number:  wallet?.dva_account_number ?? null,
    dva_account_name:    wallet?.dva_account_name   ?? null,
    commission_accrued:  commissionAccrued,
    total_deposited:     totalDeposited,
    credits: (wallet?.credits ?? []).map((c: { id: string; amount: unknown; reference: string; channel: string; sender_name: string | null; sender_bank: string | null; created_at: Date }) => ({
      id:          c.id,
      amount:      Number(c.amount),
      reference:   c.reference,
      channel:     c.channel,
      sender_name: c.sender_name,
      sender_bank: c.sender_bank,
      created_at:  c.created_at,
    })),
  });
}
