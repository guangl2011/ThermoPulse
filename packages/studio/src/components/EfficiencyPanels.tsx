import type { JSX } from "react";
import { formatPercent } from "../lib/format";

interface EfficiencyPanelsProps {
  electricalPct: number;
  thermalPct: number;
  combinedPct: number;
}

/** The three efficiency figures, with the combined >70% headline number. */
export function EfficiencyPanels({
  electricalPct,
  thermalPct,
  combinedPct,
}: EfficiencyPanelsProps): JSX.Element {
  return (
    <div className="tp-efficiency-grid">
      <div className="tp-efficiency-card">
        <div className="tp-efficiency-card__label">Electrical efficiency</div>
        <div className="tp-efficiency-card__value">{formatPercent(electricalPct)}</div>
      </div>
      <div className="tp-efficiency-card">
        <div className="tp-efficiency-card__label">Thermal efficiency (cascade heat recovery)</div>
        <div className="tp-efficiency-card__value">{formatPercent(thermalPct)}</div>
      </div>
      <div className="tp-efficiency-card">
        <div className="tp-efficiency-card__label">Combined efficiency</div>
        <div className="tp-efficiency-card__value">{formatPercent(combinedPct)}</div>
      </div>
    </div>
  );
}
