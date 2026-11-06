/**
 * Data contracts shared by every layer of the simulation engine (spec
 * art_B7GK27w7). Config flows one way into the pure core; results flow back
 * as typed scorecards the UI only renders. No I/O, no UI imports.
 */

/**
 * One GPU-cluster transient: a load drop (the hazard), a hold at the reduced
 * floor, and a recovery ramp. The spec pins the three required fields; the
 * hold and recovery are optional with documented defaults because a transient
 * that never recovers cannot be scored as a pulse.
 */
export interface GpuPulse {
  /** Horizon time (s) at which the transient begins. */
  startS: number;
  /** Duration of the load drop (s). Millisecond-scale drops are the hazard. */
  rampDownS: number;
  /** Fraction of nominal load shed at the pulse floor (0.30-0.70 per memo field data). */
  depthFraction: number;
  /**
   * Time spent at the reduced-load floor before recovery begins (s).
   * Defaults to 30 s when omitted.
   */
  durationS?: number;
  /**
   * Duration of the recovery ramp back to nominal load (s).
   * Defaults to the same value as `rampDownS` when omitted.
   */
  rampUpS?: number;
}

export interface LoadProfile {
  name: string;
  /** Sustained AI campus load (MW) that the pulses modulate. */
  nominalMW: number;
  /** Checkpoint / All-Reduce transients over the horizon. */
  pulses: GpuPulse[];
  /** Simulated horizon (s). */
  durationS: number;
  /** Integration timestep (s), 0.001-1.0; adaptive below 0.1. */
  timestepS: number;
}

export type StorageTechnology = "ultracap" | "flywheel" | "lithium";
export type SstTopology = "ac-coupled" | "dc-coupled-800v";

export interface SystemConfig {
  sofc: {
    mw: number;
    minLoadFraction: number;
    thermalTimeConstantS: number;
    maxRampMWPerS: number;
    /** Survivable stack temperature envelope [low, high] in °C. */
    tempBandC: [number, number];
  };
  turbine: {
    mw: number;
    responseS: number;
    surgeMarginFraction: number;
  };
  storage: {
    powerMW: number;
    energyKWh: number;
    technology: StorageTechnology;
  };
  sst: {
    topology: SstTopology;
    efficiencyPct: number;
  };
  heatRecovery: {
    absorptionChillerCOP: number;
    returnWaterC: number;
  };
}

/** Uniform-sample time series; `values[k]` aligns with `timesS[k]`. */
export interface TimeSeries {
  timesS: number[];
  values: number[];
}

export interface StorageEvent {
  /** Mean unmet power across the event (MW). */
  deficitMW: number;
  durationS: number;
}

export type Verdict = "PASS" | "MARGINAL" | "FAIL";

export interface ComplianceScore {
  thermalStress: Verdict;
  surge: Verdict;
  storageAdequacy: Verdict;
  /** Worst of the three criteria. */
  overall: Verdict;
}

/** The full-run result the simulation runner (deliverable D1 part 2) produces. */
export interface SimulationResult {
  compliance: ComplianceScore;
  sofcTemperatureC: TimeSeries;
  surgeMarginMin: number;
  storageEvents: StorageEvent[];
  electricalEfficiencyPct: number;
  thermalEfficiencyPct: number;
  combinedEfficiencyPct: number;
}

// ---------------------------------------------------------------------------
// Part-1 physics results (pulse synthesis + SOFC-GT thermal model)
// ---------------------------------------------------------------------------

/** Net bus load synthesized from a `LoadProfile`: per-step averages, exact energy. */
export interface PulseSeries {
  /** Nominal timestep (s); the final step may be shorter to end at the horizon. */
  timestepS: number;
  horizonS: number;
  nominalMW: number;
  /** Average bus load over step k (MW); step k covers [k*dt, (k+1)*dt). */
  powerMW: number[];
  /** Exact integral of power over the horizon (MWh). */
  energyMWh: number;
}

export interface ThermalExcursion {
  startS: number;
  endS: number;
  /** Peak distance beyond the band edge (°C, positive); direction in `side`. */
  peakDeviationC: number;
  /**
   * "under" exists for contract completeness; at MVP fidelity the gradient
   * -stress surrogate only produces over-temperature excursions.
   */
  side: "over" | "under";
}

