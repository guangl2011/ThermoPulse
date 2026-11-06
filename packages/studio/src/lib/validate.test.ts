import { describe, expect, it } from "vitest";
import type { LoadProfileInput, SystemConfigInput } from "../types";
import { validateLoadProfile, validateSystemConfig } from "./validate";

const VALID_PROFILE: LoadProfileInput = {
  name: "Training-heavy",
  nominalMW: 80,
  pulseDepthFraction: 0.7,
  pulseCount: 12,
  durationS: 3600,
  timestepS: 0.1,
};

const VALID_CONFIG: SystemConfigInput = {
  sofcMW: 60,
  sofcMinLoadFraction: 0.4,
  sofcMaxRampMWPerS: 0.5,
  sofcTempBandC: [600, 850],
  turbineMW: 20,
  turbineSurgeMarginFraction: 0.1,
  storagePowerMW: 40,
  storageEnergyKWh: 120,
  storageTechnology: "ultracap",
  sstTopology: "dc-coupled-800v",
  sstEfficiencyPct: 97,
};

describe("validateLoadProfile", () => {
  it("accepts the reference preset profile", () => {
    expect(validateLoadProfile(VALID_PROFILE)).toEqual({});
  });

  it("rejects non-positive nominal load", () => {
    const errors = validateLoadProfile({ ...VALID_PROFILE, nominalMW: 0 });
    expect(errors.nominalMW).toMatch(/greater than 0/);
  });

  it("rejects pulse depth outside 0.30–0.70", () => {
    expect(
      validateLoadProfile({ ...VALID_PROFILE, pulseDepthFraction: 0.9 }).pulseDepthFraction,
    ).toBeDefined();
  });

  it("rejects non-integer pulse counts", () => {
    expect(validateLoadProfile({ ...VALID_PROFILE, pulseCount: 2.5 }).pulseCount).toBeDefined();
  });

  it("rejects timesteps outside 0.001–1.0 s", () => {
    expect(validateLoadProfile({ ...VALID_PROFILE, timestepS: 2 }).timestepS).toBeDefined();
    expect(validateLoadProfile({ ...VALID_PROFILE, timestepS: 0.0005 }).timestepS).toBeDefined();
  });

  it("reports NaN as an error rather than passing it through", () => {
    const errors = validateLoadProfile({ ...VALID_PROFILE, nominalMW: Number.NaN });
    expect(errors.nominalMW).toMatch(/number/);
  });
});

describe("validateSystemConfig", () => {
  it("accepts the reference preset config", () => {
    expect(validateSystemConfig(VALID_CONFIG)).toEqual({});
  });

  it("rejects non-positive SOFC capacity", () => {
    expect(validateSystemConfig({ ...VALID_CONFIG, sofcMW: -5 }).sofcMW).toBeDefined();
  });

  it("rejects an inverted temperature band", () => {
    expect(
      validateSystemConfig({ ...VALID_CONFIG, sofcTempBandC: [850, 600] }).sofcTempBandC,
    ).toBeDefined();
  });

  it("accepts a fully zeroed storage pair as the unbuffered baseline", () => {
    const config = { ...VALID_CONFIG, storagePowerMW: 0, storageEnergyKWh: 0 };
    expect(validateSystemConfig(config)).toEqual({});
  });

  it("rejects a half-specified storage pair", () => {
    const errors = validateSystemConfig({
      ...VALID_CONFIG,
      storagePowerMW: 40,
      storageEnergyKWh: 0,
    });
    expect(errors.storagePowerMW).toMatch(/both/i);
  });

  it("rejects SST efficiency outside (0, 100)", () => {
    expect(
      validateSystemConfig({ ...VALID_CONFIG, sstEfficiencyPct: 100 }).sstEfficiencyPct,
    ).toBeDefined();
  });

  it("reports NaN turbine capacity as an error", () => {
    expect(validateSystemConfig({ ...VALID_CONFIG, turbineMW: Number.NaN }).turbineMW).toMatch(
      /number/,
    );
  });
});
