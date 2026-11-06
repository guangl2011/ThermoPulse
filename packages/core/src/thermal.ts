/**
 * Lumped-parameter SOFC-GT thermal model.
 *
 * SOFC: two-channel lumped stack. The bulk temperature relaxes toward an
 * operating-point map (inset inside the survivable band) with the stack's
 * thermal time constant; a fast gradient-stress channel adds a decaying
 * temperature deviation proportional to the fuel system's tracking error —
 * the lumped stand-in for the fuel-air imbalance that cracks stacks when
 * commands step faster than `maxRampMWPerS`. The fuel/energy book (fuel in =
 * electric out + rejected heat + stored heat) closes exactly per step, which
 * is what the 0.1%-per-horizon conservation property checks.
 *
 * Turbine: first-order spool response with a compressor surge-margin
 * surrogate — margin dips in proportion to normalized spool acceleration and
 * recovers as the spool settles.
 *
 * Pure functions only: no I/O, no clock, no state across calls.
 */
import { at, clamp } from "./math.js";
import type {
  DemandAllocation,
  SofcModelOptions,
  SofcThermalResult,
  SystemConfig,
  ThermalExcursion,
  ThermalModelOptions,
  ThermalRunResult,
  TimeSeries,
  TurbineModelOptions,
  TurbineResult,
} from "./types.js";
import {
  assertValidCommandSeries,
  assertValidSofcOptions,
  assertValidSofcParams,
  assertValidTurbineOptions,
  assertValidTurbineParams,
} from "./validate.js";

const DEFAULT_ELECTRICAL_EFFICIENCY = 0.55;
const DEFAULT_STRESS_GAIN_K_PER_UNIT = 200;
/** Gradient stress relaxes ~50x faster than the bulk stack (bounded 1-10 s). */
const STRESS_TAU_DIVISOR = 50;
const STRESS_TAU_MIN_S = 1;
const STRESS_TAU_MAX_S = 10;
/** Bulk equilibrium map inset: 15%..85% of the survivable band across the load range. */
const T_OP_LOW_FRACTION = 0.15;
const T_OP_SPAN_FRACTION = 0.7;
/** Surge-margin fraction consumed by a full-rated spool acceleration. */
const DEFAULT_SURGE_ACCEL_GAIN = 0.9;

function resolveStressTauS(thermalTimeConstantS: number, options: SofcModelOptions): number {
  if (options.stressTimeConstantS !== undefined) {
    return options.stressTimeConstantS;
  }
  return clamp(thermalTimeConstantS / STRESS_TAU_DIVISOR, STRESS_TAU_MIN_S, STRESS_TAU_MAX_S);
}

/**
 * Tracks temperature excursions outside the survivable band. Streamed (no
 * post-hoc array scan) so large horizons cost one pass.
 */
function createExcursionTracker(
  band: readonly [number, number],
  horizonS: number,
): { observe: (timeS: number, stackC: number) => void; result: () => ThermalExcursion[] } {
  const [bandLow, bandHigh] = band;
  const excursions: ThermalExcursion[] = [];
  let open: { side: "over" | "under"; startS: number; peakC: number } | null = null;

  function close(endS: number): void {
    if (open !== null) {
      excursions.push({ startS: open.startS, endS, peakDeviationC: open.peakC, side: open.side });
      open = null;
    }
  }

  return {
    observe(timeS, stackC) {
      const side = stackC > bandHigh ? "over" : stackC < bandLow ? "under" : null;
      if (side === null) {
        close(timeS);
        return;
      }
      const deviationC = side === "over" ? stackC - bandHigh : bandLow - stackC;
      if (open !== null && open.side !== side) {
        close(timeS); // crossed the whole band within one step
      }
      if (open === null) {
        open = { side, startS: timeS, peakC: deviationC };
      } else {
        open.peakC = Math.max(open.peakC, deviationC);
      }
    },
    result() {
      close(horizonS);
      return excursions;
    },
  };
}

/**
 * Run the lumped SOFC stack against a per-step command trajectory. The run
 * starts in thermal steady state at the first commanded operating point:
 * pre-horizon operation is assumed settled, so only in-horizon transients
 * are scored.
 */
