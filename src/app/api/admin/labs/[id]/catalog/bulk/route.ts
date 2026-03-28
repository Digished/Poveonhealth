export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("set_commission"), ids: z.array(z.string()).min(1), commission_pct: z.number().min(0).max(100) }),
]);

/**
 * POST /api/admin/labs/[id]/catalog/bulk
 * Body: { action: "delete", ids: string[] }
 *       { action: "set_commission", ids: string[], commission_pct: number }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });

  if (parsed.data.action === "delete") {
    const { count } = await prisma.labOfferedTest.deleteMany({
      where: { id: { in: parsed.data.ids }, lab_id: id },
    });
    return NextResponse.json({ success: true, deleted: count });
  }

  if (parsed.data.action === "set_commission") {
    const { ids, commission_pct } = parsed.data;
    // Update each test's commission_pct and recalculate poveon_fee
    const tests = await prisma.labOfferedTest.findMany({
      where: { id: { in: ids }, lab_id: id },
      select: { id: true, lab_price: true },
    });

    await prisma.$transaction(
      tests.map((t) =>
        prisma.labOfferedTest.update({
          where: { id: t.id },
          data: {
            commission_pct,
            poveon_fee: parseFloat(((Number(t.lab_price) * commission_pct) / 100).toFixed(2)),
          },
        })
      )
    );
    return NextResponse.json({ success: true, updated: tests.length });
  }
}
