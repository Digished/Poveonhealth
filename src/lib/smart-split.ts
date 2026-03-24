/**
 * Smart test-name splitting.
 *
 * Splits on explicit list separators only — commas, semicolons, and " and ".
 * The imaging-aware path detects a modality prefix and prepends it to each
 * body part so the result makes sense:
 *
 *   "CT scan of leg, back and hand"            → ["CT scan of leg", "CT scan of back", "CT scan of hand"]
 *   "X-ray chest and abdomen"                  → ["X-ray chest", "X-ray abdomen"]
 *   "Xray of thoracic inlet showing the lungs" → ["Xray of thoracic inlet showing the lungs"]  (single item)
 *
 * We deliberately do NOT split on bare spaces because a phrase like
 * "thoracic inlet showing the lungs" is one study, not a list.
 */

const IMAGING_PREFIX_RE =
  /^((?:x-?rays?|ct\s+scan|cat\s+scan|mri|mr\s+imaging|ultrasound|usg|us\s+scan|echocardiogram|echo|pet\s+scan|mammogram(?:hy)?|fluoroscop(?:y|ic)|doppler\s+(?:us|scan)?|angiograph(?:y|ic)|endoscop(?:y|ic))\s+(?:of\s+)?)/i;

/** Strip leading articles so "the chest" becomes "chest" in the pill label. */
const LEADING_ARTICLE_RE = /^(?:the|a|an)\s+/i;

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
    const remainder = trimmed.slice(prefix.length);

    // Split only on explicit list separators — never on bare spaces
    const parts = remainder
      .split(/[,;]|\band\b/i)
      .map((s) => s.replace(LEADING_ARTICLE_RE, "").trim())
      .filter(Boolean);

    if (parts.length > 1) {
      return parts.map((part) => `${prefix}${part}`);
    }
    // Single body part / descriptive phrase — return as-is (full original)
    return [trimmed];
  }

  // ── Plain split ───────────────────────────────────────────────────────────
  const parts = trimmed.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}
