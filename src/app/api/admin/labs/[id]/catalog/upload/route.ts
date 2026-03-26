export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import * as xlsx from "xlsx";

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

type ParsedRow = { test_name: string; price: number; category?: string; commission_pct?: number; is_active?: boolean };

function normaliseHeaders(headers: string[]): string[] {
  return headers.map((h) => String(h).toLowerCase().trim().replace(/"/g, ""));
}

function rowsFromSheetData(rawRows: string[][]): ParsedRow[] {
  if (rawRows.length < 2) return [];
  const headers = normaliseHeaders(rawRows[0]);

  const nameIdx    = headers.findIndex((h) => ["test_name", "name", "test"].includes(h));
  const priceIdx   = headers.findIndex((h) => ["price", "lab_price", "amount"].includes(h));
  if (nameIdx === -1 || priceIdx === -1) return [];

  const catIdx    = headers.findIndex((h) => ["category", "category_label", "type"].includes(h));
  const commIdx   = headers.findIndex((h) => ["commission_pct", "commission"].includes(h));
  const activeIdx = headers.findIndex((h) => ["is_active", "active"].includes(h));

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
      is_active: activeIdx !== -1 ? cols[activeIdx]?.toLowerCase() !== "false" : true,
    });
  }
  return rows;
}

/** Parse CSV text into rows */
function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return rowsFromSheetData(lines.map((l) => l.split(",").map((c) => c.trim())));
}

/** Parse Excel buffer — reads all sheets and merges rows */
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

/**
 * Generate synonyms for a batch of test names in one AI call.
 * Returns a map: { [testName]: string[] }
 */
async function generateSynonymsBatch(
  openai: OpenAI,
  tests: { name: string; category?: string }[]
): Promise<Record<string, string[]>> {
  if (tests.length === 0) return {};
  const list = tests.map((t, i) => `${i + 1}. "${t.name}"${t.category ? ` (${t.category})` : ""}`).join("\n");
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Nigerian medical lab expert. For each test name, generate common synonyms, abbreviations, and alternate names used in Nigerian and international practice. Return JSON: { "synonyms": { "<original name>": ["synonym1", ...] } }. Include the original name. Return 4–8 synonyms per test.`,
        },
        { role: "user", content: `Generate synonyms for these lab tests:\n${list}` },
      ],
    });
    const raw = response.choices[0].message.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as { synonyms?: Record<string, string[]> };
    return parsed.synonyms ?? {};
  } catch {
    return {};
  }
}

/**
 * POST /api/admin/labs/[id]/catalog/upload
 * Accepts multipart/form-data with a "file" field.
 * Supports .csv, .xlsx, .xls (all sheets are merged).
 * Columns: test_name (required), price (required),
 *          category (optional), commission_pct (optional), is_active (optional)
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
      { error: "No valid rows found. Ensure columns: test_name, price. Optional: category, commission_pct, is_active" },
      { status: 400 }
    );
  }

  const defaultCommission = await getDefaultCommission();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Generate synonyms in batches of 20 to stay within token limits
  const BATCH = 20;
  const synonymMap: Record<string, string[]> = {};
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({ name: r.test_name, category: r.category }));
    const result = await generateSynonymsBatch(openai, batch);
    Object.assign(synonymMap, result);
  }

  const results = { total: rows.length, created: 0, updated: 0, errors: 0 };

  for (const row of rows) {
    try {
      const commission_pct = (!row.commission_pct || isNaN(row.commission_pct)) ? defaultCommission : row.commission_pct;
      const poveon_fee = parseFloat(((row.price * commission_pct) / 100).toFixed(2));
      const aiSynonyms: string[] = synonymMap[row.test_name] ?? [row.test_name];
      const synonyms = Array.from(new Set([row.test_name, ...aiSynonyms]));

      const existing = await prisma.labOfferedTest.findUnique({
        where: { lab_id_raw_name: { lab_id: id, raw_name: row.test_name } },
      });

      await prisma.labOfferedTest.upsert({
        where: { lab_id_raw_name: { lab_id: id, raw_name: row.test_name } },
        create: {
          lab_id: id,
          raw_name: row.test_name,
          category_label: row.category ?? null,
          synonyms,
          lab_price: row.price,
          poveon_fee,
          commission_pct,
          is_active: row.is_active ?? true,
        },
        update: {
          lab_price: row.price,
          poveon_fee,
          commission_pct,
          is_active: row.is_active ?? true,
          ...(row.category ? { category_label: row.category } : {}),
          synonyms,
        },
      });

      if (existing) results.updated++; else results.created++;
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({ success: true, results });
}