export interface SofcThermalResult {
  horizonS: number;
  timestepS: number;
  /** Ramp-limited electrical output at each step end (MW). */
  deliveredMW: number[];
  /** Fast transient gradient deviation added to the bulk temperature (°C). */
  stressDeviationC: number[];
  /** Bulk + gradient-stress stack temperature at step ends. */
  temperatureC: TimeSeries;
  excursions: ThermalExcursion[];
  minTemperatureC: number;
  maxTemperatureC: number;
  fuelEnergyMWh: number;
  electricalEnergyMWh: number;
  rejectedHeatMWh: number;
  /** Bulk thermal energy retained over the horizon (MWh); closes the fuel book. */
  storedHeatDeltaMWh: number;
  /** |(fuel - electric) - (stored + rejected)| / fuel * 100 over the horizon. */
  energyClosureErrorPct: number;
}

export interface TurbineResult {
  horizonS: number;
  timestepS: number;
  deliveredMW: number[];
  /** Instantaneous compressor surge margin (fraction of the surge line, 0-1). */
  surgeMargin: number[];
  surgeMarginMin: number;
}

/** Reference dispatch of net demand across the SOFC and turbine (no storage). */
export interface DemandAllocation {
  sofcCommandMW: number[];
  turbineCommandMW: number[];
  /**
   * demand - sofc - turbine per step: positive is an unmet deficit (storage's
   * job in part 2), negative is must-run overgeneration dumped.
   */
  unmetMW: number[];
  unmetEnergyMWh: number;
}

export interface SofcModelOptions {
  /** °C of gradient deviation per unit (fraction-of-rated) tracking error. */
  stressGainKPerUnit?: number;
  /** Relaxation time of the gradient-stress channel (s); default derived from thermalTimeConstantS. */
  stressTimeConstantS?: number;
  /** Stack electrical efficiency (LHV fraction), constant at MVP fidelity. */
  electricalEfficiency?: number;
}

export interface TurbineModelOptions {
  /** Fraction of the base surge margin consumed by a full-rated spool acceleration. */
  surgeAccelGain?: number;
}

export interface ThermalModelOptions {
  sofc?: SofcModelOptions;
  turbine?: TurbineModelOptions;
}

export interface ThermalRunResult {
  allocation: DemandAllocation;
  sofc: SofcThermalResult;
  turbine: TurbineResult;
}

// ---------------------------------------------------------------------------
// Part-2 physics results (storage buffering dispatch)
// ---------------------------------------------------------------------------

export interface StorageDispatchOptions {
  /**
   * Device-side state of charge at horizon start as a fraction of
   * `storage.energyKWh`, in (0, 1]. Defaults to 1 (fully charged buffer).
   */
  initialSoCFraction?: number;
}

export interface StorageDispatchResult {
  timestepS: number;
  horizonS: number;
  /**
   * Bus-side buffer power at each step: positive is discharge (the buffer
   * serves the bus), negative is charge (surplus generation banks in the
   * buffer). Bounded by `storage.powerMW` in both directions.
   */
  storagePowerMW: number[];
  /** Device-side energy state at step ends (kWh), inside [0, energyKWh]. */
  energyKWh: TimeSeries;
  /**
   * Effective per-resource command series the thermal models run against.
   * With a healthy buffer these follow the plant's capability envelope (the
   * SOFC-GT never sees the pulse); uncovered deficits propagate on top.
   */
  sofcCommandMW: number[];
  turbineCommandMW: number[];
  /**
   * Bus deficit left after generation and storage assist (MW, >= 0). Nonzero
   * only when the buffer itself is power- or energy-limited: shortfalls are
   * recorded, never silently clamped away.
   */
  unmetMW: number[];
  unmetEnergyMWh: number;
  /** Contiguous deficit episodes over the horizon. */
  storageEvents: StorageEvent[];
  /** True when sofc.mw + turbine.mw < nominalMW: the plant cannot serve sustained load. */
  oversubscribed: boolean;
  /** Bus-side energy the buffer delivered to the bus over the horizon (MWh). */
  dischargedEnergyMWh: number;
  /** Bus-side surplus energy banked into the buffer over the horizon (MWh). */
  chargedEnergyMWh: number;
  /** Surplus generation neither the bus nor the buffer could absorb (MWh). */
  spilledEnergyMWh: number;
}
