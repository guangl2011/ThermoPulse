import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { accountEfficiency, EXHAUST_REFERENCE_C, integratePowerMWh } from "./efficiency.js";
import { synthesizeLoad } from "./pulse.js";
import {
  compose,
  referenceSystem,
  thermalResult,
  healthyTurbine,
  healthyStorage,
} from "./testing.js";
import type { LoadProfile, SystemConfig } from "./types.js";

// The correlated scenario generator mirrors the scoring property suite: plant,
// profile, and nominal load come from the same draw so the feasibility filter
// (sofc + turbine >= nominal) is meaningful.
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
      ...referenceSystem(),
      sofc: { ...referenceSystem().sofc, mw: c.sofcMW },
      turbine: { ...referenceSystem().turbine, mw: c.turbineMW },
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

const PROPERTY_OPTIONS = { numRuns: 200 };

function composedBreakdown(cfg: SystemConfig, profile: LoadProfile) {
  const netLoad = synthesizeLoad(profile);
  const { storage, thermal, turbine } = compose(cfg, netLoad);
  return accountEfficiency(thermal, turbine, storage, cfg.heatRecovery);
}

describe("integratePowerMWh", () => {
  it("integrates a constant series exactly (right-rectangle)", () => {
    expect(integratePowerMWh(new Array<number>(600).fill(30), 1)).toBeCloseTo(5, 12);
  });

  it("scales with the timestep", () => {
    expect(integratePowerMWh([10, 10], 0.5)).toBeCloseTo(10 / 3600, 15);
  });
});

describe("accountEfficiency — composed reference run", () => {
  const cfg = referenceSystem();
  const profile: LoadProfile = {
    name: "steady",
    nominalMW: 90,
    durationS: 600,
    timestepS: 1,
    pulses: [],
  };
  const netLoad = synthesizeLoad(profile);
  const { storage, thermal, turbine } = compose(cfg, netLoad);
  const breakdown = accountEfficiency(thermal, turbine, storage, cfg.heatRecovery);

  it("recomputes the electrical efficiency from the delivery book", () => {
    // An idle buffer and a settled stack mean no drawdown beyond fuel.
    expect(storage.chargedEnergyMWh).toBe(0);
    expect(storage.dischargedEnergyMWh).toBe(0);
    expect(Math.abs(thermal.storedHeatDeltaMWh)).toBeLessThan(1e-9);
    const expected =
      ((thermal.electricalEnergyMWh + breakdown.turbineCreditedMWh) / thermal.fuelEnergyMWh) * 100;
    expect(breakdown.electricalEfficiencyPct).toBeCloseTo(expected, 6);
  });

  it("combined equals electrical plus thermal (shared denominator)", () => {
    expect(breakdown.combinedEfficiencyPct).toBeCloseTo(
      breakdown.electricalEfficiencyPct + breakdown.thermalEfficiencyPct,
      10,
    );
  });

  it("converts recovered heat to cooling at the configured COP", () => {
    expect(breakdown.chilledEnergyMWh).toBeCloseTo(
      breakdown.heatRecoveredMWh * cfg.heatRecovery.absorptionChillerCOP,
      12,
    );
  });

  it("recovers less heat with hotter return water", () => {
    const hotter = accountEfficiency(thermal, turbine, storage, {
      ...cfg.heatRecovery,
      returnWaterC: 300,
    });
    expect(hotter.heatRecoveredMWh).toBeLessThan(breakdown.heatRecoveredMWh);
    expect(hotter.thermalEfficiencyPct).toBeLessThan(breakdown.thermalEfficiencyPct);
  });
});

