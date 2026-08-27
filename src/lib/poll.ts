/**
 * Client half of the conditional-GET polling scheme (see `@/lib/http-cache`).
 *
 * `fetchJson` remembers the ETag of the last payload it received for a URL and
 * sends it back as `If-None-Match`. When nothing has changed the server answers
 * 304 with an empty body and this returns `null`, so the caller keeps the state
 * it already has and no rows leave the database.
 */

const etags = new Map<string, string>();

export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T | null> {
  const known = etags.get(url);
  const headers = new Headers(init?.headers);
  if (known) headers.set("If-None-Match", known);

  const res = await fetch(url, { ...init, cache: "no-store", headers });
  if (res.status === 304) return null;

  const tag = res.headers.get("etag");
  if (tag) etags.set(url, tag);
  else etags.delete(url);

  return (await res.json()) as T;
}

/** Forget a URL's cached version — use after a write, to force a full refetch. */
export function invalidate(url: string) {
  etags.delete(url);
}
