/**
 * Tiny client-side JSON cache with in-flight de-duplication.
 *
 * Several dashboard panels ask for the same endpoint at the same moment (the
 * doctor portal shell and the Earn panel both need `/api/doc-login/pricing`),
 * and switching away from a tab and back used to re-issue every request. This
 * collapses concurrent callers onto one network round-trip and serves a short
 * cached copy afterwards.
 *
 * Deliberately small: no persistence, no revalidation, cleared on reload.
 */

type Entry = { at: number; data: unknown };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

/** Default freshness window — long enough to cover a tab switch, short enough
 *  that a returning user still sees current numbers. */
const DEFAULT_TTL_MS = 30_000;

export async function getJson<T = unknown>(
  url: string,
  opts: { ttlMs?: number; force?: boolean } = {}
): Promise<T> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;

  if (opts.force) {
    cache.delete(url);
  } else {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttl) return hit.data as T;
    const pending = inFlight.get(url);
    if (pending) return pending as Promise<T>;
  }

  const p = fetch(url, { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      cache.set(url, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, p);
  return p as Promise<T>;
}

/** Drop cached responses whose URL starts with `prefix` (call after a mutation). */
export function invalidateJson(prefix: string) {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
