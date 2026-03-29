export const dynamic = "force-dynamic";
/**
 * DELETE /api/lab/sheets/disconnect
 *
 * Revokes Google OAuth access and clears all Sheets fields from the lab record.
 * The Google Spreadsheet is NOT deleted — the lab keeps their copy.
 *
 * Access: lab owner OR member with can_manage_price_list
 */

import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { buildOAuthClient } from "@/lib/sheets/google-sheets";
import { decrypt } from "@/lib/sheets/encrypt";

export async function DELETE(request: NextRequest) {
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
    select: { google_refresh_token: true },
  });

  if (lab?.google_refresh_token) {
    // Best-effort token revocation — don't fail if Google rejects it
    try {
      const oauthClient = buildOAuthClient();
      oauthClient.setCredentials({ refresh_token: decrypt(lab.google_refresh_token) });
      await oauthClient.revokeCredentials();
    } catch (e) {
      console.warn("[sheets/disconnect] Token revocation failed (non-fatal):", e);
    }
  }

  await prisma.lab.update({
    where: { id: auth.lab_id },
    data: {
      google_refresh_token: null,
      google_token_expiry:  null,
      google_sheet_id:      null,
      sheet_last_synced_at: null,
      sheet_sync_status:    null,
    },
  });

  return NextResponse.json({ success: true });
}
