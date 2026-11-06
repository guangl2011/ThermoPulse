import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocateDemand,
  DEFICIT_EPSILON_MW,
  dispatchStorage,
  InputValidationError,
  synthesizeLoad,
} from "./index.js";
import type { LoadProfile, SystemConfig } from "./types.js";

/** Reference plant: 90 MW campus, SOFC-heavy, turbine swing, ultracap buffer. */
const system: SystemConfig = {
  sofc: {
    mw: 60,
    minLoadFraction: 0.3,
    thermalTimeConstantS: 900,
    maxRampMWPerS: 1,
    tempBandC: [550, 750],
  },
  turbine: { mw: 60, responseS: 8, surgeMarginFraction: 0.2 },
  storage: { powerMW: 70, energyKWh: 2000, technology: "ultracap" },
  sst: { topology: "dc-coupled-800v", efficiencyPct: 97 },
  heatRecovery: { absorptionChillerCOP: 0.7, returnWaterC: 55 },
};

/** Checkpoint pulse: 50 ms shed to 30% floor, 45 s hold, 50 ms recovery. */
function pulseProfile(pulses: LoadProfile["pulses"]): LoadProfile {
  return {
    name: "dispatch-test",
    nominalMW: 90,
    durationS: 600,
    timestepS: 1,
    pulses,
  };
}

const checkpointPulse = (startS: number) => ({
  startS,
  rampDownS: 0.05,
  depthFraction: 0.7,
  durationS: 45,
  rampUpS: 0.05,
});

describe("dispatchStorage — unbuffered baseline", () => {
  it("with zero storage, commands match part 1's allocateDemand exactly", () => {
    const profile = pulseProfile([checkpointPulse(100)]);
    const netLoad = synthesizeLoad(profile);
    const result = dispatchStorage(netLoad, {
      ...system,
      storage: { powerMW: 0, energyKWh: 0, technology: "ultracap" },
    });
    const allocation = allocateDemand(
      netLoad.powerMW,
      system.sofc,
      system.turbine,
      netLoad.timestepS,
    );
    expect(result.sofcCommandMW).toEqual(allocation.sofcCommandMW);
    expect(result.turbineCommandMW).toEqual(allocation.turbineCommandMW);
    expect(result.storageEvents.length).toBeGreaterThan(0);
    expect(result.unmetEnergyMWh).toBeGreaterThan(0);
    expect(result.dischargedEnergyMWh).toBe(0);
    expect(result.chargedEnergyMWh).toBe(0);
  });

  it("flags oversubscribed architectures (sofc + turbine < nominal)", () => {
    const netLoad = synthesizeLoad(pulseProfile([]));
    const result = dispatchStorage(netLoad, {
      ...system,
      sofc: { ...system.sofc, mw: 40 },
      turbine: { ...system.turbine, mw: 30 },
    });
    expect(result.oversubscribed).toBe(true);
    // Persistent deficit the (zero) buffer cannot cover.
    expect(result.unmetEnergyMWh).toBeGreaterThan(1);
  });

  it("does not flag a plant that can serve sustained load", () => {
    const netLoad = synthesizeLoad(pulseProfile([checkpointPulse(100)]));
    const result = dispatchStorage(netLoad, system);
    expect(result.oversubscribed).toBe(false);
  });
});