export function runSofcThermal(
  sofc: SystemConfig["sofc"],
  commandMW: readonly number[],
  timestepS: number,
  options: SofcModelOptions = {},
): SofcThermalResult {
  assertValidSofcParams(sofc);
  assertValidCommandSeries(commandMW, timestepS);
  assertValidSofcOptions(options);

  const mw = sofc.mw;
  const minMW = sofc.minLoadFraction * mw;
  const [bandLow, bandHigh] = sofc.tempBandC;
  const bandSpan = bandHigh - bandLow;
  const tauS = sofc.thermalTimeConstantS;
  const stressTauS = resolveStressTauS(tauS, options);
  const stressGainK = options.stressGainKPerUnit ?? DEFAULT_STRESS_GAIN_K_PER_UNIT;
  const etaElec = options.electricalEfficiency ?? DEFAULT_ELECTRICAL_EFFICIENCY;

  // Steady operating map: bulk equilibrium temperature vs load fraction,
  // inset inside the survivable band so steady operation never sits on an
  // edge; excursions come from transients, not from the map itself.
  const tOpAt = (loadFraction: number): number =>
    bandLow + bandSpan * (T_OP_LOW_FRACTION + T_OP_SPAN_FRACTION * loadFraction);

  // Lumped energy book: rejection is linearized around the operating map and
  // anchored at the min-load equilibrium; tau = R*C closes fuel heat to
  // temperature exactly (see the per-step identity below).
  const heatLossFraction = 1 / etaElec - 1;
  const anchorC = tOpAt(0);
  const rejectionKPerMW = (tOpAt(1) - anchorC) / (mw * heatLossFraction);
  const heatCapacityMJPerK = tauS / rejectionKPerMW;

  const steps = commandMW.length;
  const deliveredMW = new Array<number>(steps);
  const stressDeviationC = new Array<number>(steps);
  const timesS = new Array<number>(steps);
  const temperatureValues = new Array<number>(steps);
  const excursions = createExcursionTracker(sofc.tempBandC, steps * timestepS);

  const bulkFactor = Math.exp(-timestepS / tauS);
  let prevPowerMW = clamp(at(commandMW, 0), minMW, mw);
  let prevBulkC = tOpAt(prevPowerMW / mw);
  let prevStressC = 0;
  let fuelEnergyMJ = 0;
  let electricalEnergyMJ = 0;
  let rejectedHeatMJ = 0;
  let storedHeatMJ = 0;
  let minStackC = Number.POSITIVE_INFINITY;
  let maxStackC = Number.NEGATIVE_INFINITY;

  for (let k = 0; k < steps; k++) {
    const targetMW = clamp(at(commandMW, k), minMW, mw);
    const rampStepMW = sofc.maxRampMWPerS * timestepS;
    const powerMW = prevPowerMW + clamp(targetMW - prevPowerMW, -rampStepMW, rampStepMW);

    // Gradient-stress surrogate: the fuel system follows what it can (the rate
    // limiter above); the tracking error — the part of the clamped command it
    // cannot deliver this step — is the fuel-air imbalance that drives the
    // fast, decaying temperature deviation. Within-limit ramps track exactly
    // (error 0, no stress); only limiter-violating transients stress the
    // stack. Energy-neutral by construction: it is a gradient measure, not
    // stored heat.
    const trackingErrorFraction = Math.abs(targetMW - powerMW) / mw;
    const stressTargetC = stressGainK * trackingErrorFraction;

    const loadFraction = powerMW / mw;
    const bulkTargetC = tOpAt(loadFraction);
    const bulkC = bulkTargetC + (prevBulkC - bulkTargetC) * bulkFactor;
    const stressC =
      stressTargetC + (prevStressC - stressTargetC) * Math.exp(-timestepS / stressTauS);
    const stackC = bulkC + stressC;

    // Exact per-step integrals (linear ODE, frozen coefficients over the step):
    // C*(T_k - T_{k-1}) = genHeat_step - rejectedHeat_step, where
    // genHeat_step = fuel_step - electric_step. The closure identity below is
    // exact up to float rounding.
    const bulkIntegralC =
      bulkTargetC * timestepS + (prevBulkC - bulkTargetC) * tauS * (1 - bulkFactor);
    const electricalStepMJ = powerMW * timestepS;
    const fuelStepMJ = electricalStepMJ / etaElec;
    const rejectedStepMJ = (bulkIntegralC - anchorC * timestepS) / rejectionKPerMW;
    const storedStepMJ = heatCapacityMJPerK * (bulkC - prevBulkC);

    const timeS = (k + 1) * timestepS;
    deliveredMW[k] = powerMW;
    stressDeviationC[k] = stressC;
    timesS[k] = timeS;
    temperatureValues[k] = stackC;
    excursions.observe(timeS, stackC);

    fuelEnergyMJ += fuelStepMJ;
    electricalEnergyMJ += electricalStepMJ;
    rejectedHeatMJ += rejectedStepMJ;
    storedHeatMJ += storedStepMJ;
    if (stackC < minStackC) {
      minStackC = stackC;
    }
    if (stackC > maxStackC) {
      maxStackC = stackC;
    }

    prevPowerMW = powerMW;
    prevBulkC = bulkC;
    prevStressC = stressC;
  }

  // Closure identity (exact up to float rounding): fuel = electric + rejected
  // + stored, accumulated per step from the ODE's own integrals.
  const energyClosureErrorPct =
    (Math.abs(fuelEnergyMJ - electricalEnergyMJ - rejectedHeatMJ - storedHeatMJ) /
      Math.max(fuelEnergyMJ, 1e-9)) *
    100;

  return {
    horizonS: steps * timestepS,
    timestepS,
    deliveredMW,
    stressDeviationC,
    temperatureC: { timesS, values: temperatureValues } satisfies TimeSeries,
    excursions: excursions.result(),
    minTemperatureC: minStackC,
    maxTemperatureC: maxStackC,
    fuelEnergyMWh: fuelEnergyMJ / 3600,
    electricalEnergyMWh: electricalEnergyMJ / 3600,
    rejectedHeatMWh: rejectedHeatMJ / 3600,
    storedHeatDeltaMWh: storedHeatMJ / 3600,
    energyClosureErrorPct,
  };
}

