/**
 * @thermopulse/core — pure physics engine for ThermoPulse-AI.
 * No I/O and no UI dependencies: every export is a pure function or a type.
 */

export { clamp, at } from "./math.js";
export { InputValidationError } from "./errors.js";
export {
  assertValidCommandSeries,
  assertValidLoadProfile,
  assertValidSofcOptions,
  assertValidSofcParams,
  assertValidSystemConfig,
  assertValidTurbineOptions,
  assertValidTurbineParams,
  stepCount,
  MAX_HORIZON_S,
  MAX_PLANT_MW,
  MAX_STEPS,
  MAX_TIMESTEP_S,
  MIN_TIMESTEP_S,
} from "./validate.js";
export { synthesizeLoad } from "./pulse.js";
export { allocateDemand, runSofcThermal, runTurbine, simulateThermal } from "./thermal.js";
export { DEFICIT_EPSILON_MW, dispatchStorage } from "./buffer.js";
export {
  DEFAULT_STORAGE_MARGINAL_SOC_FRACTION,
  DEFAULT_SURGE_FAIL_FRACTION,
  DEFAULT_SURGE_MARGINAL_FRACTION,
  DEFAULT_THERMAL_MARGINAL_DEVIATION_C,
  UNMET_ENERGY_EPSILON_MWH,
  scoreCompliance,
  scoreStorageAdequacy,
  scoreSurge,
  scoreThermalStress,
  worstVerdict,
} from "./scoring.js";
export type { ComplianceInput, ScoringThresholds } from "./scoring.js";
export type {
  ComplianceScore,
  DemandAllocation,
  GpuPulse,
  LoadProfile,
  PulseSeries,
  SimulationResult,
  SofcModelOptions,
  SofcThermalResult,
  SstTopology,
  StorageDispatchOptions,
  StorageDispatchResult,
  StorageEvent,
  StorageTechnology,
  SystemConfig,
  ThermalExcursion,
  ThermalModelOptions,
  ThermalRunResult,
  TimeSeries,
  TurbineModelOptions,
  TurbineResult,
  Verdict,
} from "./types.js";
