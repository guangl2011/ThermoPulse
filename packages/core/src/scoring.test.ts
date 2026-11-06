import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORAGE_MARGINAL_SOC_FRACTION,
  DEFAULT_SURGE_FAIL_FRACTION,
  DEFAULT_SURGE_MARGINAL_FRACTION,
  DEFAULT_THERMAL_MARGINAL_DEVIATION_C,
  scoreCompliance,
  synthesizeLoad,
  worstVerdict,
} from "./index.js";
import type {
  ComplianceScore,
  LoadProfile,
  SofcThermalResult,
  SystemConfig,
  TurbineResult,
  StorageDispatchResult,
  Verdict,
} from "./types.js";
import {
  compose,
  healthyStorage,
  healthyTurbine,
  referenceSystem,
  thermalResult,
} from "./testing.js";

const SEVERITY: Record<Verdict, number> = { PASS: 0, MARGINAL: 1, FAIL: 2 };

const system = referenceSystem();

describe("worstVerdict", () => {
  it("ranks FAIL above MARGINAL above PASS", () => {
    expect(worstVerdict(["PASS"])).toBe("PASS");
    expect(worstVerdict(["PASS", "MARGINAL"])).toBe("MARGINAL");
    expect(worstVerdict(["MARGINAL", "FAIL"])).toBe("FAIL");
    expect(worstVerdict(["PASS", "MARGINAL", "FAIL"])).toBe("FAIL");
    expect(worstVerdict([])).toBe("PASS");
  });
});

describe("scoreThermalStress", () => {
  const thermalWithExcursion = (peak: number): SofcThermalResult =>
    thermalResult({
      excursions: [{ startS: 100, endS: 120, peakDeviationC: peak, side: "over" }],
    });

  it("passes a run with no excursions", () => {
    const thermal = thermalResult();
    expect(
      scoreCompliance(system, { thermal, turbine: healthyTurbine(), storage: healthyStorage() })
        .thermalStress,
    ).toBe("PASS");
  });

  it("scores a small breach MARGINAL and a large breach FAIL", () => {
    expect(
      scoreCompliance(system, {
        thermal: thermalWithExcursion(10),
        turbine: healthyTurbine(),
        storage: healthyStorage(),
      }).thermalStress,
    ).toBe("MARGINAL");
    expect(
      scoreCompliance(system, {
        thermal: thermalWithExcursion(10.5),
        turbine: healthyTurbine(),
        storage: healthyStorage(),
      }).thermalStress,
    ).toBe("FAIL");
  });
});

describe("scoreSurge", () => {
  const turbineWithMin = (marginMin: number) => ({
    ...healthyTurbine(),
    surgeMarginMin: marginMin,
    surgeMargin: new Array<number>(600).fill(marginMin),
  });

  it("passes an untouched design margin", () => {
    expect(
      scoreCompliance(system, {
        thermal: thermalResult(),
        turbine: healthyTurbine(),
        storage: healthyStorage(),
      }).surge,
    ).toBe("PASS");
  });

  it("fails a dip that consumes more than 75% of the design margin", () => {
    // accelGain 0.9: an unbuffered full swing leaves 10% of the margin.
    expect(
      scoreCompliance(system, {
        thermal: thermalResult(),
        turbine: turbineWithMin(0.1 * 0.2),
        storage: healthyStorage(),
      }).surge,
    ).toBe("FAIL");
  });

  it("marks a moderate dip MARGINAL", () => {
    expect(
      scoreCompliance(system, {
        thermal: thermalResult(),
        turbine: turbineWithMin(0.5 * 0.2),
        storage: healthyStorage(),
      }).surge,
    ).toBe("MARGINAL");
  });
});

