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

/** GET /api/admin/wallet/[labId] — wallet status for a single lab */
export async function GET(
  _req: NextRequest,
  { params }: { params: { labId: string } },
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wallet = await prisma.labWallet.findUnique({
    where: { lab_id: params.labId },
  });

  return NextResponse.json({
    balance:            wallet ? Number(wallet.balance) : 0,
    dva_provisioned:    !!wallet?.dva_account_number,
    dva_bank_name:      wallet?.dva_bank_name      ?? null,
    dva_account_number: wallet?.dva_account_number ?? null,
    dva_account_name:   wallet?.dva_account_name   ?? null,
  });
}
