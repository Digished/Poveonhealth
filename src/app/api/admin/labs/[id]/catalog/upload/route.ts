export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";
import OpenAI from "openai";
import { createOperation, updateOperation, deleteOperation } from "@/lib/operation-progress";
import { randomUUID } from "crypto";

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
 * Parses file immediately and returns operationId.
 * Processes upload in background with progress tracking.
 * Handles up to 50+ sheets without timeout.
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

  // Parse file immediately (fast)
  try {
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
  } catch (error) {
    return NextResponse.json({ error: `Parse error: ${String(error)}` }, { status: 400 });
  }

  // Create operation tracker and return immediately
  const operationId = randomUUID();
  const progressKey = `${id}-upload-${operationId}`;
  createOperation(progressKey, rows.length);

  // Process in background (don't block response)
  (async () => {
    try {
      const defaultCommission = await getDefaultCommission();
      let completed = 0;

      for (const row of rows) {
        try {
          const commission_pct = (!row.commission_pct || isNaN(row.commission_pct)) ? defaultCommission : row.commission_pct;
          const poveon_fee = parseFloat(((row.price * commission_pct) / 100).toFixed(2));

          const existing = await prisma.labOfferedTest.findUnique({
            where: { lab_id_raw_name: { lab_id: id, raw_name: row.test_name } },
            select: { id: true, synonyms: true },
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
          } else {
            // Existing test: update price/commission, preserve synonyms
            await prisma.labOfferedTest.update({
              where: { id: existing.id },
              data: {
                lab_price: row.price,
                poveon_fee,
                commission_pct,
                is_active: row.is_active ?? true,
                ...(row.category ? { category_label: row.category } : {}),
              },
            });
          }
        } catch (err) {
          console.error(`Error processing row "${row.test_name}":`, err);
          // Continue processing other rows on error
        }

        completed++;
        updateOperation(progressKey, completed);
      }

      // Clean up after 60 seconds
      setTimeout(() => deleteOperation(progressKey), 60000);
    } catch (error) {
      console.error("Error in background upload:", error);
      setTimeout(() => deleteOperation(progressKey), 60000);
    }
  })();

  return NextResponse.json({
    success: true,
    operationId,
    totalRows: rows.length,
    message: "Upload processing in background. Use operationId to check progress.",
  });
}
