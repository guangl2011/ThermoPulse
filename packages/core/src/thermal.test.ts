import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocateDemand,
  InputValidationError,
  runSofcThermal,
  runTurbine,
  simulateThermal,
} from "./index.js";
import type { SystemConfig } from "./types.js";

const sofc: SystemConfig["sofc"] = {
  mw: 10,
  minLoadFraction: 0.3,
  thermalTimeConstantS: 300,
  maxRampMWPerS: 0.05,
  tempBandC: [650, 800],
};
const turbine: SystemConfig["turbine"] = { mw: 5, responseS: 8, surgeMarginFraction: 0.15 };
const DT = 1;

/** Flatten a command into `hold` steps at each level. */
function staircase(levels: number[], hold: number): number[] {
  return levels.flatMap((level) => Array<number>(hold).fill(level));
}

describe("runSofcThermal — power channel", () => {
  it("limits delivered power to maxRampMWPerS on a step command", () => {
    const command = [...Array<number>(50).fill(4), ...Array<number>(50).fill(9)];
    const result = runSofcThermal(sofc, command, DT);
    expect(result.deliveredMW[49]).toBeCloseTo(4, 9); // settled at the initial level
    expect(result.deliveredMW[50]).toBeCloseTo(4.05, 9);
    expect(result.deliveredMW[51]).toBeCloseTo(4.1, 9);
  });

  it("tracks commands that ramp within the limit without tracking error", () => {
    const command = staircase([4], 50).map((_, k) => 4 + 0.02 * k); // 0.02 MW/s < 0.05
    const result = runSofcThermal(sofc, command, DT);
    for (let k = 1; k < command.length; k++) {
      expect(result.deliveredMW[k]).toBeCloseTo(command[k]!, 9);
      expect(result.stressDeviationC[k]).toBeCloseTo(0, 6);
    }
  });

  it("clamps delivered power to the must-run floor and rated ceiling", () => {
    const command = [0, 0, 50, 50];
    const result = runSofcThermal(sofc, command, 0.5);
    for (const power of result.deliveredMW) {
      expect(power).toBeGreaterThanOrEqual(sofc.minLoadFraction * sofc.mw - 1e-9);
      expect(power).toBeLessThanOrEqual(sofc.mw + 1e-9);
    }
  });

  it("starts in steady state without a startup stress artifact", () => {
    const result = runSofcThermal(sofc, [9, 9, 9], DT);
    expect(result.stressDeviationC[0]).toBeCloseTo(0, 9);
    expect(result.excursions).toEqual([]);
  });
});

describe("runSofcThermal — thermal channel", () => {
  it("settles on the operating map for a steady mid-band load with no excursions", () => {
    const result = runSofcThermal(sofc, Array<number>(3600).fill(6), DT);
    const expectedC = 650 + 150 * (0.15 + 0.7 * 0.6); // 735.5
    const last = result.temperatureC.values.at(-1) ?? Number.NaN;
    expect(last).toBeCloseTo(expectedC, 1);
    expect(result.excursions).toEqual([]);
    expect(result.energyClosureErrorPct).toBeLessThan(1e-9);
  });

  it("records an over-temperature excursion when an unbuffered pulse steps the command", () => {
    // 9 MW for 100 s, then a 5 MW drop in one step (the unbuffered pulse).
    const command = [...Array<number>(100).fill(9), ...Array<number>(100).fill(4)];
    const result = runSofcThermal(sofc, command, DT);
    expect(result.excursions.length).toBeGreaterThanOrEqual(1);
    expect(result.excursions[0]!.side).toBe("over");
    expect(result.excursions[0]!.peakDeviationC).toBeGreaterThan(20);
  });

  it("produces no excursion for the same swing spread over a slow ramp", () => {
    // Same net swing (9 -> 4 MW) but spread over 100 s: the buffered story.
    const ramp = Array.from({ length: 100 }, (_, k) => 9 - (5 * k) / 99);
    const command = [...ramp, ...Array<number>(100).fill(4)];
    const result = runSofcThermal(sofc, command, DT);
    expect(result.excursions).toEqual([]);
  });

  it("keeps temperature physically bounded under wildly oscillating demand", () => {
    const command = staircase([0, 50, 0, 50, 0, 50], 10);
    const result = runSofcThermal(sofc, command, DT);
    const [bandLow, bandHigh] = sofc.tempBandC;
    for (const t of result.temperatureC.values) {
      expect(t).toBeGreaterThanOrEqual(bandLow - 1);
      expect(t).toBeLessThanOrEqual(bandHigh + 200 + 1); // + stress gain ceiling
    }
  });
});

