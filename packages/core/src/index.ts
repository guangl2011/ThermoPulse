/**
 * Pure, dependency-free numerical helpers shared by the simulation engine.
 * The full SOFC-GT physics engine lands in its own deliverable; these are the
 * primitives it will be built on.
 */

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
