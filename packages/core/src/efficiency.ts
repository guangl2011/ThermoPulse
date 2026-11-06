import { assertValidCommandSeries } from "./validate.js";
import type {
  SofcThermalResult,
  StorageDispatchResult,
  SystemConfig,
  TurbineResult,
} from "./types.js";

/**
 * Reference exhaust temperature (°C) for the heat-exchanger pinch surrogate.
 * Order-of-magnitude SOFC exhaust temperature from domain knowledge, not a
 * session-retrieved measurement; it only shapes the recovery fraction, so a
 * revised figure shifts yields, not verdicts.
 */
export const EXHAUST_REFERENCE_C = 550;

/** Metered energy flows for a composed run, with the three headline efficiencies. */
export interface EfficiencyBreakdown {
  /** SOFC fuel input over the horizon (MWh). */
  fuelEnergyMWh: number;
  /** Every source the horizon drew down: fuel + buffer drawdown + stack heat release. The efficiency denominator. */
  energyInputMWh: number;
  /** Electrical energy delivered at the bus (MWh), net of storage and spills. */
  busElectricalMWh: number;
  /** Turbine energy credited against the exhaust stream (MWh). */
  turbineCreditedMWh: number;
  /** Exhaust enthalpy remaining after the turbine credit (MWh). */
  postTurbineHeatMWh: number;
  /** Cascade heat recovered from the post-turbine stream (MWh). */
  heatRecoveredMWh: number;
  /** Cooling delivered by the absorption chiller (MWh thermal equivalent). */
  chilledEnergyMWh: number;
  /** busElectrical / fuel × 100. */
  electricalEfficiencyPct: number;
  /** heatRecovered / fuel × 100. */
  thermalEfficiencyPct: number;
  /** (busElectrical + heatRecovered) / fuel × 100 — the headline number. */
  combinedEfficiencyPct: number;
}

/**
 * Integrate a per-step power series (MW, values at step ends) over the
 * horizon. Right-rectangle rule, matching the part-1 per-step accumulation.
 */
export function integratePowerMWh(powerMW: readonly number[], timestepS: number): number {
  let energyMJ = 0;
  for (const p of powerMW) {
    energyMJ += p * timestepS;
  }
  return energyMJ / 3600;
}

/**
 * Cascade heat-recovery and electrical-efficiency accounting for one composed
 * run. Pure accounting, no new physics. The models below run in parallel
 * (no exhaust-enthalpy coupling), so the coupling is applied here, and each
 * surrogate assumption is stated:
 *
 * - Combined-cycle credit: the turbine's generated energy is drawn from the
 *   SOFC's rejection stream first (`turbineCredited = min(turbineEnergy,
 *   rejectedHeat)`). Commanded turbine output beyond the stream is ignored
 *   rather than inventing fuel for it.
 * - Recovery pinch: only the post-turbine share of the rejection stream is
 *   recoverable, scaled by a return-water pinch fraction
 *   `1 - returnWaterC / EXHAUST_REFERENCE_C` — hotter return water leaves
 *   less usable ΔT.
 * - Chilling is reported separately and never added to the combined
 *   efficiency: it is the same recovered enthalpy, not additional energy.
 * - Delivery book: the bus sees generation minus energy sent to storage,
 *   minus spills, plus storage discharge.
 * - Denominator: the efficiencies divide by every source the horizon actually
 *   drew down — fuel, net buffer drawdown (discharged beyond charged), and
 *   heat released by the stack's cooling thermal mass. Fuel alone would let a
 *   battery donating its initial charge push combined efficiency past 100%,
 *   which is an accounting artifact, not a physical result. With the full
 *   denominator, delivered energy can never exceed input.
 */
export function accountEfficiency(
  sofc: SofcThermalResult,
  turbine: TurbineResult,
  storage: StorageDispatchResult,
  heatRecovery: SystemConfig["heatRecovery"],
): EfficiencyBreakdown {
  assertValidCommandSeries(turbine.deliveredMW, turbine.timestepS);
  if (!(sofc.fuelEnergyMWh > 0) || !Number.isFinite(sofc.fuelEnergyMWh)) {
    throw new RangeError(
      `sofc.fuelEnergyMWh must be a positive finite number to form efficiencies, got ${String(sofc.fuelEnergyMWh)}.`,
    );
  }

  const fuel = sofc.fuelEnergyMWh;
  const turbineEnergy = integratePowerMWh(turbine.deliveredMW, turbine.timestepS);
  const turbineCredited = Math.min(turbineEnergy, sofc.rejectedHeatMWh);

  const recoveryFraction = Math.min(
    1,
    Math.max(0, 1 - heatRecovery.returnWaterC / EXHAUST_REFERENCE_C),
  );
  const postTurbineHeat = Math.max(0, sofc.rejectedHeatMWh - turbineCredited);
  const heatRecovered = postTurbineHeat * recoveryFraction;

  const busElectrical =
    sofc.electricalEnergyMWh +
    turbineCredited -
    storage.chargedEnergyMWh -
    storage.spilledEnergyMWh +
    storage.dischargedEnergyMWh;

  const energyInputMWh =
    fuel +
    Math.max(0, storage.dischargedEnergyMWh - storage.chargedEnergyMWh) +
    Math.max(0, -sofc.storedHeatDeltaMWh);

  const electricalEfficiencyPct = (busElectrical / energyInputMWh) * 100;
  const thermalEfficiencyPct = (heatRecovered / energyInputMWh) * 100;
  const combinedEfficiencyPct = ((busElectrical + heatRecovered) / energyInputMWh) * 100;

  return {
    fuelEnergyMWh: fuel,
    energyInputMWh,
    busElectricalMWh: busElectrical,
    turbineCreditedMWh: turbineCredited,
    postTurbineHeatMWh: postTurbineHeat,
    heatRecoveredMWh: heatRecovered,
    chilledEnergyMWh: heatRecovered * heatRecovery.absorptionChillerCOP,
    electricalEfficiencyPct,
    thermalEfficiencyPct,
    combinedEfficiencyPct,
  };
}
