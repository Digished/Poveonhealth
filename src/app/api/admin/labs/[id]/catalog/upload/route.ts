export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";
import OpenAI from "openai";

async function getDefaultCommission(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "default_commission_pct" } });
  return setting ? parseFloat(setting.value) : 15;
}

async function generateSynonyms(testName: string, categoryLabel?: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) return [testName];
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'Return JSON: { "synonyms": string[] }' },
        {
          role: "user",
          content: `Generate 7-10 common synonyms, abbreviations, and alternate names for this medical lab test: "${testName}"${categoryLabel ? ` (category: ${categoryLabel})` : ""}. Nigerian medical context. Include the original name. Return as array.`,
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
    return Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
  } catch {
    return [testName];
  }
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

/**
 * POST /api/admin/labs/[id]/catalog/upload
 * Parses the file and upserts rows. Auto-generates AI synonyms for new tests.
 * For existing tests, preserves current synonyms unless regenerating.
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
  const results = { total: rows.length, created: 0, updated: 0, errors: 0 };

  for (const row of rows) {
    try {
      const commission_pct = (!row.commission_pct || isNaN(row.commission_pct)) ? defaultCommission : row.commission_pct;
      const poveon_fee = parseFloat(((row.price * commission_pct) / 100).toFixed(2));

      const existing = await prisma.labOfferedTest.findUnique({
        where: { lab_id_raw_name: { lab_id: id, raw_name: row.test_name } },
      });

      if (!existing) {
        // New test: auto-generate AI synonyms
        const synonyms = await generateSynonyms(row.test_name, row.category);
        await prisma.labOfferedTest.create({
          data: {
            lab_id: id,
            raw_name: row.test_name,
            category_label: row.category ?? null,
            synonyms,
            lab_price: row.price,
            poveon_fee,
            commission_pct,
            is_active: row.is_active ?? true,
          },
        });
        results.created++;
      } else {
        // Existing test: only update price/commission, keep synonyms
        await prisma.labOfferedTest.update({
          where: { lab_id_raw_name: { lab_id: id, raw_name: row.test_name } },
          data: {
            lab_price: row.price,
            poveon_fee,
            commission_pct,
            is_active: row.is_active ?? true,
            ...(row.category ? { category_label: row.category } : {}),
          },
        });
        results.updated++;
      }
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({ success: true, results });
}
