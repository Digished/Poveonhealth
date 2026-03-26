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
 * GET /api/admin/labs/[id]/catalog/export
 * Returns the lab's offered tests as a downloadable CSV.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const [lab, tests] = await Promise.all([
    prisma.lab.findUnique({ where: { id }, select: { name: true } }),
    prisma.labOfferedTest.findMany({
      where: { lab_id: id },
      include: {
        catalog_test: { select: { canonical_name: true, category: { select: { name: true } } } },
      },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const headers = ["test_name", "canonical_name", "category", "lab_price", "commission_pct", "poveon_fee", "resolution_source", "is_active"];
  const rows = tests.map((t) => [
    `"${t.raw_name.replace(/"/g, '""')}"`,
    `"${(t.catalog_test?.canonical_name ?? "").replace(/"/g, '""')}"`,
    `"${(t.catalog_test?.category?.name ?? "").replace(/"/g, '""')}"`,
    Number(t.lab_price).toFixed(2),
    t.commission_pct ? Number(t.commission_pct).toFixed(2) : "",
    t.poveon_fee ? Number(t.poveon_fee).toFixed(2) : "",
    t.resolution_source ?? "",
    t.is_active ? "true" : "false",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const filename = `${(lab?.name ?? "lab").toLowerCase().replace(/\s+/g, "-")}-catalog.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
