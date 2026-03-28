export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  return await prisma.adminUser.findUnique({ where: { user_id: user.id } }) ? user : null;
}

/** GET /api/admin/wallet — all lab wallets with balance and DVA status */
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wallets = await prisma.labWallet.findMany({
    include: { lab: { select: { id: true, name: true, email: true } } },
    orderBy: { updated_at: "desc" },
  });

  return NextResponse.json({
    wallets: wallets.map((w) => ({
      lab_id:         w.lab_id,
      lab_name:       w.lab.name,
      lab_email:      w.lab.email,
      balance:        Number(w.balance),
      dva_provisioned: !!w.dva_account_number,
      dva_bank_name:  w.dva_bank_name,
      dva_account_number: w.dva_account_number,
      dva_account_name:   w.dva_account_name,
    })),
  });
}
