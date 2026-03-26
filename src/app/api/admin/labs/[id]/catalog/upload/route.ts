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

/** Parse a simple CSV string into rows of key-value pairs */
function parseCsv(text: string): Array<{ test_name: string; price: number; commission_pct?: number; is_active?: boolean }> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const nameIdx = headers.findIndex((h) => h === "test_name" || h === "name" || h === "test");
  const priceIdx = headers.findIndex((h) => h === "price" || h === "lab_price" || h === "amount");

  if (nameIdx === -1 || priceIdx === -1) return [];

  const commIdx = headers.findIndex((h) => h === "commission_pct" || h === "commission");
  const activeIdx = headers.findIndex((h) => h === "is_active" || h === "active");

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
    const test_name = cols[nameIdx]?.trim();
    const price = parseFloat(cols[priceIdx] ?? "");
    if (!test_name || isNaN(price) || price <= 0) continue;

    rows.push({
      test_name,
      price,
      commission_pct: commIdx !== -1 ? parseFloat(cols[commIdx] ?? "") || undefined : undefined,
      is_active: activeIdx !== -1 ? cols[activeIdx]?.toLowerCase() !== "false" : true,
    });
  }
  return rows;
}

/**
 * POST /api/admin/labs/[id]/catalog/upload
 * Accepts multipart/form-data with a "file" field (CSV).
 * Resolves each row via AI pipeline and upserts into lab_offered_tests.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found. CSV must have columns: test_name, price" },
      { status: 400 }
    );
  }

  const defaultCommission = await getDefaultCommission();

  const results = { total: rows.length, created: 0, updated: 0, resolved: 0, unresolved: 0, errors: 0 };

  for (const row of rows) {
    try {
      const commission_pct = (!row.commission_pct || isNaN(row.commission_pct)) ? defaultCommission : row.commission_pct;
      const poveon_fee = parseFloat(((row.price * commission_pct) / 100).toFixed(2));

      // Resolve via AI pipeline
      const [resolved] = await resolveTests(row.test_name, id);
      let catalog_test_id: string | null = null;
      let resolution_confidence: number | null = null;
      let resolution_source_val: string | null = null;

      if (resolved?.canonical_id) {
        catalog_test_id = resolved.canonical_id;
        resolution_confidence = resolved.confidence;
        resolution_source_val = resolutionSource(resolved.confidence);
        results.resolved++;
      } else {
        results.unresolved++;
      }

      const existing = await prisma.labOfferedTest.findUnique({
        where: { lab_id_raw_name: { lab_id: id, raw_name: row.test_name } },
      });

      await prisma.labOfferedTest.upsert({
        where: { lab_id_raw_name: { lab_id: id, raw_name: row.test_name } },
        create: {
          lab_id: id,
          raw_name: row.test_name,
          lab_price: row.price,
          poveon_fee,
          commission_pct,
          is_active: row.is_active ?? true,
          catalog_test_id,
          resolution_confidence,
          resolution_source: resolution_source_val,
        },
        update: {
          lab_price: row.price,
          poveon_fee,
          commission_pct,
          is_active: row.is_active ?? true,
          catalog_test_id,
          resolution_confidence,
          resolution_source: resolution_source_val,
        },
      });

      if (existing) results.updated++; else results.created++;
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({ success: true, results });
}
