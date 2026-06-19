import { prisma } from "@/lib/prisma";
import { buildTestIndex, type CatalogLite, type TestIndex } from "@/lib/test-dictionary";

/**
 * Server-side, cached test-detection index for a lab (catalogue + dictionary).
 *
 * The dictionary is static and catalogues change rarely, so we cache the
 * fully-built index per lab to keep segmentation near-instant on every keystroke
 * (the segment endpoint) and cheap on submit (the create route).
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const indexCache = new Map<string, { index: TestIndex; ts: number }>();

export async function getSegmentIndex(labId: string | null): Promise<TestIndex> {
  const key = labId ?? "_dictionary_only";
  const hit = indexCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.index;

  let catalog: CatalogLite[] = [];
  if (labId) {
    try {
      const rows = await prisma.labOfferedTest.findMany({
        where: { lab_id: labId, is_active: true },
        select: { id: true, raw_name: true, synonyms: true },
      });
      catalog = rows.map((r) => ({
        id: r.id,
        name: r.raw_name,
        synonyms: Array.isArray(r.synonyms) ? (r.synonyms as unknown[]).filter((s): s is string => typeof s === "string") : [],
      }));
    } catch (e) {
      console.error("[test-segment-cache] catalogue load failed:", e);
    }
  }

  const index = buildTestIndex(catalog);
  indexCache.set(key, { index, ts: Date.now() });
  return index;
}
