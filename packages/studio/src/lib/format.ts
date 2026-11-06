/** Rendering helpers for dashboard values. The dashboard consumes these in the
 * studio deliverable; defined here so the number format is decided once. */

/** Format an efficiency or margin figure as a percentage string, e.g. `72.4%`. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`formatPercent: expected a finite number, got ${value}`);
  }
  return `${value.toFixed(decimals)}%`;
}
