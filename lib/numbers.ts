/**
 * Reads a whole number the way a person types one.
 *
 * "5,000,000", "5 000 000" and "5_000_000" all mean five million, and the
 * console itself displays allowances with commas, so that is what gets typed
 * back in. `Number()` turns every one of those into NaN, and a caller that
 * then falls back to zero has just set an allowance of nothing.
 *
 * Returns null for anything that is not a whole number, so the caller has to
 * decide what an unreadable entry means rather than inherit a default.
 */
export function parseWholeNumber(input: string): number | null {
  const cleaned = input.replace(/[,\s_]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}
