import { describe, expect, it } from "vitest";
import type { LoadProfileInput, SystemConfigInput } from "../types";
import { getPreset } from "./presets";
import {
  decimateSeries,
  FIXED_MODEL_ASSUMPTIONS,
  RunnerInputError,
  runSimulation,
  toCoreLoadProfile,
  toCoreSystemConfig,
} from "./runner";

const TRAINING = getPreset("training-heavy");

function loadProfileInput(overrides: Partial<LoadProfileInput> = {}): LoadProfileInput {
  return { ...TRAINING.loadProfile, ...overrides };
}

function systemConfigInput(overrides: Partial<SystemConfigInput> = {}): SystemConfigInput {
  return { ...TRAINING.systemConfig, ...overrides };
}

describe("toCoreLoadProfile", () => {
  it("synthesizes one pulse per requested count, spread across the horizon", () => {
    const profile = toCoreLoadProfile(loadProfileInput({ pulseCount: 12, durationS: 3600 }));
    expect(profile.pulses).toHaveLength(12);
    expect(profile.pulses[0]?.startS).toBe(0);
    expect(profile.pulses[11]?.startS).toBeCloseTo(11 * 300, 6);
    // The last pulse starts before the horizon ends.
    expect(profile.pulses[11]?.startS).toBeLessThan(3600);
  });

  it("carries the form's depth, nominal load, horizon, and timestep", () => {
    const profile = toCoreLoadProfile(
      loadProfileInput({ nominalMW: 80, pulseDepthFraction: 0.7, timestepS: 0.1 }),
    );
    expect(profile.nominalMW).toBe(80);
    expect(profile.pulses.every((pulse) => pulse.depthFraction === 0.7)).toBe(true);
    expect(profile.durationS).toBe(3600);
    expect(profile.timestepS).toBe(0.1);
  });

  it("confines each pulse to its slot even at high pulse counts", () => {
    const profile = toCoreLoadProfile(loadProfileInput({ pulseCount: 200, durationS: 3600 }));
    const spacingS = 3600 / 200;
    for (const pulse of profile.pulses) {
      const rampS = pulse.rampDownS + (pulse.durationS ?? 0) + (pulse.rampUpS ?? 0);
      expect(rampS).toBeLessThanOrEqual(spacingS);
    }
  });

  it("keeps the millisecond-scale checkpoint drop", () => {
    const profile = toCoreLoadProfile(loadProfileInput());
    expect(profile.pulses[0]?.rampDownS).toBe(FIXED_MODEL_ASSUMPTIONS.pulseRampDownS);
  });
});

describe("toCoreSystemConfig", () => {
  it("maps every form field and fills the form-absent assumptions", () => {
    const config = toCoreSystemConfig(
      systemConfigInput({ sofcMW: 60, storageTechnology: "flywheel" }),
    );
    expect(config.sofc.mw).toBe(60);
    expect(config.sofc.thermalTimeConstantS).toBe(FIXED_MODEL_ASSUMPTIONS.sofcThermalTimeConstantS);
    expect(config.turbine.responseS).toBe(FIXED_MODEL_ASSUMPTIONS.turbineResponseS);
    expect(config.heatRecovery.absorptionChillerCOP).toBe(
      FIXED_MODEL_ASSUMPTIONS.absorptionChillerCOP,
    );
    expect(config.storage.technology).toBe("flywheel");
    expect(config.sofc.tempBandC).toEqual([600, 850]);
  });
});

describe("decimateSeries", () => {
  it("keeps every sample when the series is under the budget", () => {
    const samples = decimateSeries({ timesS: [0, 1, 2], values: [600, 610, 605] });
    expect(samples).toHaveLength(3);
  });

  it("caps at the budget and keeps both endpoints", () => {
    const n = 10_000;
    const timesS = Array.from({ length: n }, (_, k) => k);
    const values = Array.from({ length: n }, (_, k) => 600 + (k % 2));
    const samples = decimateSeries({ timesS, values }, 100);
    expect(samples.length).toBeLessThanOrEqual(101);
    expect(samples[0]?.timeS).toBe(0);
    expect(samples.at(-1)?.timeS).toBe(n - 1);
  });
});

describe("runSimulation", () => {
  it("produces a complete dashboard view for the training-heavy preset", () => {
    const view = runSimulation({ profile: TRAINING.loadProfile, config: TRAINING.systemConfig });
    expect(view.compliance.thermalStress).toBeDefined();
    expect(view.compliance.overall).toMatch(/PASS|MARGINAL|FAIL/);
    expect(view.sofcTemperatureC.length).toBeGreaterThan(1);
    expect(view.sofcTemperatureC.every((s) => Number.isFinite(s.tempC))).toBe(true);
    expect(Number.isFinite(view.surgeMarginMin)).toBe(true);
    expect(view.electricalEfficiencyPct).toBeGreaterThanOrEqual(0);
    expect(view.electricalEfficiencyPct).toBeLessThanOrEqual(100);
    expect(view.combinedEfficiencyPct).toBeGreaterThan(0);
    expect(view.tempBandC).toEqual([600, 850]);
  });

  it("buffers the stack: thermal stress PASS buffered, deficits smaller than unbuffered", () => {
    const buffered = runSimulation({
      profile: TRAINING.loadProfile,
      config: TRAINING.systemConfig,
    });
    // The buffer is sized below the 56 MW pulse recoveries, so shortfall
    // events exist — but it absorbs the transient the stack would feel.
    expect(buffered.compliance.thermalStress).toBe("PASS");
    const unbuffered = runSimulation({
      profile: TRAINING.loadProfile,
      config: systemConfigInput({ storagePowerMW: 0, storageEnergyKWh: 0 }),
    });
    expect(unbuffered.compliance.thermalStress).toBe("FAIL");
    expect(buffered.storageEvents.length).toBeGreaterThan(0);
    expect(buffered.storageEvents[0]?.deficitMW).toBeLessThan(
      unbuffered.storageEvents[0]?.deficitMW ?? Number.POSITIVE_INFINITY,
    );
  });

  it("treats a zero-storage configuration as the legal unbuffered baseline", () => {
    const view = runSimulation({
      profile: TRAINING.loadProfile,
      config: systemConfigInput({ storagePowerMW: 0, storageEnergyKWh: 0 }),
    });
    // Unbuffered, the millisecond pulses reach the thermal plant — the
    // scorecard must discriminate against the buffered run, never silently.
    expect(view.compliance.overall).not.toBe("PASS");
  });

  it("surfaces an oversubscribed plant as a storage shortfall, not a crash", () => {
    const view = runSimulation({
      profile: loadProfileInput({ nominalMW: 500 }),
      config: systemConfigInput({
        sofcMW: 100,
        turbineMW: 50,
        storagePowerMW: 0,
        storageEnergyKWh: 0,
      }),
    });
    expect(view.storageEvents.length).toBeGreaterThan(0);
    expect(view.compliance.overall).toBe("FAIL");
  });

  it("throws RunnerInputError with the core's actionable message on invalid input", () => {
    // NaN slips past nothing: the runner boundary turns it into an
    // actionable error, and the dashboard renders it — no crash.
    expect(() =>
      runSimulation({
        profile: loadProfileInput({ nominalMW: Number.NaN }),
        config: TRAINING.systemConfig,
      }),
    ).toThrow(RunnerInputError);
  });
});
