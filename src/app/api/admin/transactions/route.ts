export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/transactions
 * All wallet transactions across all labs, with optional filters.
 * Query params: lab_id, from (ISO date), to (ISO date), limit (default 300)
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const labId = searchParams.get("lab_id") ?? undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(500, parseInt(searchParams.get("limit") ?? "300", 10));

  const where: Record<string, unknown> = {};
  if (labId) where.lab_id = labId;
  if (from || to) {
    where.created_at = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to + "T23:59:59Z") } : {}),
    };
  }

  const transactions = await prisma.walletTransaction.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      lab: { select: { id: true, name: true } },
      request: { select: { test_breakdown: true, tests: true, quoted_price: true } },
    },
  });

  return NextResponse.json({
    success: true,
    transactions: transactions.map((t) => ({
      id: t.id,
      lab_id: t.lab_id,
      lab_name: t.lab?.name ?? "—",
      type: t.type,
      direction: t.direction,
      amount: Number(t.amount),
      balance_after: Number(t.balance_after),
      description: t.description,
      actor_email: t.actor_email,
      created_at: t.created_at,
      request_id: t.request_id,
      test_breakdown: t.request?.test_breakdown ?? null,
      tests_raw: t.request?.tests ?? null,
      quoted_price: t.request?.quoted_price ? Number(t.request.quoted_price) : null,
    })),
  });
}
