// =============================================================================
// POVEON HEALTH - CODE GENERATION UTILITY
// Generates unique, lab-specific request codes e.g. "LABA-8X4K29Q"
// =============================================================================

// Characters that are visually unambiguous (no 0/O, 1/I/L confusion)
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;

/**
 * Derive a short uppercase prefix from a lab name.
 * Uses first letter of each word, up to 4 characters.
 * Fallback: first 4 chars of the name.
 */
export function derivePrefixFromName(labName: string): string {
  const words = labName.trim().split(/\s+/).filter(Boolean);

  let prefix: string;
  if (words.length >= 2) {
    prefix = words.map((w) => w[0].toUpperCase()).join("");
  } else {
    prefix = words[0].replace(/[^A-Z0-9]/gi, "").toUpperCase();
  }

  return prefix.substring(0, 4);
}

/**
 * Generate the random part of the code (e.g. "8X4K29Q").
 */
function generateRandomSegment(): string {
  let result = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return result;
}

/**
 * Build a full code from a lab prefix.
 * Example: prefix="LABA" → "LABA-8X4K29Q"
 */
export function buildCode(prefix: string): string {
  return `${prefix}-${generateRandomSegment()}`;
}

/**
 * Generate a unique code by checking for collisions in the database.
 * Retries up to maxAttempts times.
 *
 * @param prefix   Lab prefix string
 * @param checkExists  Async fn that returns true if the code already exists
 * @param maxAttempts  Max retries before throwing
 */
export async function generateUniqueCode(
  prefix: string,
  checkExists: (code: string) => Promise<boolean>,
  maxAttempts = 10
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = buildCode(prefix);
    const exists = await checkExists(code);
    if (!exists) return code;
  }
  throw new Error(
    `Failed to generate a unique code after ${maxAttempts} attempts`
  );
}