describe("scoreStorageAdequacy", () => {
  it("fails recorded unmet energy (mid-pulse exhaustion is visible, not clamped)", () => {
    const storage = { ...healthyStorage(), unmetEnergyMWh: 0.5 };
    const score = scoreCompliance(system, {
      thermal: thermalResult(),
      turbine: healthyTurbine(),
      storage,
    });
    expect(score.storageAdequacy).toBe("FAIL");
    expect(score.overall).toBe("FAIL");
  });

  it("fails an oversubscribed architecture", () => {
    const storage = { ...healthyStorage(), oversubscribed: true };
    expect(
      scoreCompliance(system, { thermal: thermalResult(), turbine: healthyTurbine(), storage })
        .storageAdequacy,
    ).toBe("FAIL");
  });

  it("marks a buffer that rode its floor MARGINAL", () => {
    const storage = {
      ...healthyStorage(),
      energyKWh: {
        timesS: healthyStorage().energyKWh.timesS,
        values: new Array<number>(600).fill(system.storage.energyKWh * 0.05),
      },
    };
    expect(
      scoreCompliance(system, { thermal: thermalResult(), turbine: healthyTurbine(), storage })
        .storageAdequacy,
    ).toBe("MARGINAL");
  });

  it("passes a healthy buffer and a zero-capacity plant that never missed load", () => {
    expect(
      scoreCompliance(system, {
        thermal: thermalResult(),
        turbine: healthyTurbine(),
        storage: healthyStorage(),
      }).storageAdequacy,
    ).toBe("PASS");
    const unbuffered = {
      ...healthyStorage(),
      energyKWh: {
        timesS: healthyStorage().energyKWh.timesS,
        values: new Array<number>(600).fill(0),
      },
    };
    expect(
      scoreCompliance(
        { ...system, storage: { ...system.storage, energyKWh: 0 } },
        {
          thermal: thermalResult(),
          turbine: healthyTurbine(),
          storage: unbuffered,
        },
      ).storageAdequacy,
    ).toBe("PASS");
  });
});

describe("scoreCompliance — thresholds", () => {
  const turbineWithMin = (marginMin: number): TurbineResult => ({
    ...healthyTurbine(),
    surgeMarginMin: marginMin,
    surgeMargin: new Array<number>(600).fill(marginMin),
  });
  const storageWithSoC = (energyKWh: number): StorageDispatchResult => ({
    ...healthyStorage(),
    energyKWh: {
      timesS: healthyStorage().energyKWh.timesS,
      values: new Array<number>(600).fill(energyKWh),
    },
  });
  const runs = (turbine: TurbineResult, storage: StorageDispatchResult) =>
    scoreCompliance(system, { thermal: thermalResult(), turbine, storage });

  it("rejects negative thresholds", () => {
    expect(() =>
      scoreCompliance(
        system,
        { thermal: thermalResult(), turbine: healthyTurbine(), storage: healthyStorage() },
        {
          thermalMarginalDeviationC: -1,
        },
      ),
    ).toThrow(RangeError);
  });

  it("pins the documented default thresholds as the live cuts", () => {
    // Thermal: a breach within the default deviation cut is MARGINAL; a
    // deeper one FAILs. (PASS requires zero excursions.)
    expect(runs(healthyTurbine(), healthyStorage()).thermalStress).toBe("PASS");
    expect(
      scoreCompliance(system, {
        thermal: thermalResult({
          excursions: [
            {
              startS: 100,
              endS: 101,
              peakDeviationC: DEFAULT_THERMAL_MARGINAL_DEVIATION_C,
              side: "over",
            },
          ],
        }),
        turbine: healthyTurbine(),
        storage: healthyStorage(),
      }).thermalStress,
    ).toBe("MARGINAL");
    expect(
      scoreCompliance(system, {
        thermal: thermalResult({
          excursions: [
            {
              startS: 100,
              endS: 101,
              peakDeviationC: DEFAULT_THERMAL_MARGINAL_DEVIATION_C + 1,
              side: "over",
            },
          ],
        }),
        turbine: healthyTurbine(),
        storage: healthyStorage(),
      }).thermalStress,
    ).toBe("FAIL");
    // Surge: ratio a hair below the MARGINAL cut is MARGINAL; at it, PASS.
    expect(
      runs(turbineWithMin(DEFAULT_SURGE_MARGINAL_FRACTION * 0.2), healthyStorage()).surge,
    ).toBe("PASS");
    expect(
      runs(turbineWithMin((DEFAULT_SURGE_MARGINAL_FRACTION - 1e-9) * 0.2), healthyStorage()).surge,
    ).toBe("MARGINAL");
    // Surge FAIL floor: a hair below it is FAIL; just above it, MARGINAL.
    expect(
      runs(turbineWithMin((DEFAULT_SURGE_FAIL_FRACTION + 1e-9) * 0.2), healthyStorage()).surge,
    ).toBe("MARGINAL");
    expect(
      runs(turbineWithMin((DEFAULT_SURGE_FAIL_FRACTION - 1e-9) * 0.2), healthyStorage()).surge,
    ).toBe("FAIL");
    // Storage: min SOC exactly at the floor passes; a hair below is MARGINAL.
    expect(
      runs(
        healthyTurbine(),
        storageWithSoC(DEFAULT_STORAGE_MARGINAL_SOC_FRACTION * system.storage.energyKWh),
      ).storageAdequacy,
    ).toBe("PASS");
    expect(
      runs(
        healthyTurbine(),
        storageWithSoC((DEFAULT_STORAGE_MARGINAL_SOC_FRACTION - 1e-9) * system.storage.energyKWh),
      ).storageAdequacy,
    ).toBe("MARGINAL");
  });

  it("treats the surge cuts as independent zones — an inverted pair empties the MARGINAL band", () => {
    // ratio 0.5 is MARGINAL at defaults; raising the FAIL cut to 0.9 makes
    // the same run FAIL with no MARGINAL zone in between.
    const dip = turbineWithMin(0.1);
    const base = scoreCompliance(system, {
      thermal: thermalResult(),
      turbine: dip,
      storage: healthyStorage(),
    });
    expect(base.surge).toBe("MARGINAL");
    const inverted = scoreCompliance(
      system,
      { thermal: thermalResult(), turbine: dip, storage: healthyStorage() },
      { surgeFailFraction: 0.9, surgeMarginalFraction: 0.25 },
    );
    expect(inverted.surge).toBe("FAIL");
  });
});

