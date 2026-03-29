export const dynamic = "force-dynamic";
/**
 * GET /api/lab/sheets/status
 *
 * Returns the lab's current Google Sheets connection state.
 *
 * Response:
 *   { connected: false }
 *   { connected: true, sheet_id, sheet_url, last_synced_at, sync_status }
 *
 * Access: lab owner OR member with can_manage_price_list
 */

import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (auth.auth_method === "member" && !auth.permissions.can_manage_price_list) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lab = await prisma.lab.findUnique({
    where: { id: auth.lab_id },
    select: {
      google_sheet_id: true,
      sheet_last_synced_at: true,
      sheet_sync_status: true,
    },
  });

  if (!lab?.google_sheet_id) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    sheet_id: lab.google_sheet_id,
    sheet_url: `https://docs.google.com/spreadsheets/d/${lab.google_sheet_id}`,
    last_synced_at: lab.sheet_last_synced_at?.toISOString() ?? null,
    sync_status: lab.sheet_sync_status ?? "never",
  });
}
