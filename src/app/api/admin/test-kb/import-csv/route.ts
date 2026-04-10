export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

interface TestRow {
  canonical_name: string;
  synonyms: string[];
  variants: string[];
  category: string | null;
  description: string | null;
}

function parseCSV(text: string): TestRow[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return []; // Need header + at least 1 data row

  // Parse header
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/"/g, ""));

  const canonicalIdx = headers.indexOf("canonical_name");
  const synonymsIdx = headers.indexOf("synonyms");
  const variantsIdx = headers.indexOf("variants");
  const categoryIdx = headers.indexOf("category");
  const descIdx = headers.indexOf("description");

  if (canonicalIdx === -1) {
    throw new Error("CSV must have 'canonical_name' column");
  }

  const rows: TestRow[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
      .split(",")
      .map((c) => c.trim().replace(/"/g, ""));

    const canonical = cols[canonicalIdx]?.trim();
    if (!canonical) continue; // Skip empty rows

    const synonymsStr = cols[synonymsIdx]?.trim() || "";
    const variantsStr = cols[variantsIdx]?.trim() || "";

    rows.push({
      canonical_name: canonical,
      synonyms: synonymsStr
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
      variants: variantsStr
        .split(";")
        .map((v) => v.trim())
        .filter(Boolean),
      category: cols[categoryIdx]?.trim() || null,
      description: cols[descIdx]?.trim() || null,
    });
  }

  return rows;
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in CSV" },
        { status: 400 }
      );
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Check if test already exists
        const existing = await prisma.testKnowledgeBase.findUnique({
          where: { canonical_name: row.canonical_name },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.testKnowledgeBase.create({
          data: {
            canonical_name: row.canonical_name,
            synonyms: row.synonyms,
            variants: row.variants,
            category: row.category,
            description: row.description,
          },
        });

        created++;
      } catch (err) {
        errors.push(`${row.canonical_name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`[admin-kb-import] Created ${created}, skipped ${skipped}, errors ${errors.length}`);

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: rows.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : [],
      message: `Imported ${created} tests, skipped ${skipped} existing`,
    });
  } catch (error) {
    console.error("[admin-kb-import] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to import CSV",
      },
      { status: 500 }
    );
  }
}
