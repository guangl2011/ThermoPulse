/**
 * Boundary validation for the physics core. Every public entry point calls
 * these before computing; NaN, Infinity, and out-of-range values are rejected
 * with actionable messages instead of propagating through the numerics.
 */
import type {
  GpuPulse,
  LoadProfile,
  SofcModelOptions,
  SystemConfig,
  TurbineModelOptions,
} from "./types.js";
import { InputValidationError } from "./errors.js";

export const MIN_TIMESTEP_S = 0.001;
export const MAX_TIMESTEP_S = 1.0;
/** Sanity ceiling for campus-scale modeling (largest announced AIDC campuses). */
export const MAX_PLANT_MW = 10_000;
export const MAX_HORIZON_S = 7 * 24 * 3600;
/** Memory budget for synthesized per-step series (2M steps ≈ 16 MB per array). */
export const MAX_STEPS = 2_000_000;

/** Number of simulation steps a horizon/timestep pair resolves to. */
export function stepCount(durationS: number, timestepS: number): number {
  return Math.max(1, Math.ceil(durationS / timestepS - 1e-9));
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InputValidationError(
      field,
      `${field} must be a finite number, got ${String(value)}. Replace NaN/Infinity with a physical value before running the model.`,
    );
  }
  return value;
}

function requireRange(
  value: number,
  field: string,
  min: number,
  max: number,
  fix: string,
  bounds: { minExclusive?: boolean; maxInclusive?: boolean } = {},
): number {
  const minOk = bounds.minExclusive === true ? value > min : value >= min;
  const maxOk = bounds.maxInclusive === false ? value < max : value <= max;
  if (!minOk || !maxOk) {
    const low = bounds.minExclusive === true ? "(" : "[";
    const high = bounds.maxInclusive === false ? ")" : "]";
    throw new InputValidationError(
      field,
      `${field} must be in ${low}${min}, ${max}${high}, got ${value}. ${fix}`,
    );
  }
  return value;
}

export function assertValidLoadProfile(profile: LoadProfile): void {
  if (typeof profile?.name !== "string" || profile.name.trim() === "") {
    throw new InputValidationError(
      "name",
      "profile.name must be a non-empty string. Name the profile so assessment results can be traced to it.",
    );
  }
  requireRange(
    finite(profile.nominalMW, "nominalMW"),
    "nominalMW",
    0,
    MAX_PLANT_MW,
    "Set nominalMW to the sustained campus load in MW that pulses modulate.",
    { minExclusive: true },
  );
  const durationS = finite(profile.durationS, "durationS");
  requireRange(
    durationS,
    "durationS",
    0,
    MAX_HORIZON_S,
    "Set durationS to a simulated horizon between 0 and 7 days, in seconds.",
    { minExclusive: true },
  );
  requireRange(
    finite(profile.timestepS, "timestepS"),
    "timestepS",
    MIN_TIMESTEP_S,
    MAX_TIMESTEP_S,
    "Use an integration timestep between 0.001 s and 1.0 s.",
  );
  const steps = stepCount(durationS, profile.timestepS);
  if (steps > MAX_STEPS) {
    throw new InputValidationError(
      "timestepS",
      `The profile resolves to ${steps} steps (durationS / timestepS), above the ${MAX_STEPS}-step budget. Increase timestepS or shorten durationS.`,
    );
  }
  if (!Array.isArray(profile.pulses)) {
    throw new InputValidationError(
      "pulses",
      "pulses must be an array of GpuPulse objects (use [] for a steady profile with no transients).",
    );
  }
  profile.pulses.forEach((pulse, index) => assertValidPulse(pulse, index, durationS));
}

