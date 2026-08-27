/**
 * In-memory catalogue search.
 *
 * The lab's catalogue is fetched once per session (and served from the CDN, so
 * usually once per lab across all clinicians), then every keystroke is matched
 * locally. Typing a test name costs zero network time.
 */

export type CatalogHit = {
  id: string;
  canonical_name: string;
  category: string;
  effective_price: number;
  is_rapid_test: boolean;
};

type IndexedTest = {
  id: string;
  name: string;
  lower: string;
  category: string;
  price: number;
  synonyms: string; // lowercase, pipe-joined
};

type LabIndex = { tests: IndexedTest[]; truncated: boolean };

const indexes = new Map<string, LabIndex>();
const inFlight = new Map<string, Promise<LabIndex | null>>();

/**
 * Loads (and caches) a lab's catalogue. Safe to call repeatedly — concurrent
 * callers share one request. Returns null when the catalogue is unavailable or
 * too large, in which case callers should fall back to server-side search.
 */
export function loadCatalog(labId: string | undefined): Promise<LabIndex | null> {
  if (!labId) return Promise.resolve(null);

  const cached = indexes.get(labId);
  if (cached) return Promise.resolve(cached.truncated ? null : cached);

  const pending = inFlight.get(labId);
  if (pending) return pending;

  const request = fetch(`/api/catalog/index?lab_id=${encodeURIComponent(labId)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data?.success) return null;
      const tests: IndexedTest[] = (data.tests ?? []).map((row: [string, string, string, number, string]) => ({
        id: row[0],
        name: row[1],
        lower: String(row[1]).toLowerCase(),
        category: row[2] || "Lab Test",
        price: row[3] ?? 0,
        synonyms: row[4] ?? "",
      }));
      const built: LabIndex = { tests, truncated: !!data.truncated };
      indexes.set(labId, built);
      return built.truncated ? null : built;
    })
    .catch(() => null)
    .finally(() => { inFlight.delete(labId); });

  inFlight.set(labId, request);
  return request;
}

/** Warm the cache ahead of time — called when the request sheet opens. */
export function preloadCatalog(labId: string | undefined) {
  void loadCatalog(labId);
}

/** True once this lab's catalogue is in memory and usable. */
export function catalogReady(labId: string | undefined): boolean {
  if (!labId) return false;
  const idx = indexes.get(labId);
  return !!idx && !idx.truncated;
}

/**
 * Ranks catalogue entries against a query: exact name first, then prefix, then
 * word-start, then substring, with synonym matches just behind each.
 */
export function searchCatalog(labId: string | undefined, query: string, limit = 8): CatalogHit[] | null {
  if (!labId) return null;
  const idx = indexes.get(labId);
  if (!idx || idx.truncated) return null;

  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: Array<{ t: IndexedTest; score: number }> = [];
  for (const t of idx.tests) {
    let score = -1;
    if (t.lower === q) score = 0;
    else if (t.lower.startsWith(q)) score = 1;
    else if (t.lower.includes(` ${q}`)) score = 2;
    else if (t.lower.includes(q)) score = 3;
    else if (t.synonyms) {
      if (t.synonyms === q || t.synonyms.includes(`|${q}|`) || t.synonyms.startsWith(`${q}|`) || t.synonyms.endsWith(`|${q}`)) score = 2;
      else if (t.synonyms.includes(q)) score = 4;
    }
    if (score >= 0) {
      scored.push({ t, score });
      // Plenty of candidates to rank without walking a whole large catalogue.
      if (scored.length > 400) break;
    }
  }

  scored.sort((a, b) => a.score - b.score || a.t.name.length - b.t.name.length || a.t.lower.localeCompare(b.t.lower));

  return scored.slice(0, limit).map(({ t }) => ({
    id: t.id,
    canonical_name: t.name,
    category: t.category,
    effective_price: t.price,
    is_rapid_test: false,
  }));
}
