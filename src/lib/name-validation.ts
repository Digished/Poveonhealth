/**
 * Shared validation for referrer identity fields (doctor name, hospital).
 * Labs kept receiving requests with an empty or junk doctor name / hospital,
 * so both the forms and the create-request API require a minimum of 4 letters.
 */

export const MIN_NAME_LETTERS = 4;

/** Number of alphabetic characters in a string (spaces, digits, punctuation ignored). */
export function letterCount(value: string | null | undefined): number {
  return (value ?? "").replace(/[^a-zA-Z]/g, "").length;
}

/** True when the field contains at least MIN_NAME_LETTERS letters. */
export function hasMinLetters(value: string | null | undefined): boolean {
  return letterCount(value) >= MIN_NAME_LETTERS;
}
