export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/admin/agreements — list all signed agreements (admin only)
export async function GET(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  if (!adminRecord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const agreements = await prisma.labAgreement.findMany({
    include: {
      lab: { select: { id: true, name: true, email: true, logo_url: true } },
    },
    orderBy: { signed_at: "desc" },
  });

  return NextResponse.json({ success: true, agreements });
}