describe("accountEfficiency — accounting guards", () => {
  it("caps the turbine credit at the rejection stream and recovers nothing beyond it", () => {
    // Turbine claims 5 MWh against a 1 MWh rejection stream: credit is capped,
    // leaving nothing to recover.
    const sofc = thermalResult({
      fuelEnergyMWh: 10,
      electricalEnergyMWh: 5,
      rejectedHeatMWh: 1,
      storedHeatDeltaMWh: 4,
    });
    const turbine = { ...healthyTurbine(), deliveredMW: new Array<number>(600).fill(30) };
    const breakdown = accountEfficiency(
      sofc,
      turbine,
      healthyStorage(),
      referenceSystem().heatRecovery,
    );
    expect(breakdown.turbineCreditedMWh).toBeCloseTo(1, 12);
    expect(breakdown.postTurbineHeatMWh).toBe(0);
    expect(breakdown.heatRecoveredMWh).toBe(0);
    expect(breakdown.thermalEfficiencyPct).toBe(0);
  });

  it("never exceeds 100% when the buffer donates its initial charge (regression)", () => {
    // Shrunk counterexample from the bound property: a small-fuel run whose
    // buffer discharges 0.244 MWh while the stack releases 0.098 MWh of
    // stored heat. Counting fuel alone pushed combined past 100%.
    const sofc = thermalResult({
      fuelEnergyMWh: 8.773456810413816,
      electricalEnergyMWh: 4.825401245727644,
      rejectedHeatMWh: 4.045672838618637,
      storedHeatDeltaMWh: -0.09761727393236846,
    });
    const storage = {
      ...healthyStorage(),
      dischargedEnergyMWh: 0.2444127885083485,
      spilledEnergyMWh: 0.07066974923970827,
    };
    const turbine = { ...healthyTurbine(), deliveredMW: new Array<number>(600).fill(8) };
    const b = accountEfficiency(sofc, turbine, storage, referenceSystem().heatRecovery);
    expect(b.energyInputMWh).toBeCloseTo(
      sofc.fuelEnergyMWh + storage.dischargedEnergyMWh - sofc.storedHeatDeltaMWh,
      12,
    );
    expect(b.combinedEfficiencyPct).toBeLessThan(100);
    expect(b.combinedEfficiencyPct).toBeGreaterThan(90); // donation now priced, not hidden
  });

  it("throws on non-positive or non-finite fuel", () => {
    const zeroFuel = thermalResult({ fuelEnergyMWh: 0 });
    expect(() =>
      accountEfficiency(
        zeroFuel,
        healthyTurbine(),
        healthyStorage(),
        referenceSystem().heatRecovery,
      ),
    ).toThrow(RangeError);
    const nanFuel = thermalResult({ fuelEnergyMWh: Number.NaN });
    expect(() =>
      accountEfficiency(
        nanFuel,
        healthyTurbine(),
        healthyStorage(),
        referenceSystem().heatRecovery,
      ),
    ).toThrow(RangeError);
  });

  it("clamps the recovery fraction at zero for return water at the reference exhaust temperature", () => {
    const sofc = thermalResult();
    const breakdown = accountEfficiency(sofc, healthyTurbine(), healthyStorage(), {
      absorptionChillerCOP: 0.7,
      returnWaterC: EXHAUST_REFERENCE_C,
    });
    expect(breakdown.heatRecoveredMWh).toBe(0);
  });
});

describe("efficiency properties", () => {
  it("all three efficiencies stay within [0, 100] across feasible scenarios", () => {
    fc.assert(
      fc.property(scenarioArb, ({ cfg, profile }) => {
        const b = composedBreakdown(cfg, profile);
        for (const pct of [
          b.electricalEfficiencyPct,
          b.thermalEfficiencyPct,
          b.combinedEfficiencyPct,
        ]) {
          expect(pct).toBeGreaterThanOrEqual(-1e-9);
          expect(pct).toBeLessThanOrEqual(100 + 1e-9);
        }
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("thermal yield is non-increasing in return-water temperature", () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        ({ cfg, profile }, cold, warm) => {
          if (cold === warm) return true;
          const low = { ...cfg.heatRecovery, returnWaterC: Math.min(cold, warm) };
          const high = { ...cfg.heatRecovery, returnWaterC: Math.max(cold, warm) };
          const netLoad = synthesizeLoad(profile);
          const { storage, thermal, turbine } = compose(cfg, netLoad);
          const coldYield = accountEfficiency(thermal, turbine, storage, low).thermalEfficiencyPct;
          const warmYield = accountEfficiency(thermal, turbine, storage, high).thermalEfficiencyPct;
          expect(warmYield).toBeLessThanOrEqual(coldYield);
          return true;
        },
      ),
      PROPERTY_OPTIONS,
    );
  });

  it("combined efficiency is at least the larger of its two channels", () => {
    fc.assert(
      fc.property(scenarioArb, ({ cfg, profile }) => {
        const b = composedBreakdown(cfg, profile);
        expect(b.combinedEfficiencyPct).toBeGreaterThanOrEqual(b.electricalEfficiencyPct - 1e-9);
        expect(b.combinedEfficiencyPct).toBeGreaterThanOrEqual(b.thermalEfficiencyPct - 1e-9);
      }),
      PROPERTY_OPTIONS,
    );
  });
});