describe("runSofcThermal — energy book", () => {
  it("closes fuel = electric + rejected + stored within float precision", () => {
    const command = staircase([9, 4, 9, 4], 50);
    const result = runSofcThermal(sofc, command, DT);
    expect(result.energyClosureErrorPct).toBeLessThan(1e-9);
    const book =
      result.fuelEnergyMWh -
      result.electricalEnergyMWh -
      result.rejectedHeatMWh -
      result.storedHeatDeltaMWh;
    expect(Math.abs(book)).toBeLessThan(1e-9);
  });

  it("reports positive rejected heat and bounded efficiency bookkeeping", () => {
    const result = runSofcThermal(sofc, staircase([6, 9, 3, 6], 40), DT);
    expect(result.rejectedHeatMWh).toBeGreaterThan(0);
    expect(result.electricalEnergyMWh).toBeGreaterThan(0);
    expect(result.fuelEnergyMWh).toBeGreaterThan(result.electricalEnergyMWh);
  });
});

describe("runTurbine — response and surge margin", () => {
  it("approaches a step command with a first-order lag and no overshoot", () => {
    const command = [...Array<number>(20).fill(0), ...Array<number>(80).fill(4)];
    const result = runTurbine(turbine, command, DT);
    expect(result.deliveredMW[19]).toBeCloseTo(0, 9);
    expect(result.deliveredMW[20]).toBeCloseTo(4 * (1 - Math.exp(-1 / 8)), 9);
    expect(result.deliveredMW[99]).toBeCloseTo(4, 3); // asymptotic: ~1.8e-4 MW after 80 steps
  });

  it("dips surge margin on a hard step and recovers to the base margin", () => {
    const command = [...Array<number>(10).fill(0), ...Array<number>(90).fill(4)];
    const result = runTurbine(turbine, command, DT);
    expect(result.surgeMargin[9]).toBeCloseTo(turbine.surgeMarginFraction, 9);
    expect(result.surgeMarginMin).toBeLessThan(turbine.surgeMarginFraction);
    expect(result.surgeMarginMin).toBeGreaterThanOrEqual(0);
    expect(result.surgeMargin[89]).toBeCloseTo(turbine.surgeMarginFraction, 4); // residual dip ~5e-5
  });

  it("keeps more margin when the same swing is ramped slowly", () => {
    const stepped = runTurbine(turbine, [0, ...Array<number>(60).fill(4)], DT);
    const ramp = Array.from({ length: 60 }, (_, k) => (4 * k) / 59);
    const smoothed = runTurbine(turbine, [0, ...ramp], DT);
    expect(smoothed.surgeMarginMin).toBeGreaterThan(stepped.surgeMarginMin);
  });

  it("reports a flat base margin for a turbine-less architecture", () => {
    const zero = { ...turbine, mw: 0 };
    const result = runTurbine(zero, [2, 2, 2], DT);
    expect(result.deliveredMW.every((p) => p === 0)).toBe(true);
    expect(result.surgeMarginMin).toBe(turbine.surgeMarginFraction);
  });
});

describe("allocateDemand — oversubscription and must-run", () => {
  it("splits demand sofc-first and records the unmet deficit", () => {
    const allocation = allocateDemand(Array<number>(10).fill(20), sofc, turbine, DT);
    expect(allocation.sofcCommandMW.every((c) => c === sofc.mw)).toBe(true);
    expect(allocation.turbineCommandMW.every((c) => c === turbine.mw)).toBe(true);
    expect(allocation.unmetMW.every((u) => u === 5)).toBe(true); // 20 - 10 - 5
    expect(allocation.unmetEnergyMWh).toBeCloseTo((5 * 10) / 3600, 12);
  });

  it("records dumped overgeneration below the must-run floor as negative unmet", () => {
    const allocation = allocateDemand([1, 1], sofc, turbine, DT);
    // sofc at min load 3 MW, demand 1 MW -> 2 MW must-run surplus dumped
    expect(allocation.unmetMW[0]).toBeCloseTo(-2, 9);
  });

  it("passes demand through when both units can cover it", () => {
    const allocation = allocateDemand([12, 12], sofc, turbine, DT);
    expect(allocation.sofcCommandMW[0]).toBe(10);
    expect(allocation.turbineCommandMW[0]).toBe(2);
    expect(allocation.unmetMW[0]).toBe(0);
  });
});

