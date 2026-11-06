import { describe, expect, it } from "vitest";
import {
  assertValidCommandSeries,
  assertValidLoadProfile,
  assertValidSystemConfig,
  InputValidationError,
} from "./index.js";
import type { LoadProfile, SstTopology, StorageTechnology, SystemConfig } from "./types.js";

const validProfile: LoadProfile = {
  name: "reference",
  nominalMW: 100,
  durationS: 120,
  timestepS: 0.5,
  pulses: [{ startS: 10, rampDownS: 0.005, depthFraction: 0.4, durationS: 30, rampUpS: 20 }],
};

const validConfig: SystemConfig = {
  sofc: {
    mw: 10,
    minLoadFraction: 0.3,
    thermalTimeConstantS: 300,
    maxRampMWPerS: 0.05,
    tempBandC: [650, 800],
  },
  turbine: { mw: 5, responseS: 8, surgeMarginFraction: 0.15 },
  storage: { powerMW: 20, energyKWh: 80_000, technology: "lithium" },
  sst: { topology: "dc-coupled-800v", efficiencyPct: 98.5 },
  heatRecovery: { absorptionChillerCOP: 1.2, returnWaterC: 55 },
};

/** Assert the run throws InputValidationError and its message names the field. */
function expectFieldError(run: () => void, field: string): void {
  expect(run).toThrow(InputValidationError);
  expect(run).toThrow(new RegExp(field.replace(/[.[\]]/g, "\\$&")));
}

describe("assertValidLoadProfile", () => {
  it("accepts a valid profile", () => {
    expect(() => assertValidLoadProfile(validProfile)).not.toThrow();
  });

  it("rejects NaN, negative, and oversized nominal load", () => {
    expectFieldError(
      () => assertValidLoadProfile({ ...validProfile, nominalMW: Number.NaN }),
      "nominalMW",
    );
    expectFieldError(() => assertValidLoadProfile({ ...validProfile, nominalMW: -5 }), "nominalMW");
    expectFieldError(
      () => assertValidLoadProfile({ ...validProfile, nominalMW: 20_000 }),
      "nominalMW",
    );
  });

  it("rejects a non-positive horizon", () => {
    expectFieldError(() => assertValidLoadProfile({ ...validProfile, durationS: 0 }), "durationS");
  });

  it("rejects timesteps outside the 0.001-1.0 s band", () => {
    expectFieldError(
      () => assertValidLoadProfile({ ...validProfile, timestepS: 0.0005 }),
      "timestepS",
    );
    expectFieldError(() => assertValidLoadProfile({ ...validProfile, timestepS: 2 }), "timestepS");
  });

  it("rejects profiles that exceed the step budget with an actionable message", () => {
    const run = (): void =>
      assertValidLoadProfile({ ...validProfile, durationS: 600_000, timestepS: 0.1 });
    expect(run).toThrow(InputValidationError);
    expect(run).toThrow(/step budget/);
  });

  it("rejects non-array pulses", () => {
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: undefined as unknown as LoadProfile["pulses"],
        }),
      "pulses",
    );
  });

  it("rejects a pulse starting at or after the horizon", () => {
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: [{ ...validProfile.pulses[0]!, startS: 120 }],
        }),
      "pulses[0].startS",
    );
  });

  it("rejects zero or negative pulse ramps", () => {
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: [{ ...validProfile.pulses[0]!, rampDownS: 0 }],
        }),
      "pulses[0].rampDownS",
    );
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: [{ ...validProfile.pulses[0]!, rampUpS: 0 }],
        }),
      "pulses[0].rampUpS",
    );
  });

  it("rejects depths outside (0, 1] including NaN", () => {
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: [{ ...validProfile.pulses[0]!, depthFraction: 0 }],
        }),
      "pulses[0].depthFraction",
    );
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: [{ ...validProfile.pulses[0]!, depthFraction: 1.5 }],
        }),
      "pulses[0].depthFraction",
    );
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: [{ ...validProfile.pulses[0]!, depthFraction: Number.NaN }],
        }),
      "pulses[0].depthFraction",
    );
  });

  it("rejects a negative pulse hold", () => {
    expectFieldError(
      () =>
        assertValidLoadProfile({
          ...validProfile,
          pulses: [{ ...validProfile.pulses[0]!, durationS: -5 }],
        }),
      "pulses[0].durationS",
    );
  });
});

