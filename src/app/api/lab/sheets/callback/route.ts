export const dynamic = "force-dynamic";
/**
 * GET /api/lab/sheets/callback
 *
 * Google OAuth2 redirect target. Exchanges the auth code for tokens,
 * encrypts the refresh token, stores it on the Lab record, and creates
 * the initial Google Spreadsheet populated with the lab's current catalog.
 *
 * Redirects back to /lab-dashboard with a ?sheets= query param indicating
 * success or error.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/sheets/encrypt";
import {
  buildOAuthClient,
  getRedirectUri,
  createSpreadsheet,
  SheetCategory,
} from "@/lib/sheets/google-sheets";

export async function GET(request: NextRequest) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/lab-dashboard`;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied Google consent
  if (error || !code || !state) {
    const response = NextResponse.redirect(`${dashboardUrl}?sheets=denied&tab=price-list`);
    response.cookies.delete("sheets_oauth_nonce");
    return response;
  }

  // Verify CSRF nonce
  const nonceCookie = request.cookies.get("sheets_oauth_nonce")?.value;
  const [labId, stateNonce] = state.split(":");

  if (!nonceCookie || !stateNonce || nonceCookie !== stateNonce || !labId) {
    const response = NextResponse.redirect(`${dashboardUrl}?sheets=error&tab=price-list`);
    response.cookies.delete("sheets_oauth_nonce");
    return response;
  }

  try {
    // Exchange code for tokens — redirect URI must match exactly what was sent in /auth
    const redirectUri = getRedirectUri(request.url);
    const oauthClient = buildOAuthClient(redirectUri);
    const { tokens } = await oauthClient.getToken(code);

    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on first consent or when prompt=consent.
      // If missing here it means the user had already connected before — disconnect first.
      const response = NextResponse.redirect(`${dashboardUrl}?sheets=no_refresh_token&tab=price-list`);
      response.cookies.delete("sheets_oauth_nonce");
      return response;
    }

    const encryptedToken = encrypt(tokens.refresh_token);
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // Load lab's current catalog grouped by category
    const tests = await prisma.labOfferedTest.findMany({
      where: { lab_id: labId },
      select: { raw_name: true, category_label: true, lab_price: true, is_active: true },
      orderBy: { raw_name: "asc" },
    });

    const lab = await prisma.lab.findUnique({
      where: { id: labId },
      select: { name: true },
    });

    if (!lab) {
      const response = NextResponse.redirect(`${dashboardUrl}?sheets=error&tab=price-list`);
      response.cookies.delete("sheets_oauth_nonce");
      return response;
    }

    // Group tests by category
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
    const categories = Array.from(categoryMap.values());

    // Create the Google Spreadsheet
    const spreadsheetId = await createSpreadsheet(encryptedToken, redirectUri, lab.name, categories);

    // Persist connection on the lab record
    await prisma.lab.update({
      where: { id: labId },
      data: {
        google_refresh_token: encryptedToken,
        google_token_expiry: tokenExpiry,
        google_sheet_id: spreadsheetId,
        sheet_last_synced_at: new Date(),
        sheet_sync_status: "synced",
      },
    });

    const response = NextResponse.redirect(`${dashboardUrl}?sheets=connected&tab=price-list`);
    response.cookies.delete("sheets_oauth_nonce");
    return response;
  } catch (err) {
    console.error("[sheets/callback] Error:", err);
    const response = NextResponse.redirect(`${dashboardUrl}?sheets=error&tab=price-list`);
    response.cookies.delete("sheets_oauth_nonce");
    return response;
  }
}