/**
 * Run the gas turbine against a per-step command trajectory. Starts settled at
 * the first command (no startup artifact), same steady-initialization rule as
 * the SOFC model.
 */
export function runTurbine(
  turbine: SystemConfig["turbine"],
  commandMW: readonly number[],
  timestepS: number,
  options: TurbineModelOptions = {},
): TurbineResult {
  assertValidTurbineParams(turbine);
  assertValidCommandSeries(commandMW, timestepS);
  assertValidTurbineOptions(options);

  const mw = turbine.mw;
  const baseMargin = turbine.surgeMarginFraction;
  const accelGain = options.surgeAccelGain ?? DEFAULT_SURGE_ACCEL_GAIN;
  const decay = Math.exp(-timestepS / turbine.responseS);

  const steps = commandMW.length;
  const deliveredMW = new Array<number>(steps);
  const surgeMargin = new Array<number>(steps);
  const timesS = new Array<number>(steps);

  let prevPowerMW = clamp(at(commandMW, 0), 0, mw);
  let surgeMarginMin = baseMargin;

  for (let k = 0; k < steps; k++) {
    const targetMW = clamp(at(commandMW, k), 0, mw);
    const powerMW = targetMW + (prevPowerMW - targetMW) * decay;

    // Spool-acceleration surrogate: rapid power changes swing the operating
    // line toward the surge line; the dip scales with normalized acceleration
    // (MW/s times the response constant, per MW rated) and recovers as the
    // spool settles.
    // Chained left-to-right so a denormal `mw` never materializes an Infinity
    // that a zero delta would multiply into NaN (0/denormal is a clean 0).
    const accelFraction =
      mw > 0 ? (Math.abs(powerMW - prevPowerMW) / timestepS / mw) * turbine.responseS : 0;
    const margin =
      mw > 0 ? baseMargin * Math.max(0, 1 - accelGain * Math.min(1, accelFraction)) : baseMargin;

    deliveredMW[k] = powerMW;
    surgeMargin[k] = margin;
    timesS[k] = (k + 1) * timestepS;
    if (margin < surgeMarginMin) {
      surgeMarginMin = margin;
    }
    prevPowerMW = powerMW;
  }

  return { horizonS: steps * timestepS, timestepS, deliveredMW, surgeMargin, surgeMarginMin };
}

/**
 * Reference dispatch of net demand across the SOFC and turbine, without
 * storage (the storage layer lands in D1 part 2 and sits upstream of this).
 * The SOFC takes what it can (must-run floor to rated), the turbine swings on
 * the residual; anything left is an unmet deficit (>0) and anything below the
 * must-run floor is dumped overgeneration (<0).
 */
export function allocateDemand(
  demandMW: readonly number[],
  sofc: SystemConfig["sofc"],
  turbine: SystemConfig["turbine"],
  timestepS: number,
): DemandAllocation {
  assertValidSofcParams(sofc);
  assertValidTurbineParams(turbine);
  assertValidCommandSeries(demandMW, timestepS);

  const minMW = sofc.minLoadFraction * sofc.mw;
  const steps = demandMW.length;
  const sofcCommandMW = new Array<number>(steps);
  const turbineCommandMW = new Array<number>(steps);
  const unmetMW = new Array<number>(steps);
  let unmetEnergyMJ = 0;

  for (let k = 0; k < steps; k++) {
    const demand = at(demandMW, k);
    const sofcCommand = clamp(demand, minMW, sofc.mw);
    const turbineCommand = clamp(demand - sofcCommand, 0, turbine.mw);
    const unmet = demand - sofcCommand - turbineCommand;
    sofcCommandMW[k] = sofcCommand;
    turbineCommandMW[k] = turbineCommand;
    unmetMW[k] = unmet;
    unmetEnergyMJ += unmet * timestepS;
  }

  return { sofcCommandMW, turbineCommandMW, unmetMW, unmetEnergyMWh: unmetEnergyMJ / 3600 };
}

/** Convenience runner: allocate net load, then run both thermal models. */
export function simulateThermal(
  system: Pick<SystemConfig, "sofc" | "turbine">,
  netLoadMW: readonly number[],
  timestepS: number,
  options: ThermalModelOptions = {},
): ThermalRunResult {
  assertValidSofcParams(system.sofc);
  assertValidTurbineParams(system.turbine);
  const allocation = allocateDemand(netLoadMW, system.sofc, system.turbine, timestepS);
  return {
    allocation,
    sofc: runSofcThermal(system.sofc, allocation.sofcCommandMW, timestepS, options.sofc),
    turbine: runTurbine(system.turbine, allocation.turbineCommandMW, timestepS, options.turbine),
  };
}
