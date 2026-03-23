/**
 * Smart test-name splitting.
 *
 * For plain lists ("ESR, FBC") it splits on commas, semicolons, and " and ".
 *
 * For imaging tests ("CT scan of leg, back and hand") it detects the modality
 * prefix ("CT scan of ") and duplicates it for each body-part so that the
 * result is ["CT scan of leg", "CT scan of back", "CT scan of hand"] instead
 * of the useless ["CT scan of leg", "back", "hand"].
 */

const IMAGING_PREFIX_RE =
  /^((?:x-?rays?|ct\s+scan|cat\s+scan|mri|mr\s+imaging|ultrasound|usg|us\s+scan|echocardiogram|echo|pet\s+scan|mammogram(?:hy)?|fluoroscop(?:y|ic)|doppler\s+(?:us|scan)?|angiograph(?:y|ic)|endoscop(?:y|ic))\s+(?:of\s+)?)/i;

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
    const remainder = trimmed.slice(prefix.length); // e.g. "leg, back and hand"
    const parts = remainder.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      // Prepend the imaging prefix to each body part
      return parts.map((part) => `${prefix}${part}`);
    }
    // Only one body part — return as-is
    return [trimmed];
  }

  // ── Plain split ───────────────────────────────────────────────────────────
  const parts = trimmed.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}
