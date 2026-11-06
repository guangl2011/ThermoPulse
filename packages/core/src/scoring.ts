/**
 * Compliance scorecard — PASS / MARGINAL / FAIL per criterion, overall = worst
 * (spec art_B7GK27w7, D1 part 2).
 *
 * Three criteria, each a threshold classification over quantities the physics
 * modules already produced:
 *
 *  - thermalStress: did the SOFC stack temperature leave `tempBandC`, and by
 *    how far? Any excursion breaches the envelope; the peak deviation decides
 *    MARGINAL (small breach) vs FAIL (large breach).
 *  - surge: how much of the design surge margin did the worst spool
 *    acceleration consume? Expressed as the ratio of the horizon minimum to
 *    the configured design margin, so the verdict is design-relative.
 *  - storageAdequacy: did the buffer + plant serve every step? Any unmet
 *    energy (including mid-pulse exhaustion) is FAIL — recorded, never
 *    clamped. Covering the horizon but riding the buffer to near-empty is
 *    MARGINAL.
 *
 * Monotonicity contract: on fixed physics results, relaxing any threshold
 * never worsens its criterion's verdict (and therefore never worsens
 * overall). The property tests pin this.
 *
 * Pure functions only: no I/O, no clock, no state across calls.
 */
import type {
  ComplianceScore,
  SofcThermalResult,
  StorageDispatchResult,
  SystemConfig,
  TurbineResult,
  Verdict,
} from "./types.js";

/** Peak temperature excursion beyond the band edge (°C) up to which a breach is MARGINAL, not FAIL. */
export const DEFAULT_THERMAL_MARGINAL_DEVIATION_C = 10;

/** A surge-margin dip below this fraction of the design margin is FAIL. */
export const DEFAULT_SURGE_FAIL_FRACTION = 0.25;

/** A surge-margin dip below this fraction of the design margin is at best MARGINAL. */
export const DEFAULT_SURGE_MARGINAL_FRACTION = 0.9;

/**
 * Covering the horizon with the buffer riding below this fraction of capacity
 * is at best MARGINAL: a slightly worse-timed repeat of the same scenario
 * would exhaust it.
 */
export const DEFAULT_STORAGE_MARGINAL_SOC_FRACTION = 0.1;

/** Unmet energy at or below this floor (MWh) is float dust, not a shortfall. */
export const UNMET_ENERGY_EPSILON_MWH = 1e-9;

/**
 * Surge-margin zone cuts, all relative to the configured design margin:
 * a ratio below `surgeFailFraction` is FAIL, at or above it but below
 * `surgeMarginalFraction` is MARGINAL, and at or above that is PASS. The two
 * cuts are independent: an inverted pair (fail >= marginal) is a legal
 * degenerate configuration whose MARGINAL zone is simply empty.
 */
export interface ScoringThresholds {
  /** °C of peak band deviation up to which a thermal breach is MARGINAL (default 10). */
  thermalMarginalDeviationC?: number;
  /** Surge verdict is FAIL below this fraction of the design margin (default 0.25). */
  surgeFailFraction?: number;
  /** Surge verdict is at best MARGINAL below this fraction of the design margin (default 0.9). */
  surgeMarginalFraction?: number;
  /** Storage verdict is at best MARGINAL below this horizon-minimum SOC fraction (default 0.1). */
  storageMarginalSoCFraction?: number;
}

/** The per-module results a compliance verdict is rendered from. */
export interface ComplianceInput {
  thermal: SofcThermalResult;
  turbine: TurbineResult;
  storage: StorageDispatchResult;
}

const SEVERITY: Record<Verdict, number> = { PASS: 0, MARGINAL: 1, FAIL: 2 };

/** Worst of the given verdicts (FAIL > MARGINAL > PASS). */
export function worstVerdict(verdicts: readonly Verdict[]): Verdict {
  return verdicts.reduce((worst, v) => (SEVERITY[v] > SEVERITY[worst] ? v : worst), "PASS");
}

function requireNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number, got ${String(value)}.`);
  }
}

function resolveThresholds(thresholds: ScoringThresholds = {}): Required<ScoringThresholds> {
  const thermal = thresholds.thermalMarginalDeviationC ?? DEFAULT_THERMAL_MARGINAL_DEVIATION_C;
  const fail = thresholds.surgeFailFraction ?? DEFAULT_SURGE_FAIL_FRACTION;
  const marginal = thresholds.surgeMarginalFraction ?? DEFAULT_SURGE_MARGINAL_FRACTION;
  const soc = thresholds.storageMarginalSoCFraction ?? DEFAULT_STORAGE_MARGINAL_SOC_FRACTION;
  requireNonNegative(thermal, "thresholds.thermalMarginalDeviationC");
  requireNonNegative(fail, "thresholds.surgeFailFraction");
  requireNonNegative(marginal, "thresholds.surgeMarginalFraction");
  requireNonNegative(soc, "thresholds.storageMarginalSoCFraction");
  return {
    thermalMarginalDeviationC: thermal,
    surgeFailFraction: fail,
    surgeMarginalFraction: marginal,
    storageMarginalSoCFraction: soc,
  };
}

/**
 * Thermal-stress envelope: did the stack stay inside `tempBandC`, and how far
 * beyond the edge did any excursion reach?
 */
export function scoreThermalStress(
  thermal: SofcThermalResult,
  thresholds: Required<ScoringThresholds>,
): Verdict {
  if (thermal.excursions.length === 0) {
    return "PASS";
  }
  let peak = 0;
  for (const e of thermal.excursions) {
    if (e.peakDeviationC > peak) {
      peak = e.peakDeviationC;
    }
  }
  return peak <= thresholds.thermalMarginalDeviationC ? "MARGINAL" : "FAIL";
}

/**
 * Surge margin: the horizon minimum relative to the configured design margin.
 * A healthy buffered run never accelerates the spool, so its ratio is 1.
 */
export function scoreSurge(
  turbine: TurbineResult,
  system: SystemConfig,
  thresholds: Required<ScoringThresholds>,
): Verdict {
  const design = system.turbine.surgeMarginFraction;
  if (design <= 0) {
    // Degenerate design margin: no headroom was engineered in, so any dip at
    // all is a FAIL and a flat zero margin is a FAIL too.
    return turbine.surgeMarginMin > 0 ? "MARGINAL" : "FAIL";
  }
  const ratio = turbine.surgeMarginMin / design;
  if (ratio < thresholds.surgeFailFraction) {
    return "FAIL";
  }
  return ratio < thresholds.surgeMarginalFraction ? "MARGINAL" : "PASS";
}

/**
 * Storage adequacy: every step served, with margin to spare, or the recorded
 * shortfall that fails the run.
 */
export function scoreStorageAdequacy(
  storage: StorageDispatchResult,
  system: SystemConfig,
  thresholds: Required<ScoringThresholds>,
): Verdict {
  const missed = storage.unmetEnergyMWh > UNMET_ENERGY_EPSILON_MWH || storage.oversubscribed;
  if (missed) {
    return "FAIL";
  }
  const capacity = system.storage.energyKWh;
  if (capacity <= 0) {
    // Legal unbuffered configuration that never missed load (no pulses): the
    // criterion has nothing to be marginal about.
    return "PASS";
  }
  const minSoCFraction = storage.energyKWh.values.reduce(
    (min, e) => (e < min ? e : min),
    Number.POSITIVE_INFINITY,
  );
  return minSoCFraction / capacity < thresholds.storageMarginalSoCFraction ? "MARGINAL" : "PASS";
}

/**
 * Render the compliance scorecard from the thermal, turbine, and storage
 * results. Overall is the worst of the three criteria.
 */
export function scoreCompliance(
  system: SystemConfig,
  input: ComplianceInput,
  thresholds: ScoringThresholds = {},
): ComplianceScore {
  const resolved = resolveThresholds(thresholds);
  const thermalStress = scoreThermalStress(input.thermal, resolved);
  const surge = scoreSurge(input.turbine, system, resolved);
  const storageAdequacy = scoreStorageAdequacy(input.storage, system, resolved);
  return {
    thermalStress,
    surge,
    storageAdequacy,
    overall: worstVerdict([thermalStress, surge, storageAdequacy]),
  };
}
