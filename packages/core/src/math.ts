/** Pure, dependency-free numerical helpers shared by the physics modules. */

/** Constrain `value` to the closed interval [`min`, `max`]. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    throw new TypeError("clamp: value must be a finite number, got NaN");
  }
  if (min > max) {
    throw new RangeError(`clamp: min (${min}) must not exceed max (${max})`);
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Read a validated series element. Series are validated for length up front,
 * so this only narrows the `number | undefined` that strict indexing yields.
 */
export function at(series: readonly number[], index: number): number {
  const value = series[index];
  if (value === undefined) {
    throw new RangeError(`series index ${index} is out of bounds (length ${series.length})`);
  }
  return value;
}