describe("assertValidSystemConfig", () => {
  it("accepts a valid config", () => {
    expect(() => assertValidSystemConfig(validConfig)).not.toThrow();
  });

  it("rejects an invalid SOFC rated power or min load", () => {
    expectFieldError(
      () =>
        assertValidSystemConfig({ ...validConfig, sofc: { ...validConfig.sofc, mw: Number.NaN } }),
      "sofc.mw",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sofc: { ...validConfig.sofc, minLoadFraction: 1 },
        }),
      "sofc.minLoadFraction",
    );
  });

  it("rejects inverted or malformed temperature bands", () => {
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sofc: { ...validConfig.sofc, tempBandC: [800, 650] },
        }),
      "tempBandC",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sofc: { ...validConfig.sofc, tempBandC: [650] as unknown as [number, number] },
        }),
      "tempBandC",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sofc: { ...validConfig.sofc, tempBandC: [650, Number.NaN] },
        }),
      "tempBandC[1]",
    );
  });

  it("rejects a non-positive ramp limit or time constant", () => {
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sofc: { ...validConfig.sofc, maxRampMWPerS: 0 },
        }),
      "sofc.maxRampMWPerS",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sofc: { ...validConfig.sofc, thermalTimeConstantS: 0 },
        }),
      "sofc.thermalTimeConstantS",
    );
  });

  it("accepts a turbine-less architecture but rejects a negative one", () => {
    expect(() =>
      assertValidSystemConfig({ ...validConfig, turbine: { ...validConfig.turbine, mw: 0 } }),
    ).not.toThrow();
    expectFieldError(
      () =>
        assertValidSystemConfig({ ...validConfig, turbine: { ...validConfig.turbine, mw: -1 } }),
      "turbine.mw",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          turbine: { ...validConfig.turbine, responseS: 0 },
        }),
      "turbine.responseS",
    );
  });

  it("rejects a surge margin outside (0, 1]", () => {
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          turbine: { ...validConfig.turbine, surgeMarginFraction: 0 },
        }),
      "turbine.surgeMarginFraction",
    );
  });

  it("accepts zero storage (unbuffered baseline) but rejects negative storage", () => {
    expect(() =>
      assertValidSystemConfig({
        ...validConfig,
        storage: { powerMW: 0, energyKWh: 0, technology: "ultracap" },
      }),
    ).not.toThrow();
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          storage: { ...validConfig.storage, powerMW: -1 },
        }),
      "storage.powerMW",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          storage: { ...validConfig.storage, energyKWh: -1 },
        }),
      "storage.energyKWh",
    );
  });

  it("rejects unknown storage technology or SST topology", () => {
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          storage: { ...validConfig.storage, technology: "diesel" as StorageTechnology },
        }),
      "storage.technology",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sst: { ...validConfig.sst, topology: "pseudo" as SstTopology },
        }),
      "sst.topology",
    );
  });

  it("rejects efficiency or heat-recovery values outside physical range", () => {
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          sst: { ...validConfig.sst, efficiencyPct: 101 },
        }),
      "sst.efficiencyPct",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          heatRecovery: { ...validConfig.heatRecovery, absorptionChillerCOP: 0 },
        }),
      "absorptionChillerCOP",
    );
    expectFieldError(
      () =>
        assertValidSystemConfig({
          ...validConfig,
          heatRecovery: { ...validConfig.heatRecovery, returnWaterC: -20 },
        }),
      "returnWaterC",
    );
  });
});

describe("assertValidCommandSeries", () => {
  it("accepts a finite series", () => {
    expect(() => assertValidCommandSeries([2, 4, 8], 0.5)).not.toThrow();
  });

  it("rejects empty series and NaN elements with the offending index", () => {
    expectFieldError(() => assertValidCommandSeries([], 0.5), "commandMW");
    expectFieldError(() => assertValidCommandSeries([2, Number.NaN, 8], 0.5), "commandMW[1]");
  });

  it("rejects an invalid timestep", () => {
    expectFieldError(() => assertValidCommandSeries([2, 4], 0), "timestepS");
  });
});
