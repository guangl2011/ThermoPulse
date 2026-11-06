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
