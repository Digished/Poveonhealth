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

/** GET /api/admin/skin — list dermatology consults */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const q = searchParams.get("q")?.trim();

  const consults = await prisma.skinConsult.findMany({
    where: {
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

  const counts = await prisma.skinConsult.groupBy({ by: ["status"], _count: { _all: true } });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return NextResponse.json({ success: true, consults, counts: countMap });
}
