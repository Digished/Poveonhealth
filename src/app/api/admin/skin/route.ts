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

/** GET /api/admin/skin — list dermatology consults (excludes unpaid/abandoned) + revenue stats */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const q = searchParams.get("q")?.trim();

  // Never surface consults still awaiting payment — those are abandoned checkouts
  const visible = { status: { not: "awaiting_payment" } };

  const consults = await prisma.skinConsult.findMany({
    where: {
      ...visible,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { patient_name: { contains: q, mode: "insensitive" } },
              { patient_email: { contains: q, mode: "insensitive" } },
              { patient_whatsapp: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: 300,
  });

  const counts = await prisma.skinConsult.groupBy({
    by: ["status"],
    where: visible,
    _count: { _all: true },
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  // Revenue stats (paid consults only)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [allTime, thisMonth, totalVisible] = await Promise.all([
    prisma.skinConsult.aggregate({ where: { is_paid: true }, _sum: { amount_paid: true }, _count: { _all: true } }),
    prisma.skinConsult.aggregate({
      where: { is_paid: true, paid_at: { gte: startOfMonth } },
      _sum: { amount_paid: true },
      _count: { _all: true },
    }),
    prisma.skinConsult.count({ where: visible }),
  ]);

  const stats = {
    total: totalVisible,
    paid_count: allTime._count._all,
    revenue_total: Number(allTime._sum.amount_paid ?? 0),
    revenue_month: Number(thisMonth._sum.amount_paid ?? 0),
    paid_count_month: thisMonth._count._all,
  };

  return NextResponse.json({ success: true, consults, counts: countMap, stats });
}
