/**
 * Markdown system-spec export — the AIDC onboarding artifact (spec
 * art_B7GK27w7, D2). Complete on every run, PASS or MARGINAL or FAIL: the
 * document is the record of what was assessed, which configuration produced
 * it, and which fixed model assumptions it rests on. Pure string building —
 * the browser download lives in `download.ts`.
 */
import { FIXED_MODEL_ASSUMPTIONS } from "./runner";
import { formatNumber, formatPercent } from "./format";
import type { LoadProfileInput, ResultsView, SystemConfigInput } from "../types";

const VERDICT_MARKS: Record<ResultsView["compliance"]["overall"], string> = {
  PASS: "PASS — within the engineering envelope",
  MARGINAL: "MARGINAL — inside limits but close to an edge",
  FAIL: "FAIL — outside the engineering envelope",
};

function complianceRow(criterion: string, verdict: string): string {
  return `| ${criterion} | ${verdict} |`;
}

/** File name for the export: the profile name, slugified, so a downloaded
 * assessment is traceable to the profile that produced it. */
export function specFileName(profileName: string): string {
  const slug = profileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `thermopulse-system-spec-${slug || "profile"}.md`;
}

/** Build the complete Markdown system-spec document for one assessment. */
export function buildSystemSpecMarkdown(
  profile: LoadProfileInput,
  config: SystemConfigInput,
  result: ResultsView,
  generatedAt: string,
): string {
  const { compliance } = result;
  const events =
    result.storageEvents.length === 0
      ? "None — the storage layer covered every transient."
      : result.storageEvents
          .map(
            (event, index) =>
              `${index + 1}. Mean unmet power ${formatNumber(event.deficitMW)} MW for ${formatNumber(event.durationS, 1)} s`,
          )
          .join("\n");

  return `# ThermoPulse-AI System Specification

Generated ${generatedAt} by ThermoPulse-AI Studio. This is a surrogate-model
engineering assessment, not a validated digital-twin result.

## Compliance scorecard

| Criterion | Status |
| --- | --- |
${complianceRow("Thermal stress", compliance.thermalStress)}
${complianceRow("Compressor surge", compliance.surge)}
${complianceRow("Storage adequacy", compliance.storageAdequacy)}
${complianceRow("**Overall**", `**${compliance.overall}**`)}

${VERDICT_MARKS[compliance.overall]}

## Campus load profile — ${profile.name}

| Parameter | Value |
| --- | --- |
| Nominal campus load | ${formatNumber(profile.nominalMW, 1)} MW |
| Pulses | ${profile.pulseCount} × ${formatPercent(profile.pulseDepthFraction * 100, 0)} depth |
| Horizon | ${formatNumber(profile.durationS, 1)} s |
| Integration timestep | ${profile.timestepS} s |

## Plant configuration

| Parameter | Value |
| --- | --- |
| SOFC capacity | ${formatNumber(config.sofcMW, 1)} MW |
| SOFC minimum stable load | ${formatPercent(config.sofcMinLoadFraction * 100, 0)} of capacity |
| SOFC fuel-flow ramp limit | ${config.sofcMaxRampMWPerS} MW/s |
| SOFC stack temperature band | ${config.sofcTempBandC[0]}–${config.sofcTempBandC[1]} °C |
| Turbine capacity | ${formatNumber(config.turbineMW, 1)} MW |
| Turbine design surge margin | ${formatPercent(config.turbineSurgeMarginFraction * 100, 0)} |
| Storage power | ${formatNumber(config.storagePowerMW, 1)} MW |
| Storage energy | ${formatNumber(config.storageEnergyKWh, 1)} kWh |
| Storage technology | ${config.storageTechnology} |
| SST topology | ${config.sstTopology} |
| SST efficiency | ${config.sstEfficiencyPct}% |

## Fixed model assumptions (MVP)

These parameters are fixed by the simulation engine in this release; they are
listed so the assessment stays traceable to the model that produced it.

| Parameter | Value |
| --- | --- |
| SOFC thermal time constant | ${FIXED_MODEL_ASSUMPTIONS.sofcThermalTimeConstantS} s |
| Turbine spool response | ${FIXED_MODEL_ASSUMPTIONS.turbineResponseS} s |
| Pulse load-drop duration | ${FIXED_MODEL_ASSUMPTIONS.pulseRampDownS} s (checkpoint-scale) |
| Pulse hold at floor | ${FIXED_MODEL_ASSUMPTIONS.pulseHoldS} s (capped to the pulse spacing) |
| Absorption chiller COP | ${FIXED_MODEL_ASSUMPTIONS.absorptionChillerCOP} |
| Heat-recovery return water | ${FIXED_MODEL_ASSUMPTIONS.returnWaterC} °C |

## Results

- Minimum compressor surge margin over the horizon: ${formatPercent(result.surgeMarginMin * 100)} of design margin.
- Storage buffering shortfalls:
${events}
- Electrical efficiency: ${formatPercent(result.electricalEfficiencyPct)}
- Thermal efficiency (cascade heat recovery): ${formatPercent(result.thermalEfficiencyPct)}
- Combined efficiency: ${formatPercent(result.combinedEfficiencyPct)}
`;
}