function assertValidPulse(pulse: GpuPulse, index: number, durationS: number): void {
  const field = (name: string): string => `pulses[${index}].${name}`;
  const startS = finite(pulse?.startS, field("startS"));
  if (startS < 0 || startS >= durationS) {
    throw new InputValidationError(
      field("startS"),
      `pulses[${index}].startS must be within [0, durationS), got ${startS} with durationS ${durationS}. Move the pulse earlier or extend durationS.`,
    );
  }
  requireRange(
    finite(pulse?.rampDownS, field("rampDownS")),
    field("rampDownS"),
    0,
    durationS,
    "Set rampDownS to the load-drop duration in seconds (field data: milliseconds).",
    { minExclusive: true },
  );
  requireRange(
    finite(pulse?.depthFraction, field("depthFraction")),
    field("depthFraction"),
    0,
    1,
    "Set depthFraction to the fraction of nominal load shed at the pulse floor (field data: 0.30-0.70).",
    { minExclusive: true },
  );
  if (pulse?.durationS !== undefined) {
    requireRange(
      finite(pulse.durationS, field("durationS")),
      field("durationS"),
      0,
      MAX_HORIZON_S,
      "Set the pulse hold duration in seconds (default 30 s).",
    );
  }
  if (pulse?.rampUpS !== undefined) {
    requireRange(
      finite(pulse.rampUpS, field("rampUpS")),
      field("rampUpS"),
      0,
      MAX_HORIZON_S,
      "Set the recovery ramp duration in seconds (default: same as rampDownS).",
      { minExclusive: true },
    );
  }
}

export function assertValidSofcParams(sofc: SystemConfig["sofc"]): void {
  requireRange(
    finite(sofc?.mw, "sofc.mw"),
    "sofc.mw",
    0,
    MAX_PLANT_MW,
    "Set sofc.mw to the fuel-cell rated electrical output in MW.",
    { minExclusive: true },
  );
  requireRange(
    finite(sofc?.minLoadFraction, "sofc.minLoadFraction"),
    "sofc.minLoadFraction",
    0,
    1,
    "Set minLoadFraction to the fraction of rated output below which the stack cannot operate (0 < f < 1).",
    { minExclusive: true, maxInclusive: false },
  );
  requireRange(
    finite(sofc?.thermalTimeConstantS, "sofc.thermalTimeConstantS"),
    "sofc.thermalTimeConstantS",
    0,
    1e6,
    "Set thermalTimeConstantS to the stack bulk thermal time constant in seconds.",
    { minExclusive: true },
  );
  requireRange(
    finite(sofc?.maxRampMWPerS, "sofc.maxRampMWPerS"),
    "sofc.maxRampMWPerS",
    0,
    MAX_PLANT_MW,
    "Set maxRampMWPerS to the fuel-system ramp limit in MW per second.",
    { minExclusive: true },
  );
  const band = sofc?.tempBandC;
  if (!Array.isArray(band) || band.length !== 2) {
    throw new InputValidationError(
      "sofc.tempBandC",
      "sofc.tempBandC must be a [low, high] pair in °C — the survivable stack temperature envelope.",
    );
  }
  const low = finite(band[0], "sofc.tempBandC[0]");
  const high = finite(band[1], "sofc.tempBandC[1]");
  requireRange(
    low,
    "sofc.tempBandC[0]",
    -273.15,
    3000,
    "The band low must be a physical stack temperature in °C.",
  );
  requireRange(
    high,
    "sofc.tempBandC[1]",
    -273.15,
    3000,
    "The band high must be a physical stack temperature in °C.",
  );
  if (high <= low) {
    throw new InputValidationError(
      "sofc.tempBandC",
      `sofc.tempBandC must be ordered [low, high] with high > low, got [${low}, ${high}].`,
    );
  }
}

export function assertValidTurbineParams(turbine: SystemConfig["turbine"]): void {
  requireRange(
    finite(turbine?.mw, "turbine.mw"),
    "turbine.mw",
    0,
    MAX_PLANT_MW,
    "Set turbine.mw to the gas-turbine rated output in MW (0 models a turbine-less architecture).",
  );
  requireRange(
    finite(turbine?.responseS, "turbine.responseS"),
    "turbine.responseS",
    0,
    10_000,
    "Set responseS to the turbine first-order response time in seconds.",
    { minExclusive: true },
  );
  requireRange(
    finite(turbine?.surgeMarginFraction, "turbine.surgeMarginFraction"),
    "turbine.surgeMarginFraction",
    0,
    1,
    "Set surgeMarginFraction to the nominal compressor surge margin as a fraction (0 < m <= 1).",
    { minExclusive: true },
  );
}

