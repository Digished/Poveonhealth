export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

type ParsedRow = { test_name: string; price: number; category?: string; commission_pct?: number };

function normaliseHeaders(headers: string[]): string[] {
  return headers.map((h) => String(h).toLowerCase().trim().replace(/"/g, ""));
}

function rowsFromSheetData(rawRows: string[][]): ParsedRow[] {
  if (rawRows.length < 2) return [];
  const headers = normaliseHeaders(rawRows[0]);
  const nameIdx  = headers.findIndex((h) => ["test_name", "name", "test"].includes(h));
  const priceIdx = headers.findIndex((h) => ["price", "lab_price", "amount"].includes(h));
  if (nameIdx === -1 || priceIdx === -1) return [];
  const catIdx  = headers.findIndex((h) => ["category", "category_label", "type"].includes(h));
  const commIdx = headers.findIndex((h) => ["commission_pct", "commission"].includes(h));
  const rows: ParsedRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const cols = rawRows[i].map((c) => String(c ?? "").trim().replace(/"/g, ""));
    const test_name = cols[nameIdx]?.trim();
    const price = parseFloat(cols[priceIdx] ?? "");
    if (!test_name || isNaN(price) || price <= 0) continue;
    rows.push({
      test_name,
      price,
      category: catIdx !== -1 ? cols[catIdx]?.trim() || undefined : undefined,
      commission_pct: commIdx !== -1 ? parseFloat(cols[commIdx] ?? "") || undefined : undefined,
    });
  }
  return rows;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return rowsFromSheetData(lines.map((l) => l.split(",").map((c) => c.trim())));
}

function parseExcel(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = xlsx.read(buffer, { type: "array" });
  const allRows: ParsedRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const raw = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    allRows.push(...rowsFromSheetData(raw as string[][]));
  }
  return allRows;
}

export type DiffNew = { test_name: string; price: number; category?: string; commission_pct?: number };
export type DiffUpdated = {
  test_id: string;
  test_name: string;
  old: { price: number; commission_pct: number | null; category: string | null };
  new_values: { price: number; commission_pct?: number; category?: string };
  changed_fields: string[];
};
export type DiffUnchanged = { test_name: string };

/**
 * POST /api/admin/labs/[id]/catalog/preview
 * Parse the uploaded file and return a diff against existing tests without applying changes.
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

  const filename = file.name.toLowerCase();
  let rows: ParsedRow[];

  if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    rows = parseExcel(buffer);
  } else {
    const text = await file.text();
    rows = parseCsv(text);
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found. Ensure columns: test_name, price. Optional: category, commission_pct" },
      { status: 400 }
    );
  }

  // Load existing tests
  const existing = await prisma.labOfferedTest.findMany({
    where: { lab_id: id },
    select: { id: true, raw_name: true, lab_price: true, commission_pct: true, category_label: true },
  });
  const existingMap = new Map(existing.map((t) => [t.raw_name.toLowerCase().trim(), t]));

  const added: DiffNew[] = [];
  const updated: DiffUpdated[] = [];
  const unchanged: DiffUnchanged[] = [];

  for (const row of rows) {
    const key = row.test_name.toLowerCase().trim();
    const match = existingMap.get(key);

    if (!match) {
      added.push({ test_name: row.test_name, price: row.price, category: row.category, commission_pct: row.commission_pct });
      continue;
    }

    const changedFields: string[] = [];
    const oldPrice = Number(match.lab_price);
    const oldComm = match.commission_pct ? Number(match.commission_pct) : null;
    const oldCat = match.category_label ?? null;

    if (Math.abs(oldPrice - row.price) > 0.01) changedFields.push("price");
    if (row.commission_pct !== undefined && Math.abs((oldComm ?? 0) - row.commission_pct) > 0.01) changedFields.push("commission_pct");
    if (row.category !== undefined && row.category !== oldCat) changedFields.push("category");

    if (changedFields.length > 0) {
      updated.push({
        test_id: match.id,
        test_name: row.test_name,
        old: { price: oldPrice, commission_pct: oldComm, category: oldCat },
        new_values: { price: row.price, commission_pct: row.commission_pct, category: row.category },
        changed_fields: changedFields,
      });
    } else {
      unchanged.push({ test_name: row.test_name });
    }
  }

  return NextResponse.json({ success: true, diff: { added, updated, unchanged } });
}
