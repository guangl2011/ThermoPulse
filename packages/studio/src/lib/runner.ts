/**
 * Simulation runner: the one place the studio composes the pure core.
 *
 * Timestep ordering per spec art_B7GK27w7 — (1) synthesize the net bus load,
 * (2) dispatch the SST + storage layer against it (the SOFC-GT never sees the
 * pulse when the buffer can cover it), (3) run both thermal models against
 * the storage-resolved command series, (4) score compliance and account
 * efficiency. The runner owns no physics — it maps form inputs into the core
 * contracts, calls the composition, and maps the typed result back to the
 * dashboard's view model.
 */
import {
  accountEfficiency,
  dispatchStorage,
  InputValidationError,
  runSofcThermal,
  runTurbine,
  scoreCompliance,
  synthesizeLoad,
} from "@thermopulse/core";
import type { LoadProfile, SimulationResult, SystemConfig, TimeSeries } from "@thermopulse/core";
import type { LoadProfileInput, ResultsView, SystemConfigInput, TemperatureSample } from "../types";

export class RunnerInputError extends Error {}

export interface StudioInputs {
  profile: LoadProfileInput;
  config: SystemConfigInput;
}

/**
 * Model parameters the MVP form does not expose. They are fixed assumptions,
 * not tuning knobs — every one appears in the exported system-spec document
 * so an assessment stays traceable to the model that produced it.
 */
export const FIXED_MODEL_ASSUMPTIONS = {
  /** SOFC bulk thermal time constant, s (core reference plant). */
  sofcThermalTimeConstantS: 900,
  /** Gas-turbine first-order spool response, s (core reference plant). */
  turbineResponseS: 8,
  /** Absorption chiller coefficient of performance. */
  absorptionChillerCOP: 0.7,
  /** Cascade heat-recovery return-water temperature, °C. */
  returnWaterC: 55,
  /** Checkpoint load-drop duration, s — millisecond scale per memo field data. */
  pulseRampDownS: 0.05,
  /** Hold at the reduced-load floor before recovery, s (core pulse default). */
  pulseHoldS: 30,
} as const;

/** Chart polyline budget: above this, the series is stride-decimated. */
const MAX_CHART_SAMPLES = 1200;

/** Map the load-profile form onto the core contract, synthesizing the pulses
 * the form describes as a count and depth. Pulses are spaced evenly across
 * the horizon and each is confined to its slot so they never overlap. */
export function toCoreLoadProfile(input: LoadProfileInput): LoadProfile {
  const spacingS = input.durationS / input.pulseCount;
  const rampDownS = Math.min(FIXED_MODEL_ASSUMPTIONS.pulseRampDownS, spacingS / 4);
  const rampUpS = rampDownS;
  const holdS = Math.max(
    Math.min(FIXED_MODEL_ASSUMPTIONS.pulseHoldS, spacingS - rampDownS - rampUpS),
    0,
  );
  const pulses = Array.from({ length: input.pulseCount }, (_, k) => ({
    startS: k * spacingS,
    rampDownS,
    depthFraction: input.pulseDepthFraction,
    durationS: holdS,
    rampUpS,
  }));
  return {
    name: input.name,
    nominalMW: input.nominalMW,
    pulses,
    durationS: input.durationS,
    timestepS: input.timestepS,
  };
}

/** Map the plant-configuration form onto the core contract, filling the
 * form-absent model parameters from FIXED_MODEL_ASSUMPTIONS. */
export function toCoreSystemConfig(input: SystemConfigInput): SystemConfig {
  return {
    sofc: {
      mw: input.sofcMW,
      minLoadFraction: input.sofcMinLoadFraction,
      thermalTimeConstantS: FIXED_MODEL_ASSUMPTIONS.sofcThermalTimeConstantS,
      maxRampMWPerS: input.sofcMaxRampMWPerS,
      tempBandC: [input.sofcTempBandC[0], input.sofcTempBandC[1]],
    },
    turbine: {
      mw: input.turbineMW,
      responseS: FIXED_MODEL_ASSUMPTIONS.turbineResponseS,
      surgeMarginFraction: input.turbineSurgeMarginFraction,
    },
    storage: {
      powerMW: input.storagePowerMW,
      energyKWh: input.storageEnergyKWh,
      technology: input.storageTechnology,
    },
    sst: { topology: input.sstTopology, efficiencyPct: input.sstEfficiencyPct },
    heatRecovery: {
      absorptionChillerCOP: FIXED_MODEL_ASSUMPTIONS.absorptionChillerCOP,
      returnWaterC: FIXED_MODEL_ASSUMPTIONS.returnWaterC,
    },
  };
}

