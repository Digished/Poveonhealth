export const dynamic = "force-dynamic";
/**
 * POST /api/lab/sheets/push
 *
 * Overwrites the Google Sheet with the lab's current Poveon catalog.
 * Adds sheets for new categories, removes sheets for deleted categories.
 *
 * Access: lab owner OR member with can_manage_price_list
 */

import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { pushToSheet, SheetCategory } from "@/lib/sheets/google-sheets";

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

  // Load catalog grouped by category
  const tests = await prisma.labOfferedTest.findMany({
    where: { lab_id: auth.lab_id },
    select: { raw_name: true, category_label: true, lab_price: true, is_active: true },
    orderBy: { raw_name: "asc" },
  });

  const categoryMap = new Map<string, SheetCategory>();
  for (const t of tests) {
    const label = t.category_label ?? "Uncategorized";
    if (!categoryMap.has(label)) categoryMap.set(label, { label, tests: [] });
    categoryMap.get(label)!.tests.push({
      raw_name: t.raw_name,
      lab_price: Number(t.lab_price),
      is_active: t.is_active,
    });
  }

  try {
    await pushToSheet(
      lab.google_refresh_token,
      lab.google_sheet_id,
      Array.from(categoryMap.values())
    );

    await prisma.lab.update({
      where: { id: auth.lab_id },
      data: {
        sheet_last_synced_at: new Date(),
        sheet_sync_status: "synced",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sheets/push] Error:", err);

    await prisma.lab.update({
      where: { id: auth.lab_id },
      data: { sheet_sync_status: "error" },
    });

    return NextResponse.json({ error: "Failed to push to Google Sheet" }, { status: 500 });
  }
}
