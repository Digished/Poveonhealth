/**
 * Smart test-name splitting.
 *
 * For plain lists ("ESR, FBC") it splits on commas, semicolons, and " and ".
 *
 * For imaging tests it detects the modality prefix and duplicates it for each
 * body part:
 *   "CT scan of leg, back and hand"  → ["CT scan of leg", "CT scan of back", "CT scan of hand"]
 *   "X-ray of the back head and neck" → ["X-ray of back", "X-ray of head", "X-ray of neck"]
 *
 * Compound anatomical terms (e.g. "lumbar spine", "chest wall") are kept intact.
 */

const IMAGING_PREFIX_RE =
  /^((?:x-?rays?|ct\s+scan|cat\s+scan|mri|mr\s+imaging|ultrasound|usg|us\s+scan|echocardiogram|echo|pet\s+scan|mammogram(?:hy)?|fluoroscop(?:y|ic)|doppler\s+(?:us|scan)?|angiograph(?:y|ic)|endoscop(?:y|ic))\s+(?:of\s+)?)/i;

/**
 * Known multi-word anatomical terms that should NOT be split further on spaces.
 * All lowercase for comparison.
 */
const COMPOUND_BODY_PARTS = new Set([
  "lumbar spine",
  "thoracic spine",
  "cervical spine",
  "spinal cord",
  "chest wall",
  "pelvic floor",
  "renal pelvis",
  "middle ear",
  "inner ear",
  "soft tissue",
  "bone marrow",
  "lymph node",
  "lymph nodes",
  "lower back",
  "upper back",
  "lower limb",
  "upper limb",
  "lower leg",
  "upper arm",
  "small bowel",
  "large bowel",
  "small intestine",
  "large intestine",
  "nasal cavity",
  "oral cavity",
  "temporal bone",
  "optic nerve",
  "bile duct",
  "parotid gland",
  "thyroid gland",
  "adrenal gland",
  "sacral spine",
  "sacroiliac joint",
  "hip joint",
  "knee joint",
  "elbow joint",
  "shoulder joint",
  "wrist joint",
  "ankle joint",
  "sacroiliac joints",
]);

/** Strip leading articles / prepositions that litter body-part names */
const LEADING_ARTICLE_RE = /^(?:the|a|an|of|of\s+the|of\s+a)\s+/i;

/**
 * Given a fragment like "the back head and neck", return individual body parts:
 * ["back", "head", "neck"].
 *
 * Steps:
 *  1. Coarse-split on commas, semicolons, "and"
 *  2. For each coarse part, strip leading articles
 *  3. If the result is a known compound term → keep as-is
 *  4. Otherwise split on spaces to separate adjacent body parts
 */
function splitBodyParts(remainder: string): string[] {
  // 1. Coarse split
  const coarse = remainder
    .split(/[,;]|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const chunk of coarse) {
    // 2. Strip leading article
    const clean = chunk.replace(LEADING_ARTICLE_RE, "").trim();
    if (!clean) continue;

    // 3. Known compound → keep intact
    if (COMPOUND_BODY_PARTS.has(clean.toLowerCase())) {
      parts.push(clean);
      continue;
    }

    // 4. Multi-word chunk → split on spaces (handles "back head" → ["back","head"])
    const tokens = clean.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      parts.push(clean);
    } else {
      // Check if the entire multi-word phrase is itself compound
      // (e.g. "lumbar spine" after article strip)
      if (COMPOUND_BODY_PARTS.has(clean.toLowerCase())) {
        parts.push(clean);
      } else {
        parts.push(...tokens);
      }
    }
  }

  return parts;
}

/**
 * Returns an array of individual test-name strings.
 * Always returns at least one element (the original, trimmed).
 */
export function smartSplitTestNames(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // ── Imaging-aware split ────────────────────────────────────────────────────
  const imagingMatch = trimmed.match(IMAGING_PREFIX_RE);
  if (imagingMatch) {
    const prefix = imagingMatch[1]; // e.g. "CT scan of " or "X-ray of "
    const remainder = trimmed.slice(prefix.length); // e.g. "the back head and neck"
    const parts = splitBodyParts(remainder);
    if (parts.length > 1) {
      return parts.map((part) => `${prefix}${part}`);
    }
    if (parts.length === 1) {
      return [`${prefix}${parts[0]}`];
    }
    return [trimmed];
  }

  // ── Plain split ───────────────────────────────────────────────────────────
  const parts = trimmed.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}
