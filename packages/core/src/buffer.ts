/**
 * SST + hybrid-storage buffering dispatch — the architecture's central claim
 * made executable (spec art_B7GK27w7, D1 part 2).
 *
 * Per-timestep ordering:
 *  1. The net bus load is the synthesized per-step demand (`PulseSeries`).
 *  2. The thermal plant's capability is what it would deliver if commanded to
 *     the full demand — the SOFC through its ramp limiter, the turbine through
 *     its first-order spool response. The transient is the gap between demand
 *     and that capability.
 *  3. The SST + storage layer covers the transient deficit within its power
 *     and energy limits — the SOFC-GT never sees the pulse. Surplus flows the
 *     other way: overgeneration banks in the buffer (spilling when full).
 *  4. Only a shortfall the buffer cannot cover propagates to the thermal
 *     model: the uncovered deficit rides the SOFC command, the rate limiter in
 *     `runSofcThermal` engages, and the tracking error produces the
 *     thermal-stress response. Shortfalls are recorded as unmet energy, never
 *     silently clamped.
 *
 * Command/model consistency: the effective command series uses the thermal
 * models' own update rules (the SOFC rate limiter is idempotent, so its
 * delivery on the capability trajectory equals the capability exactly; the
 * turbine is commanded at its demand-derived obligation, whose delivery
 * reproduces the booked capability). `runSimulation` therefore feeds these
 * commands straight into `runSofcThermal`/`runTurbine` and the energy book
 * closes against the models' own delivered power.
 *
 * Zero storage (powerMW or energyKWh = 0) is legal and degenerates to the
 * part-1 unbuffered allocation: the plant is commanded to the demand every
 * step, which is the pitch's "before" baseline.
 *
 * Pure functions only: no I/O, no clock, no state across calls.
 */
import { at, clamp } from "./math.js";
import type {
  PulseSeries,
  StorageDispatchOptions,
  StorageDispatchResult,
  SystemConfig,
} from "./types.js";
import { assertValidCommandSeries, assertValidSystemConfig } from "./validate.js";

/** Unmet power below this floor is float dust, not a deficit episode (MW). */
export const DEFICIT_EPSILON_MW = 1e-9;

/** kWh -> MJ. */
const KWH_TO_MJ = 3.6;

function assertValidDispatchOptions(options: StorageDispatchOptions): void {
  const soc = options.initialSoCFraction;
  if (soc !== undefined && (!Number.isFinite(soc) || soc <= 0 || soc > 1)) {
    throw new RangeError(
      `initialSoCFraction must be in (0, 1], got ${String(soc)}. Start the buffer between empty-exclusive and full.`,
    );
  }
}

/**
 * Length of step k: the nominal timestep, except a final short step that ends
 * exactly at the horizon (mirrors `synthesizeLoad`'s step grid).
 */
function stepLength(k: number, timestepS: number, horizonS: number): number {
  return Math.min((k + 1) * timestepS, horizonS) - k * timestepS;
}

/**
 * Dispatch the SST + storage layer against a synthesized net load and produce
 * the effective thermal command series plus the storage book.
 */
