import type { JSX } from "react";
import type { ResultsView } from "../types";
import { ComplianceScorecard } from "./ComplianceScorecard";
import { EfficiencyPanels } from "./EfficiencyPanels";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";
import { ThermalEnvelopeChart } from "./ThermalEnvelopeChart";

interface ResultsDashboardProps {
  /** Null until a simulation run has produced an assessment. */
  result: ResultsView | null;
  /** Actionable message from the runner rejecting the inputs; null when none. */
  error?: string | null;
}

/** Assessment dashboard: compliance scorecard, safety-envelope chart,
 * storage shortfalls, and the efficiency panels. */
export function ResultsDashboard({ result, error = null }: ResultsDashboardProps): JSX.Element {
  if (result === null) {
    return error !== null ? (
      <EmptyState
        title="Simulation could not run"
        message={`${error} Fix the highlighted fields, then run again.`}
      />
    ) : (
      <EmptyState
        title="No assessment yet"
        message="Pick a preset load profile, adjust the plant configuration if you like, and run the simulation to produce your first assessment."
      />
    );
  }
  const { compliance } = result;
  return (
    <div className="tp-stack" data-testid="results-body">
      <div>
        <h3 className="tp-panel__title">Overall status</h3>
        <StatusBadge status={compliance.overall} />
      </div>
      <div>
        <h3 className="tp-panel__title">Compliance scorecard</h3>
        <ComplianceScorecard compliance={compliance} />
      </div>
      <div>
        <h3 className="tp-panel__title">SOFC safety envelope</h3>
        <ThermalEnvelopeChart samples={result.sofcTemperatureC} tempBandC={result.tempBandC} />
        <p className="tp-field__hint">
          Minimum compressor surge margin over the horizon: {result.surgeMarginMin}
        </p>
      </div>
      <div>
        <h3 className="tp-panel__title">Storage shortfalls</h3>
        {result.storageEvents.length === 0 ? (
          <p className="tp-field__hint">No buffering shortfalls — storage covered every pulse.</p>
        ) : (
          <table className="tp-storage-events">
            <thead>
              <tr>
                <th scope="col">Deficit (MW)</th>
                <th scope="col">Duration (s)</th>
              </tr>
            </thead>
            <tbody>
              {result.storageEvents.map((event, index) => (
                <tr key={index}>
                  <td>{event.deficitMW}</td>
                  <td>{event.durationS}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <h3 className="tp-panel__title">Efficiency</h3>
        <EfficiencyPanels
          electricalPct={result.electricalEfficiencyPct}
          thermalPct={result.thermalEfficiencyPct}
          combinedPct={result.combinedEfficiencyPct}
        />
      </div>
    </div>
  );
}
