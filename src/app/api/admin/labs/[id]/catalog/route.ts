export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

async function getDefaultCommission(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "default_commission_pct" } });
  return setting ? parseFloat(setting.value) : 15;
}

function resolutionSource(confidence: number): string {
  if (confidence >= 1.0) return "synonym";
  if (confidence >= 0.75) return "prefix";
  if (confidence >= 0.5) return "regex";
  if (confidence > 0) return "ai";
  return "unresolved";
}

/** GET /api/admin/labs/[id]/catalog — list all offered tests for a lab */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const tests = await prisma.labOfferedTest.findMany({
    where: { lab_id: id },
    include: {
      catalog_test: {
        select: { canonical_name: true, category: { select: { name: true } } },
      },
    },
    orderBy: { created_at: "asc" },
  });

  const total = tests.length;
  const mapped = tests.filter((t) => t.catalog_test_id && Number(t.resolution_confidence ?? 0) >= 0.5).length;
  const unresolved = tests.filter((t) => !t.catalog_test_id || Number(t.resolution_confidence ?? 0) < 0.5).length;

  return NextResponse.json({
    success: true,
    tests: tests.map((t) => ({
      ...t,
      lab_price: Number(t.lab_price),
      poveon_fee: t.poveon_fee ? Number(t.poveon_fee) : null,
      commission_pct: t.commission_pct ? Number(t.commission_pct) : null,
      resolution_confidence: t.resolution_confidence ? Number(t.resolution_confidence) : null,
      canonical_name: t.catalog_test?.canonical_name ?? null,
      category: t.catalog_test?.category?.name ?? null,
    })),
    summary: { total, mapped, unresolved },
  });
}

const CreateSchema = z.object({
  raw_name: z.string().min(1).max(300),
  lab_price: z.number().positive(),
  commission_pct: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  auto_resolve: z.boolean().default(true),
});

/** POST /api/admin/labs/[id]/catalog — add a single offered test */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });

  const { raw_name, lab_price, is_active = true, auto_resolve = true } = parsed.data;
  const commission_pct = parsed.data.commission_pct ?? (await getDefaultCommission());
  const poveon_fee = parseFloat(((lab_price * commission_pct) / 100).toFixed(2));

  let catalog_test_id: string | null = null;
  let resolution_confidence: number | null = null;
  let resolution_source: string | null = null;

  if (auto_resolve) {
    const [resolved] = await resolveTests(raw_name, id);
    if (resolved && resolved.canonical_id) {
      catalog_test_id = resolved.canonical_id;
      resolution_confidence = resolved.confidence;
      resolution_source = resolutionSource(resolved.confidence);
    }
  }

  const test = await prisma.labOfferedTest.upsert({
    where: { lab_id_raw_name: { lab_id: id, raw_name } },
    create: {
      lab_id: id,
      raw_name,
      lab_price,
      poveon_fee,
      commission_pct,
      is_active,
      catalog_test_id,
      resolution_confidence,
      resolution_source,
    },
    update: {
      lab_price,
      poveon_fee,
      commission_pct,
      is_active,
      catalog_test_id,
      resolution_confidence,
      resolution_source,
    },
  });

  return NextResponse.json({ success: true, test: { ...test, lab_price: Number(test.lab_price), poveon_fee: Number(test.poveon_fee), commission_pct: Number(test.commission_pct) } });
}