describe("reference scenario — buffered vs unbuffered (composed pipeline)", () => {
  // The spec's before/after story on the reference pulse suite: a checkpoint
  // pulse (50 ms shed to a 30% floor, 45 s hold, 50 ms recovery) on a 90 MW
  // campus. The identical profile and plant run twice — only the buffer
  // changes.
  const load = synthesizeLoad({
    name: "reference",
    nominalMW: 90,
    durationS: 600,
    timestepS: 1,
    pulses: [{ startS: 100, rampDownS: 0.05, depthFraction: 0.7, durationS: 45, rampUpS: 0.05 }],
  });

  it("the buffered run keeps the SOFC in-band and serves every step", () => {
    const buffered = compose(system, load);
    const score = scoreCompliance(system, buffered);
    expect(score.thermalStress).toBe("PASS");
    expect(score.storageAdequacy).toBe("PASS");
    // Honest physics: the turbine still unloads from ~30 MW to 0 at the 63 MW
    // load step on its own ~8 s spool lag, and the part-1 surge surrogate
    // consumes margin on |dP/dt| in both directions — the buffered run's
    // surge verdict is MARGINAL, not PASS. That dip is exactly the surge cost
    // of load steps that NETL's bypass-control research targets.
    expect(score.surge).toBe("MARGINAL");
    expect(score.overall).toBe("MARGINAL");
    // The buffer did real work.
    expect(buffered.storage.dischargedEnergyMWh).toBeGreaterThan(0.01);
  });

  it("the identical unbuffered baseline scores strictly worse", () => {
    const unbuffered = compose(
      { ...system, storage: { powerMW: 0, energyKWh: 0, technology: "ultracap" } },
      load,
    );
    const buffered = compose(system, load);
    const score = scoreCompliance(system, unbuffered);
    const bufferedScore = scoreCompliance(system, buffered);
    // FAIL or MARGINAL on the same suite, and strictly worse than buffered:
    // the SOFC leaves its temperature band and load goes unserved.
    expect(SEVERITY[score.overall]).toBeGreaterThanOrEqual(SEVERITY.MARGINAL);
    expect(SEVERITY[score.overall]).toBeGreaterThan(SEVERITY[bufferedScore.overall]);
    expect(unbuffered.thermal.excursions.length).toBeGreaterThan(0);
    expect(unbuffered.storage.unmetEnergyMWh).toBeGreaterThan(0);
  });
});

