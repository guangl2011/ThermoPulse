import { dispatchStorage } from "./buffer.js";
import { runSofcThermal, runTurbine } from "./thermal.js";
import type {
  PulseSeries,
  SofcThermalResult,
  StorageDispatchResult,
  SystemConfig,
  TurbineResult,
} from "./types.js";

/**
 * Shared result fixtures for scorer/accounting tests. Complete typed results —
 * never partial objects behind `as` casts — so tests stay honest about the
 * real shapes.
 */

/** The reference 90 MW plant used across core tests. */
export function referenceSystem(): SystemConfig {
  return {
    sofc: {
      mw: 60,
      minLoadFraction: 0.3,
      thermalTimeConstantS: 900,
      maxRampMWPerS: 1,
      tempBandC: [550, 750],
    },
    turbine: { mw: 60, responseS: 8, surgeMarginFraction: 0.2 },
    storage: { powerMW: 70, energyKWh: 2000, technology: "ultracap" },
    sst: { topology: "dc-coupled-800v", efficiencyPct: 97 },
    heatRecovery: { absorptionChillerCOP: 0.7, returnWaterC: 55 },
  };
}

/** A complete, physically-quiet SofcThermalResult; overrides replace fields wholesale. */
export function thermalResult(overrides: Partial<SofcThermalResult> = {}): SofcThermalResult {
  return {
    horizonS: 600,
    timestepS: 1,
    deliveredMW: new Array<number>(600).fill(60),
    stressDeviationC: new Array<number>(600).fill(0),
    temperatureC: {
      timesS: new Array<number>(600).fill(0),
      values: new Array<number>(600).fill(650),
    },
    excursions: [],
    minTemperatureC: 650,
    maxTemperatureC: 650,
    fuelEnergyMWh: 10,
    electricalEnergyMWh: 5,
    rejectedHeatMWh: 4.5,
    storedHeatDeltaMWh: 0.5,
    energyClosureErrorPct: 0,
    ...overrides,
  };
}

/** A complete TurbineResult parked at the full design margin. */
export function healthyTurbine(): TurbineResult {
  return {
    horizonS: 600,
    timestepS: 1,
    deliveredMW: new Array<number>(600).fill(30),
    surgeMargin: new Array<number>(600).fill(0.2),
    surgeMarginMin: 0.2,
  };
}

/** A complete StorageDispatchResult that sat idle at full charge. */
export function healthyStorage(): StorageDispatchResult {
  const system = referenceSystem();
  return {
    timestepS: 1,
    horizonS: 600,
    storagePowerMW: new Array<number>(600).fill(0),
    energyKWh: {
      timesS: new Array<number>(600).fill(0),
      values: new Array<number>(600).fill(system.storage.energyKWh),
    },
    sofcCommandMW: new Array<number>(600).fill(60),
    turbineCommandMW: new Array<number>(600).fill(30),
    unmetMW: new Array<number>(600).fill(0),
    unmetEnergyMWh: 0,
    storageEvents: [],
    oversubscribed: false,
    dischargedEnergyMWh: 0,
    chargedEnergyMWh: 0,
    spilledEnergyMWh: 0,
  };
}

/** Composed pipeline: buffer dispatch, then both thermal models on the effective commands. */
export function compose(
  cfg: SystemConfig,
  load: PulseSeries,
  options: { initialSoCFraction?: number } = {},
): { storage: StorageDispatchResult; thermal: SofcThermalResult; turbine: TurbineResult } {
  const storage = dispatchStorage(load, cfg, options);
  const thermal = runSofcThermal(cfg.sofc, storage.sofcCommandMW, load.timestepS);
  const turbine = runTurbine(cfg.turbine, storage.turbineCommandMW, load.timestepS);
  return { storage, thermal, turbine };
}