export function dispatchStorage(
  netLoad: PulseSeries,
  system: SystemConfig,
  options: StorageDispatchOptions = {},
): StorageDispatchResult {
  assertValidSystemConfig(system);
  assertValidCommandSeries(netLoad.powerMW, netLoad.timestepS);
  assertValidDispatchOptions(options);

  const dt = netLoad.timestepS;
  const steps = netLoad.powerMW.length;
  const { sofc, turbine, storage, sst } = system;
  const minMW = sofc.minLoadFraction * sofc.mw;
  const rampStepMW = sofc.maxRampMWPerS * dt;
  const turbDecay = Math.exp(-dt / turbine.responseS);
  const sstFraction = sst.efficiencyPct / 100;
  const powerLimitMW = storage.powerMW;
  const capacityKWh = storage.energyKWh;
  // The buffer is on only when it can both deliver and hold energy; either
  // limit at zero is the unbuffered baseline (part-1 allocation semantics).
  const buffered = powerLimitMW > 0 && capacityKWh > 0;

  // Device-side energy state (kWh). The SST round trip applies on both legs:
  // discharging `assist` MW bus-side draws assist/eta from the cells; banking
  // `charge` MW bus-side stores charge*eta.
  let energyKWh = capacityKWh * (options.initialSoCFraction ?? 1);
  let sofcPrev = minMW;
  let turbPrev = 0;

  const storagePowerMW = new Array<number>(steps);
  const energyTimesS = new Array<number>(steps);
  const energySeries = new Array<number>(steps);
  const sofcCommandMW = new Array<number>(steps);
  const turbineCommandMW = new Array<number>(steps);
  const unmetMW = new Array<number>(steps);
  const storageEvents: { deficitMW: number; durationS: number }[] = [];

  let unmetEnergyMJ = 0;
  let dischargedMJ = 0;
  let chargedMJ = 0;
  let spilledMJ = 0;
  let openEvent: { startK: number; deficitSum: number } | null = null;

  for (let k = 0; k < steps; k++) {
    const demand = at(netLoad.powerMW, k);
    const stepLen = stepLength(k, dt, netLoad.horizonS);
    const energyBudgetMW = (energyKWh * KWH_TO_MJ * sstFraction) / stepLen;

    // Full-demand (unbuffered-style) targets: the SOFC takes what it can
    // (must-run floor to rated), the turbine swings on the residual.
    const sofcFullTarget = clamp(demand, minMW, sofc.mw);
    const turbFullTarget = clamp(demand - sofcFullTarget, 0, turbine.mw);

    let assistPlan = 0;
    let sofcCmd: number;
    if (!buffered) {
      // Unbuffered baseline: the plant is commanded to the demand every step.
      // Identical allocation to part 1's `allocateDemand`.
      sofcCmd = sofcFullTarget;
    } else {
      // Capability: what the plant would deliver this step if commanded to the
      // full demand (the models' own update rules). At k=0 both models start
      // settled at the first command.
      const sofcCapable =
        k === 0
          ? sofcFullTarget
          : sofcPrev + clamp(sofcFullTarget - sofcPrev, -rampStepMW, rampStepMW);
      const turbCapable =
        k === 0 ? turbFullTarget : turbFullTarget + (turbPrev - turbFullTarget) * turbDecay;
      const deficit = Math.max(0, demand - sofcCapable - turbCapable);

      // Dispatch decision: the buffer pre-commits to cover the deficit within
      // power (SST rating) and energy (cells at the current SOC) limits.
      assistPlan = Math.min(deficit, powerLimitMW, energyBudgetMW);
      // Propagation: an uncovered deficit rides the SOFC command. The command
      // then exceeds the plant's capability, the rate limiter engages inside
      // runSofcThermal, and the tracking error drives the stress channel —
      // the "deficit propagates to the thermal model" branch of the spec.
      sofcCmd = clamp(sofcCapable + (deficit - assistPlan), minMW, sofc.mw);
    }

    // Deliveries on the effective commands — the exact update rules the
    // thermal models apply, so the energy book closes against their output.
    const sofcDelivered =
      k === 0
        ? clamp(sofcCmd, minMW, sofc.mw)
        : sofcPrev + clamp(sofcCmd - sofcPrev, -rampStepMW, rampStepMW);
    // The buffered turbine is commanded to the demand residual the buffer is
    // not covering; the unbuffered turbine swings on the plain residual.
    const turbCmd = buffered
      ? clamp(demand - assistPlan - sofcDelivered, 0, turbine.mw)
      : turbFullTarget;
    const turbDelivered =
      k === 0 ? clamp(turbCmd, 0, turbine.mw) : turbCmd + (turbPrev - turbCmd) * turbDecay;
    const generated = sofcDelivered + turbDelivered;

    const shortfall = Math.max(0, demand - generated);
    const overgeneration = Math.max(0, generated - demand);

    // Actual bus assist: with a buffer, it serves whatever the plant could not
    // deliver this step (including turbine-lag residue), within power and
    // energy limits; unmet is what even the buffer cannot cover — recorded,
    // never clamped away. Without a buffer the assist is zero by definition.
    const assist = buffered ? Math.min(shortfall, powerLimitMW, energyBudgetMW) : 0;
    const unmet = shortfall - assist;

    // Charging: surplus generation banks in the buffer within power and
    // headroom limits; whatever fits nowhere is spilled (dumped).
    const headroomMW = ((capacityKWh - energyKWh) * KWH_TO_MJ) / stepLen / sstFraction;
    const charge = buffered ? Math.min(overgeneration, powerLimitMW, headroomMW) : 0;
    spilledMJ += (overgeneration - charge) * stepLen;

    unmetMW[k] = unmet;
    unmetEnergyMJ += unmet * stepLen;
    if (unmet > DEFICIT_EPSILON_MW) {
      if (openEvent === null) {
        openEvent = { startK: k, deficitSum: unmet };
      } else {
        openEvent.deficitSum += unmet;
      }
    } else if (openEvent !== null) {
      const count = k - openEvent.startK;
      storageEvents.push({ deficitMW: openEvent.deficitSum / count, durationS: count * dt });
      openEvent = null;
    }

    // Energy book (device-side kWh), after the bus-side transfer.
    energyKWh -= (assist * stepLen) / (KWH_TO_MJ * sstFraction);
    energyKWh += (charge * stepLen * sstFraction) / KWH_TO_MJ;
    dischargedMJ += assist * stepLen;
    chargedMJ += charge * stepLen;

    storagePowerMW[k] = assist - charge;
    energySeries[k] = energyKWh;
    energyTimesS[k] = stepLen + k * dt;
    sofcCommandMW[k] = sofcCmd;
    turbineCommandMW[k] = turbCmd;
    sofcPrev = sofcDelivered;
    turbPrev = turbDelivered;
  }

  if (openEvent !== null) {
    const count = steps - openEvent.startK;
    storageEvents.push({ deficitMW: openEvent.deficitSum / count, durationS: count * dt });
  }

  return {
    timestepS: dt,
    horizonS: netLoad.horizonS,
    storagePowerMW,
    energyKWh: { timesS: energyTimesS, values: energySeries },
    sofcCommandMW,
    turbineCommandMW,
    unmetMW,
    unmetEnergyMWh: unmetEnergyMJ / 3600,
    storageEvents,
    oversubscribed: sofc.mw + turbine.mw < netLoad.nominalMW,
    dischargedEnergyMWh: dischargedMJ / 3600,
    chargedEnergyMWh: chargedMJ / 3600,
    spilledEnergyMWh: spilledMJ / 3600,
  };
}
