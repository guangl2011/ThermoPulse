import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { InputValidationError, synthesizeLoad } from "./index.js";
import type { GpuPulse, LoadProfile } from "./types.js";

function profile(pulses: GpuPulse[], overrides: Partial<LoadProfile> = {}): LoadProfile {
  return { name: "test", nominalMW: 100, durationS: 120, timestepS: 0.5, pulses, ...overrides };
}

/** Independent numeric reference: dense trapezoid sampling of the shed fraction. */
function referenceEnergyMWh(p: LoadProfile): number {
  const dt = 2.5e-3;
  const steps = Math.round(p.durationS / dt);
  const shedAt = (t: number): number => {
    let total = 0;
    for (const pulse of p.pulses) {
      const holdS = pulse.durationS ?? 30;
      const rampUpS = pulse.rampUpS ?? pulse.rampDownS;
      const rel = t - pulse.startS;
      let shape = 0;
      if (rel > 0 && rel < pulse.rampDownS) {
        shape = rel / pulse.rampDownS;
      } else if (rel >= pulse.rampDownS && rel < pulse.rampDownS + holdS) {
        shape = 1;
      } else if (rel >= pulse.rampDownS + holdS && rel < pulse.rampDownS + holdS + rampUpS) {
        shape = 1 - (rel - pulse.rampDownS - holdS) / rampUpS;
      }
      total += pulse.depthFraction * shape;
    }
    return Math.min(1, total);
  };
  let shed = 0;
  let t0 = 0;
  for (let k = 0; k < steps; k++) {
    const t1 = (k + 1) * dt;
    shed += ((shedAt(t0) + shedAt(t1)) / 2) * (t1 - t0);
    t0 = t1;
  }
  return (p.nominalMW * (p.durationS - shed)) / 3600;
}

/** Energy of the synthesized series using each step's actual span. */
function seriesEnergyMWh(series: ReturnType<typeof synthesizeLoad>): number {
  let energy = 0;
  let t0 = 0;
  const dt = series.timestepS;
  for (let k = 0; k < series.powerMW.length; k++) {
    const t1 = Math.min((k + 1) * dt, series.horizonS);
    energy += (series.powerMW[k] ?? 0) * (t1 - t0);
    t0 = t1;
  }
  return energy / 3600;
}

describe("synthesizeLoad — steady profiles", () => {
  it("holds nominal load and integrates exactly with no pulses", () => {
    const series = synthesizeLoad(profile([]));
    expect(series.powerMW).toHaveLength(240);
    for (const p of series.powerMW) {
      expect(p).toBeCloseTo(100, 9);
    }
    expect(series.energyMWh).toBeCloseTo((100 * 120) / 3600, 9);
  });
});

describe("synthesizeLoad — single pulse shape", () => {
  const pulse: GpuPulse = {
    startS: 20,
    rampDownS: 0.01,
    depthFraction: 0.4,
    durationS: 30,
    rampUpS: 30,
  };

  it("reaches the depth floor during the hold and recovers after it", () => {
    const series = synthesizeLoad(profile([pulse]));
    const stepAt = (t: number): number =>
      series.powerMW[Math.floor(t / series.timestepS)] ?? Number.NaN;
    expect(stepAt(35)).toBeCloseTo(60, 6); // inside the hold
    expect(stepAt(90)).toBeCloseTo(100, 6); // after the recovery ramp (ends at 80.01 s)
  });

  it("matches the closed-form pulse energy", () => {
    const series = synthesizeLoad(profile([pulse]));
    // ∫shed dt = depth * (rampDown/2 + hold + rampUp/2) = 0.4 * (0.005 + 30 + 15)
    const expected = (100 * (120 - 0.4 * 45.005)) / 3600;
    expect(series.energyMWh).toBeCloseTo(expected, 9);
  });

  it("is consistent between per-step energies and the reported horizon energy", () => {
    const uneven = profile(
      [{ startS: 5, rampDownS: 0.2, depthFraction: 0.5, durationS: 7, rampUpS: 3 }],
      { timestepS: 0.3, durationS: 100 }, // last step is partial (0.1 s)
    );
    expect(seriesEnergyMWh(synthesizeLoad(uneven))).toBeCloseTo(
      synthesizeLoad(uneven).energyMWh,
      9,
    );
  });
});

