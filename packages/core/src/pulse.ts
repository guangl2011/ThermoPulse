/**
 * GPU pulse synthesis: turns a `LoadProfile` into the net bus-load series the
 * thermal models are dispatched against.
 *
 * Each pulse contributes a piecewise-linear shed fraction (drop, hold,
 * recovery); the sum of all pulses is therefore piecewise linear too, and
 * capping the total shed at 1 (load never goes negative) only introduces
 * breakpoints where the sum crosses 1. Every integral is computed in closed
 * form on that piecewise-linear shape, which is what makes sub-timestep
 * pulses alias-free: energy comes from the analytic shape, never from point
 * samples on the simulation grid.
 */
import type { LoadProfile, PulseSeries } from "./types.js";
import { assertValidLoadProfile, stepCount } from "./validate.js";

/** Hold time at the pulse floor when `GpuPulse.durationS` is omitted (s). */
const DEFAULT_PULSE_HOLD_S = 30;

interface ResolvedPulse {
  startS: number;
  /** Absolute edge times — the SAME floats used as integration breakpoints. */
  endDownS: number;
  endHoldS: number;
  endRecoveryS: number;
  rampDownS: number;
  rampUpS: number;
  depth: number;
}

function resolvePulses(profile: LoadProfile): ResolvedPulse[] {
  return profile.pulses.map((pulse) => {
    const endDownS = pulse.startS + pulse.rampDownS;
    const endHoldS = endDownS + (pulse.durationS ?? DEFAULT_PULSE_HOLD_S);
    const endRecoveryS = endHoldS + (pulse.rampUpS ?? pulse.rampDownS);
    return {
      startS: pulse.startS,
      endDownS,
      endHoldS,
      endRecoveryS,
      rampDownS: pulse.rampDownS,
      rampUpS: pulse.rampUpS ?? pulse.rampDownS,
      depth: pulse.depthFraction,
    };
  });
}

/** Uncapped shed contribution of one pulse at time `t`, with local slope. */
function pulseShed(pulse: ResolvedPulse, t: number): { value: number; slope: number } {
  // Branch boundaries compare `t` against the SAME stored floats that seeded
  // the breakpoint set — recomputing edges here (e.g. `rampDownS + holdS`)
  // diverges from them in the last ulp and hands a segment the wrong slope.
  if (t < pulse.startS) {
    return { value: 0, slope: 0 };
  }
  if (t < pulse.endDownS) {
    return {
      value: (pulse.depth * (t - pulse.startS)) / pulse.rampDownS,
      slope: pulse.depth / pulse.rampDownS,
    };
  }
  if (t < pulse.endHoldS) {
    return { value: pulse.depth, slope: 0 };
  }
  if (t < pulse.endRecoveryS) {
    return {
      value: (pulse.depth * (pulse.endRecoveryS - t)) / pulse.rampUpS,
      slope: -pulse.depth / pulse.rampUpS,
    };
  }
  return { value: 0, slope: 0 };
}

const linearMean = (y0: number, y1: number): number => (y0 + y1) / 2;

/**
 * Exact integrator for min(1, Σ pulse sheds) over the horizon. A `Set` dedupe
 * is enough for breakpoint identity because repeated edge arithmetic on the
 * same floats is deterministic.
 */
class ShedSum {
  readonly breakpoints: number[];

  constructor(
    private readonly pulses: ResolvedPulse[],
    horizonS: number,
  ) {
    const edges = new Set<number>([0, horizonS]);
    for (const pulse of pulses) {
      for (const t of [pulse.startS, pulse.endDownS, pulse.endHoldS, pulse.endRecoveryS]) {
        if (t > 0 && t < horizonS) {
          edges.add(t);
        }
      }
    }
    this.breakpoints = [...edges].sort((a, b) => a - b);
  }

  /** Uncapped sum of pulse sheds at `t` (constant slope between breakpoints). */
  private at(t: number): { value: number; slope: number } {
    let value = 0;
    let slope = 0;
    for (const pulse of this.pulses) {
      const shed = pulseShed(pulse, t);
      value += shed.value;
      slope += shed.slope;
    }
    return { value, slope };
  }

  /** ∫ min(1, Σ shed) dt over [from, to] — exact, via cap-crossing splits. */
  integral(from: number, to: number): number {
    if (to <= from) {
      return 0;
    }
    let total = 0;
    let a = from;
    for (let i = 0; i < this.breakpoints.length; i++) {
      const b = this.breakpoints[i];
      // Strict comparisons only: merging a near-`a` or near-`to` breakpoint
      // into its neighbor can hide a pulse-start kink inside a "breakpoint-free"
      // segment (a denormal startS once erased an entire rise triangle). A
      // zero-width segment is harmless — integralSegment returns 0 for it.
      if (b === undefined || b <= a) {
        continue;
      }
      if (b >= to) {
        break;
      }
      total += this.integralSegment(a, b);
      a = b;
    }
    return total + this.integralSegment(a, to);
  }

  /** Exact integral of max(0, min(1, linear)) over one breakpoint-free segment. */
  private integralSegment(a: number, b: number): number {
    const span = b - a;
    if (span <= 0) {
      return 0;
    }
    const { value, slope } = this.at(a);
    const lineAt = (t: number): number => Math.max(0, Math.min(1, value + slope * (t - a)));
    // Split at the floor (0) and cap (1) crossings of the raw line, then
    // trapezoid each sub-interval — between crossings the clamped integrand is
    // exactly linear, so the sum is exact. This also absorbs stale post-boundary
    // slopes (float-merged breakpoints): their extrapolation is floored at the
    // zero crossing instead of driving the integral negative.
    const points = [a, b];
    if (slope !== 0) {
      for (const target of [0, 1]) {
        const cross = a + (target - value) / slope;
        if (cross > a && cross < b) {
          points.push(cross);
        }
      }
    }
    points.sort((x, y) => x - y);
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1]!;
      const end = points[i]!;
      total += linearMean(lineAt(start), lineAt(end)) * (end - start);
    }
    return total;
  }
}

/**
 * Synthesize the per-step average net bus load for a profile. The final step
 * may be shorter than `timestepS` so the series ends exactly at the horizon;
 * per-step values are exact step averages, not point samples.
 */
export function synthesizeLoad(profile: LoadProfile): PulseSeries {
  assertValidLoadProfile(profile);
  const shed = new ShedSum(resolvePulses(profile), profile.durationS);
  const steps = stepCount(profile.durationS, profile.timestepS);
  const dt = profile.timestepS;
  const powerMW = new Array<number>(steps);
  let t0 = 0;
  for (let k = 0; k < steps; k++) {
    const t1 = Math.min((k + 1) * dt, profile.durationS);
    powerMW[k] = profile.nominalMW * (1 - shed.integral(t0, t1) / (t1 - t0));
    t0 = t1;
  }
  const shedTotal = shed.integral(0, profile.durationS);
  return {
    timestepS: dt,
    horizonS: profile.durationS,
    nominalMW: profile.nominalMW,
    powerMW,
    energyMWh: (profile.nominalMW * (profile.durationS - shedTotal)) / 3600,
  };
}
