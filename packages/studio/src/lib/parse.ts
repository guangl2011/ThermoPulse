/** Number-input parsing. The DOM hands forms strings; forms store numbers,
 * with NaN as the explicit "not a number yet" value so validation can report
 * it instead of propagating garbage. */

/** Parse raw form input into a number; empty or malformed input becomes NaN. */
export function parseNumberInput(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return Number.NaN;
  }
  return Number(trimmed);
}