describe("simulateThermal — combined run", () => {
  it("keeps steady operation inside the band but flags an unbuffered pulse", () => {
    const system = { sofc, turbine };
    const steady = simulateThermal(system, Array<number>(200).fill(7), DT);
    expect(steady.sofc.excursions).toEqual([]);
    expect(steady.allocation.unmetMW.every((u) => u === 0)).toBe(true);

    // Unbuffered baseline: the raw pulse reaches the SOFC as a step command.
    const pulsed = simulateThermal(
      system,
      [...Array<number>(100).fill(9), ...Array<number>(100).fill(4)],
      DT,
      { sofc: { stressGainKPerUnit: 200 } },
    );
    expect(pulsed.sofc.excursions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("thermal models — boundary rejection", () => {
  it("rejects NaN commands, empty series, bad timesteps, and bad options", () => {
    expect(() => runSofcThermal(sofc, [Number.NaN], DT)).toThrow(InputValidationError);
    expect(() => runSofcThermal(sofc, [], DT)).toThrow(InputValidationError);
    expect(() => runSofcThermal(sofc, [5], 0)).toThrow(InputValidationError);
    expect(() => runSofcThermal(sofc, [5], DT, { electricalEfficiency: 1.5 })).toThrow(
      InputValidationError,
    );
    expect(() => runTurbine(turbine, [5], DT, { surgeAccelGain: 1.2 })).toThrow(
      InputValidationError,
    );
    expect(() => allocateDemand([Number.POSITIVE_INFINITY], sofc, turbine, DT)).toThrow(
      InputValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Property tests (fast-check, 200 runs each)
// ---------------------------------------------------------------------------

const sofcArb: fc.Arbitrary<SystemConfig["sofc"]> = fc
  .record({
    mw: fc.double({ min: 1, max: 100 }).filter(Number.isFinite),
    minLoadFraction: fc.double({ min: 0.1, max: 0.5 }).filter(Number.isFinite),
    thermalTimeConstantS: fc.double({ min: 60, max: 600 }).filter(Number.isFinite),
    maxRampMWPerS: fc.double({ min: 0.005, max: 0.5 }).filter(Number.isFinite),
  })
  .chain((rest) =>
    fc
      .tuple(
        fc.double({ min: 500, max: 650 }).filter(Number.isFinite),
        fc.double({ min: 700, max: 900 }).filter(Number.isFinite),
      )
      .map(([low, high]): SystemConfig["sofc"] => ({
        ...rest,
        tempBandC: [low, Math.max(high, low + 100)],
      })),
  );

const turbineArb: fc.Arbitrary<SystemConfig["turbine"]> = fc.record({
  mw: fc.double({ min: 0, max: 50 }).filter(Number.isFinite),
  responseS: fc.double({ min: 2, max: 15 }).filter(Number.isFinite),
  surgeMarginFraction: fc.double({ min: 0.05, max: 0.3 }).filter(Number.isFinite),
});

const timestepArb = fc.double({ min: 0.25, max: 1 }).filter(Number.isFinite);

/** Command trajectories are fractions of rated MW, part of the property input
 * so any counterexample shrinks to a fully reproducible run. */
const sofcRunArb: fc.Arbitrary<{
  sofc: SystemConfig["sofc"];
  dt: number;
  command: number[];
}> = sofcArb.chain((sofcParams) =>
  fc
    .tuple(
      timestepArb,
      fc.array(fc.double({ min: 0, max: 1.3 }).filter(Number.isFinite), {
        minLength: 40,
        maxLength: 80,
      }),
    )
    .map(([dt, fractions]) => ({
      sofc: sofcParams,
      dt,
      command: fractions.map((f) => f * sofcParams.mw),
    })),
);

const turbineRunArb: fc.Arbitrary<{
  turbine: SystemConfig["turbine"];
  dt: number;
  command: number[];
}> = turbineArb.chain((turbineParams) =>
  fc
    .tuple(
      timestepArb,
      fc.array(fc.double({ min: 0, max: 1.3 }).filter(Number.isFinite), {
        minLength: 40,
        maxLength: 80,
      }),
    )
    .map(([dt, fractions]) => ({
      turbine: turbineParams,
      dt,
      command: fractions.map((f) => f * turbineParams.mw),
    })),
);

const PROPERTY_OPTIONS = { numRuns: 200 };

describe("runSofcThermal — properties", () => {
  it("closes the energy book within 0.1% per horizon (in practice float-exact)", () => {
    fc.assert(
      fc.property(sofcRunArb, ({ sofc: sofcParams, dt, command }) => {
        const result = runSofcThermal(sofcParams, command, dt);
        expect(result.energyClosureErrorPct).toBeLessThan(0.1);
        expect(result.energyClosureErrorPct).toBeLessThan(1e-6); // float-exact in practice
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("keeps temperature, delivered power, and stress bounded and finite", () => {
    fc.assert(
      fc.property(sofcRunArb, ({ sofc: sofcParams, dt, command }) => {
        const result = runSofcThermal(sofcParams, command, dt);
        const [bandLow, bandHigh] = sofcParams.tempBandC;
        const minMW = sofcParams.minLoadFraction * sofcParams.mw;
        for (const t of result.temperatureC.values) {
          expect(Number.isFinite(t)).toBe(true);
          expect(t).toBeGreaterThanOrEqual(bandLow - 1);
          expect(t).toBeLessThanOrEqual(bandHigh + 200 + 1);
        }
        for (const power of result.deliveredMW) {
          expect(Number.isFinite(power)).toBe(true);
          expect(power).toBeGreaterThanOrEqual(minMW - 1e-9);
          expect(power).toBeLessThanOrEqual(sofcParams.mw + 1e-9);
        }
        expect(result.minTemperatureC).toBeLessThanOrEqual(result.maxTemperatureC);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("records excursions exactly when the series leaves the band", () => {
    fc.assert(
      fc.property(sofcRunArb, ({ sofc: sofcParams, dt, command }) => {
        const result = runSofcThermal(sofcParams, command, dt);
        const [bandLow, bandHigh] = sofcParams.tempBandC;
        // Recount maximal out-of-band runs from the series (same merge rule:
        // a direct over<->under flip within one step counts as two runs).
        let runs = 0;
        let current: "over" | "under" | null = null;
        for (const t of result.temperatureC.values) {
          const side = t > bandHigh ? "over" : t < bandLow ? "under" : null;
          if (side === null) {
            current = null;
          } else if (side !== current) {
            runs += 1;
            current = side;
          }
        }
        expect(result.excursions.length).toBe(runs);
        for (const excursion of result.excursions) {
          expect(excursion.endS).toBeGreaterThanOrEqual(excursion.startS);
          expect(excursion.peakDeviationC).toBeGreaterThan(0);
        }
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe("runTurbine — properties", () => {
  it("keeps surge margin in [0, base] and delivered power in [0, mw]", () => {
    fc.assert(
      fc.property(turbineRunArb, ({ turbine: turbineParams, dt, command }) => {
        const result = runTurbine(turbineParams, command, dt);
        for (let k = 0; k < result.surgeMargin.length; k++) {
          expect(Number.isFinite(result.surgeMargin[k])).toBe(true);
          expect(result.surgeMargin[k]).toBeGreaterThanOrEqual(0);
          expect(result.surgeMargin[k]).toBeLessThanOrEqual(
            turbineParams.surgeMarginFraction + 1e-9,
          );
          expect(result.deliveredMW[k]).toBeGreaterThanOrEqual(0);
          expect(result.deliveredMW[k]).toBeLessThanOrEqual(turbineParams.mw + 1e-9);
        }
        expect(result.surgeMarginMin).toBeCloseTo(Math.min(...result.surgeMargin), 12);
      }),
      PROPERTY_OPTIONS,
    );
  });
});
