export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.permissions.can_view_wallet) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wallet = await prisma.labWallet.findUnique({
    where:   { lab_id: auth.lab_id },
    include: { credits: { orderBy: { created_at: "desc" }, take: 50 } },
  });

  return NextResponse.json({
    success: true,
    balance: wallet ? Number(wallet.balance) : 0,
    dva: wallet?.dva_account_number ? {
      bank_name:      wallet.dva_bank_name    ?? "",
      account_number: wallet.dva_account_number,
      account_name:   wallet.dva_account_name ?? "",
    } : null,
    credits: (wallet?.credits ?? []).map((c) => ({
      id:            c.id,
      amount:        Number(c.amount),
      balance_after: Number(c.balance_after),
      reference:     c.reference,
      channel:       c.channel,
      sender_name:   c.sender_name,
      sender_bank:   c.sender_bank,
      created_at:    c.created_at,
    })),
  });
}
