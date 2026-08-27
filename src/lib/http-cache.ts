import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Conditional-GET helpers for the dashboard's polling endpoints.
 *
 * The lab dashboards poll several endpoints every 10–30 seconds. Almost every
 * one of those polls returns exactly what the previous one did, so the bytes
 * leaving Postgres (and Supabase's egress meter) are pure waste. Each endpoint
 * now derives a cheap fingerprint — a COUNT plus a MAX(updated_at), a few bytes
 * over the wire — and answers 304 Not Modified when the client already has that
 * version, without ever reading the rows.
 *
 * Clients drive this with `fetchJson()` from `@/lib/poll`.
 */

/** Builds a weak ETag from whatever identifies this payload's version. */
export function makeEtag(parts: Array<string | number | boolean | Date | null | undefined>): string {
  const raw = parts
    .map((p) => (p instanceof Date ? p.getTime() : p === null || p === undefined ? "" : String(p)))
    .join("|");
  // FNV-1a — short, stable, and plenty for change detection.
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `W/"${hash.toString(36)}-${raw.length.toString(36)}"`;
}

/** 304 when the caller already holds this version, otherwise null. */
export function notModified(request: NextRequest, etag: string): NextResponse | null {
  const seen = request.headers.get("if-none-match");
  if (!seen) return null;
  // A client may send a list; any match means it already has current data.
  const matches = seen.split(",").some((tag) => tag.trim() === etag);
  if (!matches) return null;
  return new NextResponse(null, {
    status: 304,
    headers: { ETag: etag, "Cache-Control": "private, no-cache" },
  });
}

/** JSON response tagged so the next poll can be answered with a 304. */
export function jsonWithEtag(body: unknown, etag: string): NextResponse {
  return NextResponse.json(body, {
    headers: { ETag: etag, "Cache-Control": "private, no-cache" },
  });
}
