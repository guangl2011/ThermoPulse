/**
 * View-model types for the studio UI.
 *
 * The studio is presentational: it renders these shapes and emits changes
 * upward, and owns no simulation logic. They mirror the input surface the
 * pure engine (`packages/core`) will expose; the runner wiring in D2 part 2
 * reconciles them with the core contract. Kept local so the UI builds with
 * no engine dependency, per the D2 part-1 boundary.
 */

export type ComplianceStatus = "PASS" | "MARGINAL" | "FAIL";
export type StorageTechnology = "ultracap" | "flywheel" | "lithium";
export type SstTopology = "ac-coupled" | "dc-coupled-800v";

export interface LoadProfileInput {
  name: string;
  /** Sustained AI campus load, MW. */
  nominalMW: number;
  /** Checkpoint / All-Reduce drop as a fraction of nominal load (0.30–0.70 per memo field data). */
  pulseDepthFraction: number;
  /** Number of load pulses across the simulated horizon. */
  pulseCount: number;
  /** Simulated horizon, seconds. */
  durationS: number;
  /** Integration timestep, seconds (0.001–1.0). */
  timestepS: number;
}

export interface SystemConfigInput {
  sofcMW: number;
  /** Minimum stable SOFC load as a fraction of sofcMW. */
  sofcMinLoadFraction: number;
  /** Fuel-flow ramp limit, MW/s — the thermal-inertia constraint the buffer protects. */
  sofcMaxRampMWPerS: number;
  /** [min, max] safe stack temperature, °C. */
  sofcTempBandC: [number, number];
  turbineMW: number;
  /** Compressor surge margin floor as a fraction. */
  turbineSurgeMarginFraction: number;
  storagePowerMW: number;
  storageEnergyKWh: number;
  storageTechnology: StorageTechnology;
  sstTopology: SstTopology;
  sstEfficiencyPct: number;
}

export interface TemperatureSample {
  timeS: number;
  tempC: number;
}

export interface StorageEventView {
  deficitMW: number;
  durationS: number;
}

export interface ComplianceView {
  thermalStress: ComplianceStatus;
  surge: ComplianceStatus;
  storageAdequacy: ComplianceStatus;
  overall: ComplianceStatus;
}

export interface ResultsView {
  compliance: ComplianceView;
  sofcTemperatureC: TemperatureSample[];
  tempBandC: [number, number];
  surgeMarginMin: number;
  storageEvents: StorageEventView[];
  electricalEfficiencyPct: number;
  thermalEfficiencyPct: number;
  combinedEfficiencyPct: number;
}