export function assertValidSystemConfig(config: SystemConfig): void {
  assertValidSofcParams(config?.sofc);
  assertValidTurbineParams(config?.turbine);
  // Zero-power/zero-energy storage is legal: it is the unbuffered baseline.
  requireRange(
    finite(config?.storage?.powerMW, "storage.powerMW"),
    "storage.powerMW",
    0,
    MAX_PLANT_MW,
    "Set storage.powerMW to the buffer power limit in MW (0 models an unbuffered plant).",
  );
  requireRange(
    finite(config?.storage?.energyKWh, "storage.energyKWh"),
    "storage.energyKWh",
    0,
    1e9,
    "Set storage.energyKWh to the buffer energy capacity in kWh (0 models an unbuffered plant).",
  );
  const technology = config?.storage?.technology;
  if (technology !== "ultracap" && technology !== "flywheel" && technology !== "lithium") {
    throw new InputValidationError(
      "storage.technology",
      `storage.technology must be "ultracap", "flywheel", or "lithium", got ${String(technology)}.`,
    );
  }
  const topology = config?.sst?.topology;
  if (topology !== "ac-coupled" && topology !== "dc-coupled-800v") {
    throw new InputValidationError(
      "sst.topology",
      `sst.topology must be "ac-coupled" or "dc-coupled-800v", got ${String(topology)}.`,
    );
  }
  requireRange(
    finite(config?.sst?.efficiencyPct, "sst.efficiencyPct"),
    "sst.efficiencyPct",
    0,
    100,
    "Set sst.efficiencyPct to the solid-state transformer efficiency in percent.",
    { minExclusive: true },
  );
  requireRange(
    finite(config?.heatRecovery?.absorptionChillerCOP, "heatRecovery.absorptionChillerCOP"),
    "heatRecovery.absorptionChillerCOP",
    0,
    10,
    "Set absorptionChillerCOP to the absorption-chiller coefficient of performance.",
    { minExclusive: true },
  );
  requireRange(
    finite(config?.heatRecovery?.returnWaterC, "heatRecovery.returnWaterC"),
    "heatRecovery.returnWaterC",
    0,
    500,
    "Set returnWaterC to the cascade return-water temperature in °C.",
  );
}

export function assertValidSofcOptions(options: SofcModelOptions): void {
  if (options.stressGainKPerUnit !== undefined) {
    requireRange(
      finite(options.stressGainKPerUnit, "stressGainKPerUnit"),
      "stressGainKPerUnit",
      0,
      1e5,
      "The gradient-stress gain must be a positive number of °C per unit tracking error.",
      { minExclusive: true },
    );
  }
  if (options.stressTimeConstantS !== undefined) {
    requireRange(
      finite(options.stressTimeConstantS, "stressTimeConstantS"),
      "stressTimeConstantS",
      0,
      3600,
      "The gradient-stress time constant must be a positive number of seconds.",
      { minExclusive: true },
    );
  }
  if (options.electricalEfficiency !== undefined) {
    requireRange(
      finite(options.electricalEfficiency, "electricalEfficiency"),
      "electricalEfficiency",
      0,
      1,
      "Set electricalEfficiency to a stack efficiency fraction in (0, 1).",
      { minExclusive: true },
    );
  }
}

export function assertValidTurbineOptions(options: TurbineModelOptions): void {
  if (options.surgeAccelGain !== undefined) {
    requireRange(
      finite(options.surgeAccelGain, "surgeAccelGain"),
      "surgeAccelGain",
      0,
      1,
      "Set surgeAccelGain to a fraction in (0, 1] of the base margin consumed at full-rated acceleration.",
      { minExclusive: true },
    );
  }
}

/** Demand/command series handed to the thermal models: finite values, valid timestep. */
export function assertValidCommandSeries(commandMW: readonly number[], timestepS: number): void {
  requireRange(
    finite(timestepS, "timestepS"),
    "timestepS",
    MIN_TIMESTEP_S,
    MAX_TIMESTEP_S,
    "Use an integration timestep between 0.001 s and 1.0 s.",
  );
  if (!Array.isArray(commandMW) || commandMW.length === 0) {
    throw new InputValidationError(
      "commandMW",
      "commandMW must be a non-empty array of per-step demand values in MW.",
    );
  }
  if (commandMW.length > MAX_STEPS) {
    throw new InputValidationError(
      "commandMW",
      `The command series has ${commandMW.length} steps, above the ${MAX_STEPS}-step budget. Increase timestepS or shorten the horizon.`,
    );
  }
  commandMW.forEach((value, index) => finite(value, `commandMW[${index}]`));
}
