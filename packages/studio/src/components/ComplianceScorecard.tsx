import type { JSX } from "react";
import type { ComplianceView } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ComplianceScorecardProps {
  compliance: ComplianceView;
}

const CRITERIA: readonly { key: keyof ComplianceView; label: string }[] = [
  { key: "thermalStress", label: "Thermal stress" },
  { key: "surge", label: "Compressor surge" },
  { key: "storageAdequacy", label: "Storage adequacy" },
  { key: "overall", label: "Overall" },
];

/** PASS / MARGINAL / FAIL per compliance criterion, overall last. */
export function ComplianceScorecard({ compliance }: ComplianceScorecardProps): JSX.Element {
  return (
    <table className="tp-scorecard">
      <thead>
        <tr>
          <th scope="col">Criterion</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {CRITERIA.map(({ key, label }) => (
          <tr key={key}>
            <td className="tp-scorecard__criterion">{label}</td>
            <td>
              <StatusBadge status={compliance[key]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
