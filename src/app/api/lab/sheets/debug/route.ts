export const dynamic = "force-dynamic";
/**
 * GET /api/lab/sheets/debug
 *
 * Returns the redirect URI the app would use for Google OAuth.
 * Helps diagnose redirect_uri_mismatch errors.
 * Safe to expose — only shows a URL, no credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedirectUri } from "@/lib/sheets/google-sheets";

export async function GET(request: NextRequest) {
  const redirectUri = getRedirectUri(request);

  return NextResponse.json({
    redirect_uri: redirectUri,
    add_this_to_google_cloud_console: redirectUri,
    request_url: request.url,
    headers: {
      host: request.headers.get("host"),
      "x-forwarded-host": request.headers.get("x-forwarded-host"),
      "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
    },
  });
}
