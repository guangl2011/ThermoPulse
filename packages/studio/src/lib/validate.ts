import type { LoadProfileInput, SystemConfigInput } from "../types";

/** Field-keyed validation messages. An empty record means the input is valid. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const PULSE_DEPTH_RANGE: [number, number] = [0.3, 0.7];
const TIMESTEP_RANGE: [number, number] = [0.001, 1.0];

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

/** Validate the load-profile form. Returns one actionable message per invalid field. */
export function validateLoadProfile(profile: LoadProfileInput): FieldErrors<LoadProfileInput> {
  const errors: FieldErrors<LoadProfileInput> = {};
  if (profile.name.trim() === "") {
    errors.name = "Enter a profile name.";
  }
  if (!isFiniteNumber(profile.nominalMW) || profile.nominalMW <= 0) {
    errors.nominalMW = "Nominal load must be a number greater than 0 MW.";
  }
  if (
    !isFiniteNumber(profile.pulseDepthFraction) ||
    profile.pulseDepthFraction < PULSE_DEPTH_RANGE[0] ||
    profile.pulseDepthFraction > PULSE_DEPTH_RANGE[1]
  ) {
    errors.pulseDepthFraction = `Pulse depth must be between ${PULSE_DEPTH_RANGE[0]} and ${PULSE_DEPTH_RANGE[1]} of nominal load.`;
  }
  if (
    !isFiniteNumber(profile.pulseCount) ||
    !Number.isInteger(profile.pulseCount) ||
    profile.pulseCount < 1
  ) {
    errors.pulseCount = "Pulse count must be a whole number of 1 or more.";
  }
  if (!isFiniteNumber(profile.durationS) || profile.durationS <= 0) {
    errors.durationS = "Duration must be a number greater than 0 seconds.";
  }
  if (
    !isFiniteNumber(profile.timestepS) ||
    profile.timestepS < TIMESTEP_RANGE[0] ||
    profile.timestepS > TIMESTEP_RANGE[1]
  ) {
    errors.timestepS = `Timestep must be between ${TIMESTEP_RANGE[0]} and ${TIMESTEP_RANGE[1]} seconds.`;
  }
  return errors;
}

/** Validate the system-configuration form. A fully zeroed storage pair is the
 * legal unbuffered baseline; a half-specified pair is a mistake, not a baseline. */
export function validateSystemConfig(config: SystemConfigInput): FieldErrors<SystemConfigInput> {
  const errors: FieldErrors<SystemConfigInput> = {};
  if (!isFiniteNumber(config.sofcMW) || config.sofcMW <= 0) {
    errors.sofcMW = "SOFC capacity must be a number greater than 0 MW.";
  }
  if (
    !isFiniteNumber(config.sofcMinLoadFraction) ||
    config.sofcMinLoadFraction < 0 ||
    config.sofcMinLoadFraction > 1
  ) {
    errors.sofcMinLoadFraction = "Minimum SOFC load must be between 0 and 1.";
  }
  if (!isFiniteNumber(config.sofcMaxRampMWPerS) || config.sofcMaxRampMWPerS <= 0) {
    errors.sofcMaxRampMWPerS = "SOFC ramp limit must be a number greater than 0 MW/s.";
  }
  const [bandMin, bandMax] = config.sofcTempBandC;
  if (
    !isFiniteNumber(bandMin) ||
    !isFiniteNumber(bandMax) ||
    bandMin < 0 ||
    bandMin >= bandMax ||
    bandMax > 1500
  ) {
    errors.sofcTempBandC = "Temperature band must be 0–1500 °C with min below max.";
  }
  if (!isFiniteNumber(config.turbineMW) || config.turbineMW < 0) {
    errors.turbineMW = "Turbine capacity must be a number of 0 MW or more.";
  }
  if (
    !isFiniteNumber(config.turbineSurgeMarginFraction) ||
    config.turbineSurgeMarginFraction < 0 ||
    config.turbineSurgeMarginFraction > 1
  ) {
    errors.turbineSurgeMarginFraction = "Surge margin must be between 0 and 1.";
  }
  const zeroPower = config.storagePowerMW === 0;
  const zeroEnergy = config.storageEnergyKWh === 0;
  if (
    !isFiniteNumber(config.storagePowerMW) ||
    config.storagePowerMW < 0 ||
    !isFiniteNumber(config.storageEnergyKWh) ||
    config.storageEnergyKWh < 0
  ) {
    errors.storagePowerMW = "Storage power and energy must be numbers of 0 or more.";
  } else if (zeroPower !== zeroEnergy) {
    errors.storagePowerMW =
      "Set both storage power and energy, or leave both at 0 for an unbuffered baseline.";
  }
  if (
    !isFiniteNumber(config.sstEfficiencyPct) ||
    config.sstEfficiencyPct <= 0 ||
    config.sstEfficiencyPct >= 100
  ) {
    errors.sstEfficiencyPct = "SST efficiency must be between 0 and 100 percent.";
  }
  return errors;
}
