export const dynamic = "force-dynamic";
/**
 * POST /api/lab/sheets/pull
 *
 * Reads the Google Sheet and returns a diff against the current Poveon catalog.
 * Does NOT apply any changes — the lab reviews the diff and calls /confirm to apply.
 *
 * Response:
 *   {
 *     added:     [{ raw_name, lab_price, category }],
 *     changed:   [{ id, raw_name, old_price?, new_price?, old_active?, new_active? }],
 *     removed:   [{ id, raw_name }],  ← tests in DB not found in sheet (will be deactivated)
 *     unchanged: number,
 *   }
 *
 * Access: lab owner OR member with can_manage_price_list
 */

import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { readFromSheet } from "@/lib/sheets/google-sheets";

export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (auth.auth_method === "member" && !auth.permissions.can_manage_price_list) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (auth.auth_method === "api_key") {
    return NextResponse.json({ error: "Sheets operations require a browser session" }, { status: 403 });
  }

  const lab = await prisma.lab.findUnique({
    where: { id: auth.lab_id },
    select: {
      google_sheet_id: true,
      google_refresh_token: true,
    },
  });

  if (!lab?.google_sheet_id || !lab.google_refresh_token) {
    return NextResponse.json({ error: "Google Sheets not connected" }, { status: 400 });
  }

  // Read sheet rows
  let sheetRows;
  try {
    sheetRows = await readFromSheet(lab.google_refresh_token, lab.google_sheet_id);
  } catch (err) {
    console.error("[sheets/pull] Error reading sheet:", err);
    return NextResponse.json({ error: "Failed to read Google Sheet" }, { status: 500 });
  }

  // Load current DB catalog
  const dbTests = await prisma.labOfferedTest.findMany({
    where: { lab_id: auth.lab_id },
    select: { id: true, raw_name: true, lab_price: true, is_active: true, category_label: true },
  });

  // Build lookup maps (case-insensitive by name)
  const dbByName = new Map(dbTests.map((t) => [t.raw_name.toLowerCase(), t]));
  const sheetByName = new Map(sheetRows.map((r) => [r.raw_name.toLowerCase(), r]));

  type AddedItem    = { raw_name: string; lab_price: number; category: string };
  type ChangedItem  = { id: string; raw_name: string; old_price?: number; new_price?: number; old_active?: boolean; new_active?: boolean };
  type RemovedItem  = { id: string; raw_name: string };

  const added:     AddedItem[]   = [];
  const changed:   ChangedItem[] = [];
  const removed:   RemovedItem[] = [];
  let   unchanged = 0;

  // Tests in sheet → compare against DB
  for (const [key, row] of sheetByName) {
    const db = dbByName.get(key);

    if (!db) {
      // New test added in sheet
      added.push({ raw_name: row.raw_name, lab_price: row.lab_price, category: row.category });
    } else {
      const priceChanged  = Math.abs(Number(db.lab_price) - row.lab_price) >= 0.01;
      const activeChanged = db.is_active !== row.is_active;

      if (priceChanged || activeChanged) {
        const item: ChangedItem = { id: db.id, raw_name: db.raw_name };
        if (priceChanged)  { item.old_price  = Number(db.lab_price); item.new_price  = row.lab_price; }
        if (activeChanged) { item.old_active = db.is_active;         item.new_active = row.is_active; }
        changed.push(item);
      } else {
        unchanged++;
      }
    }
  }

  // Tests in DB (active) but missing from sheet → will be deactivated
  for (const [key, db] of dbByName) {
    if (db.is_active && !sheetByName.has(key)) {
      removed.push({ id: db.id, raw_name: db.raw_name });
    }
  }

  return NextResponse.json({ added, changed, removed, unchanged });
}