describe("scoring properties", () => {
  const PROPERTY_OPTIONS = { numRuns: 200 };

  // One correlated record: the plant, the profile, and the nominal load come
  // from the same draw, so the feasibility filter is meaningful.
  const scenarioArb = fc
    .record({
      nominalMW: fc.double({ min: 60, max: 110, noNaN: true }),
      sofcMW: fc.double({ min: 45, max: 70, noNaN: true }),
      turbineMW: fc.double({ min: 30, max: 55, noNaN: true }),
      storagePower: fc.double({ min: 10, max: 80, noNaN: true }),
      storageEnergy: fc.double({ min: 200, max: 3000, noNaN: true }),
      startS: fc.integer({ min: 30, max: 120 }),
      holdS: fc.integer({ min: 10, max: 60 }),
      depth: fc.double({ min: 0.35, max: 0.65, noNaN: true }),
    })
    .filter((c) => c.sofcMW + c.turbineMW >= c.nominalMW)
    .map((c) => {
      const cfg: SystemConfig = {
        ...system,
        sofc: { ...system.sofc, mw: c.sofcMW },
        turbine: { ...system.turbine, mw: c.turbineMW },
        storage: { powerMW: c.storagePower, energyKWh: c.storageEnergy, technology: "ultracap" },
      };
      const profile: LoadProfile = {
        name: "generated",
        nominalMW: c.nominalMW,
        durationS: 400,
        timestepS: 1,
        pulses: [
          {
            startS: c.startS,
            rampDownS: 0.05,
            depthFraction: c.depth,
            durationS: c.holdS,
            rampUpS: 0.05,
          },
        ],
      };
      return { cfg, profile };
    });

  it("overall is always the worst of the three criteria", () => {
    fc.assert(
      fc.property(scenarioArb, ({ cfg, profile }) => {
        const composed = compose(cfg, synthesizeLoad(profile));
        const score = scoreCompliance(cfg, composed);
        expect(score.overall).toBe(
          worstVerdict([score.thermalStress, score.surge, score.storageAdequacy]),
        );
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("relaxing any scoring threshold never worsens its criterion or the overall", () => {
    fc.assert(
      fc.property(scenarioArb, ({ cfg, profile }) => {
        const composed = compose(cfg, synthesizeLoad(profile));
        const base = scoreCompliance(cfg, composed);

        // Relaxation directions: thermal tolerates MORE deviation; the surge
        // FAIL floor DROPS (the FAIL zone shrinks) and the MARGINAL bar drops
        // (the PASS zone grows); the storage SOC floor drops.
        const relaxations: {
          thresholds: Parameters<typeof scoreCompliance>[2];
          criterion: keyof Omit<ComplianceScore, "overall">;
        }[] = [
          { thresholds: { thermalMarginalDeviationC: 1e6 }, criterion: "thermalStress" },
          { thresholds: { surgeFailFraction: 0.001 }, criterion: "surge" },
          { thresholds: { surgeMarginalFraction: 0.002 }, criterion: "surge" },
          { thresholds: { storageMarginalSoCFraction: 0 }, criterion: "storageAdequacy" },
        ];
        for (const { thresholds, criterion } of relaxations) {
          const relaxed = scoreCompliance(cfg, composed, thresholds);
          expect(SEVERITY[relaxed[criterion]]).toBeLessThanOrEqual(SEVERITY[base[criterion]]);
          expect(SEVERITY[relaxed.overall]).toBeLessThanOrEqual(SEVERITY[base.overall]);
        }
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("an unbounded buffer always achieves storageAdequacy PASS on a feasible plant", () => {
    fc.assert(
      fc.property(scenarioArb, ({ cfg, profile }) => {
        const huge = {
          ...cfg,
          storage: {
            powerMW: cfg.sofc.mw + cfg.turbine.mw,
            energyKWh: 1e7,
            technology: "ultracap" as const,
          },
        };
        const composed = compose(huge, synthesizeLoad(profile));
        const score = scoreCompliance(huge, composed);
        expect(score.storageAdequacy).toBe("PASS");
      }),
      PROPERTY_OPTIONS,
    );
  });
});
