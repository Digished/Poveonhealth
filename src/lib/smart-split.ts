/**
 * Smart test-name splitting.
 *
 * Splits on explicit list separators only — commas, semicolons, and " and ".
 * The imaging-aware path detects a modality prefix and prepends it to each
 * body part so the result makes sense:
 *
 *   "CT scan of leg, back and hand"                   → ["CT scan of leg", "CT scan of back", "CT scan of hand"]
 *   "X-ray chest and abdomen"                         → ["X-ray chest", "X-ray abdomen"]
 *   "Xray of thoracic inlet showing the lungs"        → (single item — no explicit separator)
 *   "Xray of the chest, showing the spine"            → (single item — "showing" is a qualifier, not a new test)
 *
 * We deliberately do NOT split on bare spaces, and we do NOT split when the
 * text after a comma/and is a descriptive qualifier rather than a new body part.
 */

const IMAGING_PREFIX_RE =
  /^((?:x-?rays?|ct\s+scan|cat\s+scan|mri|mr\s+imaging|ultrasound|usg|us\s+scan|echocardiogram|echo|pet\s+scan|mammogram(?:hy)?|fluoroscop(?:y|ic)|doppler\s+(?:us|scan)?|angiograph(?:y|ic)|endoscop(?:y|ic))\s+(?:of\s+)?)/i;

/**
 * Words that signal a descriptive/qualifying clause rather than a new list item.
 * If any non-first split-part starts with one of these, we abort the split.
 */
const QUALIFIER_RE =
  /^(?:showing|with|including|demonstrating|visualizing|revealing|depicting|noting|noting|suggestive|suspicious|consistent|to\s+rule|to\s+assess|to\s+check|to\s+confirm|to\s+exclude|to\s+evaluate|for\s+|ruling\s+out|assessing|confirming|excluding|evaluating)/i;

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

    // Split only on explicit list separators
    const parts = remainder
      .split(/[,;]|\band\b/i)
      .map((s) => s.replace(LEADING_ARTICLE_RE, "").trim())
      .filter(Boolean);

    // If any non-first part is a qualifier phrase (e.g. "showing the spine"),
    // this is a single descriptive study — don't split at all.
    if (parts.length > 1 && parts.slice(1).some((p) => QUALIFIER_RE.test(p))) {
      return [trimmed];
    }

    if (parts.length > 1) {
      return parts.map((part) => `${prefix}${part}`);
    }
    return [trimmed];
  }

  // ── Plain split ───────────────────────────────────────────────────────────
  const parts = trimmed.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}
