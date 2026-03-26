export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resolveTests } from "@/lib/resolve-tests";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

function resolutionSource(confidence: number): string {
  if (confidence >= 1.0) return "synonym";
  if (confidence >= 0.75) return "prefix";
  if (confidence >= 0.5) return "regex";
  if (confidence > 0) return "ai";
  return "unresolved";
}

/**
 * POST /api/admin/labs/[id]/catalog/resolve
 * Re-runs the AI resolution pipeline on a single row.
 * Body: { testId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { testId } = await req.json();
  if (!testId) return NextResponse.json({ error: "testId required" }, { status: 400 });

  const existing = await prisma.labOfferedTest.findFirst({ where: { id: testId, lab_id: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [resolved] = await resolveTests(existing.raw_name, id);

  const updates: Record<string, unknown> = {
    catalog_test_id: resolved?.canonical_id ?? null,
    resolution_confidence: resolved?.confidence ?? null,
    resolution_source: resolved?.canonical_id ? resolutionSource(resolved.confidence) : "unresolved",
  };

  const test = await prisma.labOfferedTest.update({ where: { id: testId }, data: updates });

  return NextResponse.json({
    success: true,
    test: {
      ...test,
      lab_price: Number(test.lab_price),
      poveon_fee: test.poveon_fee ? Number(test.poveon_fee) : null,
      commission_pct: test.commission_pct ? Number(test.commission_pct) : null,
      resolution_confidence: test.resolution_confidence ? Number(test.resolution_confidence) : null,
    },
    resolved_to: resolved?.canonical_name ?? null,
  });
}