describe("synthesizeLoad — sub-timestep pulses (no aliasing)", () => {
  // A 10 ms transient (5 ms down, no hold, 5 ms up) fully inside one 0.5 s step.
  const spike: GpuPulse = {
    startS: 10,
    rampDownS: 0.005,
    depthFraction: 0.4,
    durationS: 0,
    rampUpS: 0.005,
  };

  it("captures a 10 ms transient on a 0.5 s grid as an intermediate average", () => {
    const series = synthesizeLoad(profile([spike]));
    const stepAt = (t: number): number =>
      series.powerMW[Math.floor(t / series.timestepS)] ?? Number.NaN;
    const duringSpike = stepAt(10);
    expect(duringSpike).toBeLessThan(100);
    expect(duringSpike).toBeGreaterThan(60);
    // exact step average: shed integral = depth * rampDown = 0.002 s over 0.5 s
    expect(duringSpike).toBeCloseTo(100 * (1 - 0.004), 6);
  });

  it("reports identical energy on coarse and fine grids", () => {
    const coarse = synthesizeLoad(profile([spike]));
    const fine = synthesizeLoad(profile([spike], { timestepS: 0.001 }));
    expect(coarse.energyMWh).toBeCloseTo(fine.energyMWh, 9);
  });
});

describe("synthesizeLoad — degenerate but valid inputs", () => {
  it("never drives load below zero when overlapping pulses stack", () => {
    const series = synthesizeLoad(
      profile([
        { startS: 10, rampDownS: 0.1, depthFraction: 0.7, durationS: 30, rampUpS: 10 },
        { startS: 12, rampDownS: 0.1, depthFraction: 0.7, durationS: 30, rampUpS: 10 },
      ]),
    );
    for (const p of series.powerMW) {
      expect(p).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(Math.min(...series.powerMW)).toBeLessThan(100); // the pulses do bite
  });

  it("clips pulses that run past the horizon without NaN", () => {
    const series = synthesizeLoad(
      profile([{ startS: 119, rampDownS: 2, depthFraction: 0.5, durationS: 30, rampUpS: 10 }]),
    );
    for (const p of series.powerMW) {
      expect(Number.isFinite(p)).toBe(true);
    }
    expect(series.energyMWh).toBeGreaterThan(0);
  });
});

describe("synthesizeLoad — boundary rejection", () => {
  it("surfaces InputValidationError for invalid profiles", () => {
    expect(() => synthesizeLoad(profile([], { nominalMW: Number.NaN }))).toThrow(
      InputValidationError,
    );
    expect(() => synthesizeLoad(profile([], { timestepS: 5 }))).toThrow(InputValidationError);
    expect(() =>
      synthesizeLoad(
        profile([{ startS: 200, rampDownS: 1, depthFraction: 0.4 }], { durationS: 120 }),
      ),
    ).toThrow(InputValidationError);
  });
});

// ---------------------------------------------------------------------------
// Property tests (fast-check, 200 runs each)
// ---------------------------------------------------------------------------

const pulseArb = (horizonS: number): fc.Arbitrary<GpuPulse> =>
  fc.record({
    startS: fc.double({ min: 0, max: horizonS * 0.9 }).filter(Number.isFinite),
    rampDownS: fc.double({ min: 0.001, max: Math.max(0.01, horizonS / 8) }).filter(Number.isFinite),
    depthFraction: fc.double({ min: 0.05, max: 0.95 }).filter(Number.isFinite),
    durationS: fc.double({ min: 0, max: horizonS / 2 }).filter(Number.isFinite),
    rampUpS: fc.double({ min: 0.001, max: horizonS / 2 }).filter(Number.isFinite),
  });

const profileArb: fc.Arbitrary<LoadProfile> = fc
  .tuple(
    fc.double({ min: 1, max: 500 }).filter(Number.isFinite),
    fc.double({ min: 20, max: 120 }).filter(Number.isFinite),
    fc.integer({ min: 0, max: 4 }),
    fc.double({ min: 0.1, max: 1 }).filter(Number.isFinite),
  )
  .chain(([nominalMW, durationS, count, timestepS]) =>
    fc.tuple(
      fc.constant(nominalMW),
      fc.constant(durationS),
      fc.constant(timestepS),
      fc.array(pulseArb(durationS), { minLength: count, maxLength: count }),
    ),
  )
  .map(([nominalMW, durationS, timestepS, pulses]) => ({
    name: "property",
    nominalMW,
    durationS,
    timestepS,
    pulses,
  }));

const PROPERTY_OPTIONS = { numRuns: 200 };

describe("synthesizeLoad — properties", () => {
  it("keeps every step within [0, nominal] and finite", () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        const series = synthesizeLoad(p);
        for (const power of series.powerMW) {
          expect(Number.isFinite(power)).toBe(true);
          expect(power).toBeGreaterThanOrEqual(-1e-9);
          expect(power).toBeLessThanOrEqual(p.nominalMW * (1 + 1e-9));
        }
        expect(Number.isFinite(series.energyMWh)).toBe(true);
        expect(series.energyMWh).toBeGreaterThanOrEqual(0);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("conserves energy across grid refinement (0.1% per horizon, alias-free)", () => {
    fc.assert(
      fc.property(profileArb, (p) => {
        const coarse = synthesizeLoad(p);
        const fine = synthesizeLoad({ ...p, timestepS: p.timestepS / 7 });
        const reference = fine.energyMWh;
        if (reference === 0) {
          return;
        }
        expect(Math.abs(coarse.energyMWh - reference) / reference).toBeLessThan(1e-6);
        // and against the independent numeric reference integrator
        const numeric = referenceEnergyMWh(p);
        expect(Math.abs(coarse.energyMWh - numeric) / Math.max(numeric, 1e-12)).toBeLessThan(5e-4);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("rejects every invalid mutation of a valid profile", () => {
    const invalidations = fc.constantFrom(
      "nanNominal",
      "negativeNominal",
      "tinyTimestep",
      "hugeTimestep",
      "zeroDepth",
      "overDepth",
      "lateStart",
      "zeroRamp",
    );
    fc.assert(
      fc.property(profileArb, invalidations, (p, kind) => {
        const pulse: GpuPulse = p.pulses[0] ?? { startS: 0, rampDownS: 0.1, depthFraction: 0.4 };
        const rest = p.pulses.slice(1);
        const invalid: LoadProfile = (() => {
          switch (kind) {
            case "nanNominal":
              return { ...p, nominalMW: Number.NaN };
            case "negativeNominal":
              return { ...p, nominalMW: -1 };
            case "tinyTimestep":
              return { ...p, timestepS: 0.00005 };
            case "hugeTimestep":
              return { ...p, timestepS: 5 };
            case "zeroDepth":
              return { ...p, pulses: [{ ...pulse, depthFraction: 0 }, ...rest] };
            case "overDepth":
              return { ...p, pulses: [{ ...pulse, depthFraction: 1.5 }, ...rest] };
            case "lateStart":
              return { ...p, pulses: [{ ...pulse, startS: p.durationS + 1 }, ...rest] };
            case "zeroRamp":
              return { ...p, pulses: [{ ...pulse, rampDownS: 0 }, ...rest] };
          }
        })();
        expect(() => synthesizeLoad(invalid)).toThrow(InputValidationError);
      }),
      PROPERTY_OPTIONS,
    );
  });
});