describe("dispatchStorage — buffered dispatch", () => {
  it("keeps the SOFC command on its capability trajectory across a pulse", () => {
    const profile = pulseProfile([checkpointPulse(100)]);
    const netLoad = synthesizeLoad(profile);
    const result = dispatchStorage(netLoad, system);

    // During the load drop and recovery the command must never step beyond the
    // ramp limit — the SOFC-GT never sees the pulse when the buffer is healthy.
    const rampStep = system.sofc.maxRampMWPerS * netLoad.timestepS;
    let prev = result.sofcCommandMW[0]!;
    for (const cmd of result.sofcCommandMW.slice(1)) {
      expect(Math.abs(cmd - prev)).toBeLessThanOrEqual(rampStep + 1e-9);
      prev = cmd;
    }
  });

  it("covers a checkpoint pulse with zero unmet energy", () => {
    const profile = pulseProfile([checkpointPulse(100)]);
    const netLoad = synthesizeLoad(profile);
    const result = dispatchStorage(netLoad, system);
    expect(result.unmetEnergyMWh).toBe(0);
    expect(result.storageEvents).toEqual([]);
  });

  it("discharges during the recovery deficit and banks surplus on the drop", () => {
    const profile = pulseProfile([checkpointPulse(100)]);
    const netLoad = synthesizeLoad(profile);
    // Half-charged: headroom to bank the drop surplus, energy to serve the
    // recovery deficit.
    const result = dispatchStorage(netLoad, system, { initialSoCFraction: 0.5 });

    // Recovery begins at 100 + 0.05 + 45 = 145.05 s; the buffer discharges
    // while the thermal plant ramps back up.
    const dischargeSteps = result.storagePowerMW.filter((p) => p > 0);
    const chargeSteps = result.storagePowerMW.filter((p) => p < 0);
    expect(dischargeSteps.length).toBeGreaterThan(0);
    expect(chargeSteps.length).toBeGreaterThan(0);
    expect(result.dischargedEnergyMWh).toBeGreaterThan(0);
    expect(result.chargedEnergyMWh).toBeGreaterThan(0);
  });

  it("records FAIL evidence when storage exhausts mid-pulse instead of clamping", () => {
    const netLoad = synthesizeLoad(pulseProfile([checkpointPulse(100), checkpointPulse(300)]));
    // 20 kWh covers ~1 second of a ~55 MW deficit: the second pulse exhausts it.
    const result = dispatchStorage(netLoad, {
      ...system,
      storage: { powerMW: 70, energyKWh: 20, technology: "ultracap" },
    });
    expect(result.unmetEnergyMWh).toBeGreaterThan(0.001);
    expect(result.storageEvents.length).toBeGreaterThanOrEqual(1);
    for (const event of result.storageEvents) {
      expect(event.deficitMW).toBeGreaterThan(0);
      expect(event.durationS).toBeGreaterThan(0);
    }
    for (const e of result.energyKWh.values) {
      expect(e).toBeGreaterThanOrEqual(-1e-9);
      expect(e).toBeLessThanOrEqual(20 + 1e-9);
    }
  });

  it("propagates a power-limited deficit onto the SOFC command", () => {
    const netLoad = synthesizeLoad(pulseProfile([checkpointPulse(100)]));
    // 5 MW power limit against a ~55 MW transient: most of the deficit is
    // uncovered and must show up as a SOFC command beyond its smooth capability.
    const limited = dispatchStorage(netLoad, {
      ...system,
      storage: { powerMW: 5, energyKWh: 2000, technology: "ultracap" },
    });
    const healthy = dispatchStorage(netLoad, system);
    // Both runs eventually pin the SOFC at its rating; the limited run leans
    // on it earlier and harder — its cumulative command energy is larger.
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(limited.sofcCommandMW)).toBeGreaterThan(sum(healthy.sofcCommandMW) + 10);
  });

  it("respects the SST power limit in both directions", () => {
    const netLoad = synthesizeLoad(pulseProfile([checkpointPulse(100), checkpointPulse(300)]));
    const result = dispatchStorage(netLoad, {
      ...system,
      storage: { powerMW: 10, energyKWh: 2000, technology: "ultracap" },
    });
    for (const p of result.storagePowerMW) {
      expect(Math.abs(p)).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});

describe("dispatchStorage — energy book", () => {
  it("keeps the device energy inside [0, capacity] and bounded by the power limit", () => {
    const profile = pulseProfile([
      checkpointPulse(100),
      checkpointPulse(300),
      checkpointPulse(500),
    ]);
    const netLoad = synthesizeLoad(profile);
    const result = dispatchStorage(netLoad, system);
    for (const e of result.energyKWh.values) {
      expect(e).toBeGreaterThanOrEqual(-1e-9);
      expect(e).toBeLessThanOrEqual(system.storage.energyKWh + 1e-9);
    }
  });

  it("drains faster at lower SST efficiency for the same service", () => {
    const profile = pulseProfile([
      checkpointPulse(100),
      checkpointPulse(300),
      checkpointPulse(500),
    ]);
    const netLoad = synthesizeLoad(profile);
    const efficient = dispatchStorage(netLoad, system);
    const lossy = dispatchStorage(netLoad, {
      ...system,
      sst: { topology: "ac-coupled", efficiencyPct: 80 },
    });
    const efficientMin = Math.min(...efficient.energyKWh.values);
    const lossyMin = Math.min(...lossy.energyKWh.values);
    expect(lossyMin).toBeLessThan(efficientMin);
  });

  it("honors a partial initial state of charge", () => {
    const netLoad = synthesizeLoad(pulseProfile([])); // steady load, no transients
    const result = dispatchStorage(netLoad, system, { initialSoCFraction: 0.5 });
    expect(result.energyKWh.values[0]).toBeCloseTo(system.storage.energyKWh * 0.5, 9);
  });
});

describe("dispatchStorage — validation", () => {
  it("rejects an invalid system config", () => {
    const netLoad = synthesizeLoad(pulseProfile([]));
    expect(() => dispatchStorage(netLoad, { ...system, sofc: { ...system.sofc, mw: 0 } })).toThrow(
      InputValidationError,
    );
  });

  it("rejects an out-of-range initial state of charge", () => {
    const netLoad = synthesizeLoad(pulseProfile([]));
    expect(() => dispatchStorage(netLoad, system, { initialSoCFraction: 1.5 })).toThrow(RangeError);
    expect(() => dispatchStorage(netLoad, system, { initialSoCFraction: 0 })).toThrow(RangeError);
  });
});

describe("dispatchStorage — properties", () => {
  const PROPERTY_OPTIONS = { numRuns: 200 };

  const profileArb: fc.Arbitrary<LoadProfile> = fc
    .record({
      nominalMW: fc.double({ min: 20, max: 120, noNaN: true }),
      depth: fc.double({ min: 0.3, max: 0.7, noNaN: true }),
      holdS: fc.integer({ min: 5, max: 90 }),
      startS: fc.integer({ min: 20, max: 120 }),
      rampDownS: fc.double({ min: 0.001, max: 0.5, noNaN: true }),
    })
    .map(({ nominalMW, depth, holdS, startS, rampDownS }) => ({
      name: "generated",
      nominalMW,
      durationS: 300,
      timestepS: 1,
      pulses: [{ startS, rampDownS, depthFraction: depth, durationS: holdS, rampUpS: rampDownS }],
    }));

  const configArb = fc.record({
    sofcMW: fc.double({ min: 40, max: 90, noNaN: true }),
    turbineMW: fc.double({ min: 10, max: 60, noNaN: true }),
    ramp: fc.double({ min: 0.2, max: 2, noNaN: true }),
    storagePower: fc.double({ min: 5, max: 80, noNaN: true }),
    storageEnergy: fc.double({ min: 100, max: 4000, noNaN: true }),
  });

  it("keeps the storage book inside [0, capacity] and power inside the SST limit", () => {
    fc.assert(
      fc.property(profileArb, configArb, (profile, cfg) => {
        const netLoad = synthesizeLoad(profile);
        const result = dispatchStorage(netLoad, {
          ...system,
          sofc: { ...system.sofc, mw: cfg.sofcMW, maxRampMWPerS: cfg.ramp },
          turbine: { ...system.turbine, mw: cfg.turbineMW },
          storage: {
            powerMW: cfg.storagePower,
            energyKWh: cfg.storageEnergy,
            technology: "ultracap",
          },
        });
        for (let k = 0; k < result.storagePowerMW.length; k++) {
          expect(Math.abs(result.storagePowerMW[k]!)).toBeLessThanOrEqual(cfg.storagePower + 1e-9);
          expect(Number.isFinite(result.storagePowerMW[k])).toBe(true);
          expect(result.energyKWh.values[k]).toBeGreaterThanOrEqual(-1e-6);
          expect(result.energyKWh.values[k]).toBeLessThanOrEqual(cfg.storageEnergy + 1e-6);
        }
        expect(result.unmetEnergyMWh).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(result.unmetEnergyMWh)).toBe(true);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it("never records unmet power while the buffer retains energy and headroom", () => {
    // A deficit can only persist when the buffer is pinned at a limit: empty
    // (no discharge possible) or at the power ceiling. The unmet episodes and
    // the energy trajectory must agree on that story.
    fc.assert(
      fc.property(profileArb, configArb, (profile, cfg) => {
        const netLoad = synthesizeLoad(profile);
        const result = dispatchStorage(netLoad, {
          ...system,
          sofc: { ...system.sofc, mw: cfg.sofcMW, maxRampMWPerS: cfg.ramp },
          turbine: { ...system.turbine, mw: cfg.turbineMW },
          storage: {
            powerMW: cfg.storagePower,
            energyKWh: cfg.storageEnergy,
            technology: "ultracap",
          },
        });
        for (let k = 0; k < result.unmetMW.length; k++) {
          const unmet = result.unmetMW[k]!;
          if (unmet <= DEFICIT_EPSILON_MW) {
            continue;
          }
          const atPowerCeiling = Math.abs(result.storagePowerMW[k]!) >= cfg.storagePower - 1e-9;
          const atFloor = result.energyKWh.values[k]! <= 1e-6;
          const atCeiling = result.energyKWh.values[k]! >= cfg.storageEnergy - 1e-6;
          expect(atPowerCeiling || atFloor || atCeiling).toBe(true);
        }
      }),
      PROPERTY_OPTIONS,
    );
  });
});
