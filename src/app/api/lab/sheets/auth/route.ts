export const dynamic = "force-dynamic";
/**
 * GET /api/lab/sheets/auth
 *
 * Redirects the authenticated lab user to the Google OAuth consent screen.
 * Stores a CSRF nonce in a short-lived cookie to verify on callback.
 *
 * Access: lab owner OR member with can_manage_price_list
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getLabAuth } from "@/lib/lab-auth";
import { buildOAuthClient, getRedirectUri, SHEETS_SCOPES } from "@/lib/sheets/google-sheets";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only owner (session) or member with can_manage_price_list
  if (auth.auth_method === "member" && !auth.permissions.can_manage_price_list) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // API keys cannot connect Google Sheets
  if (auth.auth_method === "api_key") {
    return NextResponse.json({ error: "Google Sheets connection requires a browser session" }, { status: 403 });
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${auth.lab_id}:${nonce}`;

  const redirectUri = getRedirectUri(request);
  const oauthClient = buildOAuthClient(redirectUri);
  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // always get a refresh_token
    scope: SHEETS_SCOPES,
    state,
  });

  const response = NextResponse.redirect(authUrl);

  // Store nonce in a short-lived httpOnly cookie — verified in the callback
  response.cookies.set("sheets_oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300, // 5 minutes
    path: "/",
  });

  return response;
}
