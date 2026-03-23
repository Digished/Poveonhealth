export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/labs/[id]/wallet — wallet balance + last 100 transactions */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const [wallet, transactions] = await Promise.all([
    prisma.labWallet.findUnique({ where: { lab_id: id } }),
    prisma.walletTransaction.findMany({
      where: { lab_id: id },
      orderBy: { created_at: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    success: true,
    balance: wallet ? Number(wallet.balance) : 0,
    transactions: transactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
      balance_after: Number(t.balance_after),
    })),
  });
}

/** POST /api/admin/labs/[id]/wallet — credit or debit the lab wallet */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const direction: "credit" | "debit" = body.direction === "debit" ? "debit" : "credit";
  const rawAmount = parseFloat(body.amount);
  if (!rawAmount || rawAmount <= 0 || isNaN(rawAmount)) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  const description: string = (body.description ?? "").trim() || (direction === "credit" ? "Admin top-up" : "Admin adjustment");

  // Upsert wallet and update balance atomically
  const result = await prisma.$transaction(async (tx) => {
    // Get or create wallet
    const current = await tx.labWallet.upsert({
      where: { lab_id: id },
      create: { lab_id: id, balance: new Decimal(0) },
      update: {},
    });

    const currentBalance = new Decimal(current.balance);
    const delta = new Decimal(rawAmount);
    const newBalance = direction === "credit"
      ? currentBalance.plus(delta)
      : currentBalance.minus(delta);

    await tx.labWallet.update({
      where: { lab_id: id },
      data: { balance: newBalance },
    });

    const txn = await tx.walletTransaction.create({
      data: {
        lab_id: id,
        type: "topup",
        direction,
        amount: delta,
        balance_after: newBalance,
        description,
        actor_email: admin.email ?? "admin",
      },
    });

    return { balance: Number(newBalance), transaction: { ...txn, amount: Number(txn.amount), balance_after: Number(txn.balance_after) } };
  });

  return NextResponse.json({ success: true, ...result });
}