/** Stride-decimate a full time series to the chart budget, keeping the first
 * and last samples so the horizon endpoints always render. */
export function decimateSeries(
  series: TimeSeries,
  maxSamples = MAX_CHART_SAMPLES,
): TemperatureSample[] {
  const n = series.timesS.length;
  const stride = Math.max(1, Math.ceil(n / maxSamples));
  const samples: TemperatureSample[] = [];
  for (let k = 0; k < n; k += stride) {
    samples.push({ timeS: series.timesS[k] as number, tempC: series.values[k] as number });
  }
  const last = n - 1;
  if (last >= 0 && last % stride !== 0) {
    samples.push({ timeS: series.timesS[last] as number, tempC: series.values[last] as number });
  }
  return samples;
}

/** Map a core SimulationResult onto the dashboard view model, decimating the
 * temperature series to chart size. */
export function toResultsView(
  result: SimulationResult,
  tempBandC: readonly [number, number],
): ResultsView {
  return {
    compliance: result.compliance,
    sofcTemperatureC: decimateSeries(result.sofcTemperatureC),
    tempBandC: [tempBandC[0], tempBandC[1]],
    surgeMarginMin: result.surgeMarginMin,
    storageEvents: result.storageEvents,
    electricalEfficiencyPct: result.electricalEfficiencyPct,
    thermalEfficiencyPct: result.thermalEfficiencyPct,
    combinedEfficiencyPct: result.combinedEfficiencyPct,
  };
}

/**
 * Run the full composition: net load → storage dispatch → thermal models →
 * scoring + efficiency accounting. Throws `RunnerInputError` (message is
 * actionable) for inputs the core rejects; the caller renders that, it does
 * not crash.
 */
export function runSimulation({ profile, config }: StudioInputs): ResultsView {
  let loadProfile: LoadProfile;
  let system: SystemConfig;
  try {
    loadProfile = toCoreLoadProfile(profile);
    system = toCoreSystemConfig(config);
  } catch (error) {
    // Unreachable at MVP fidelity — the mappers are pure field copies over
    // form-validated values — but a re-name here must never surface as a
    // RangeError deep in the engine.
    throw new RunnerInputError(error instanceof Error ? error.message : "Invalid studio input.", {
      cause: error,
    });
  }

  let coreResult: SimulationResult;
  try {
    const netLoad = synthesizeLoad(loadProfile);
    const storage = dispatchStorage(netLoad, system);
    const sofc = runSofcThermal(system.sofc, storage.sofcCommandMW, netLoad.timestepS);
    const turbine = runTurbine(system.turbine, storage.turbineCommandMW, netLoad.timestepS);
    const compliance = scoreCompliance(system, { thermal: sofc, turbine, storage });
    const efficiency = accountEfficiency(sofc, turbine, storage, system.heatRecovery);
    coreResult = {
      compliance,
      sofcTemperatureC: sofc.temperatureC,
      surgeMarginMin: turbine.surgeMarginMin,
      storageEvents: storage.storageEvents,
      electricalEfficiencyPct: efficiency.electricalEfficiencyPct,
      thermalEfficiencyPct: efficiency.thermalEfficiencyPct,
      combinedEfficiencyPct: efficiency.combinedEfficiencyPct,
    };
  } catch (error) {
    // The core's InputValidationError messages are written to be actionable —
    // surface them as user-facing input problems instead of crashing.
    if (error instanceof InputValidationError) {
      throw new RunnerInputError(error.message, { cause: error });
    }
    throw error;
  }
  return toResultsView(coreResult, system.sofc.tempBandC);
}
