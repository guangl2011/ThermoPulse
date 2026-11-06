import type { JSX } from "react";
import type { ComplianceStatus } from "../types";

interface StatusBadgeProps {
  status: ComplianceStatus;
}

/** Colored PASS / MARGINAL / FAIL badge driven by the compliance status. */
export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return <span className={`tp-badge tp-badge--${status.toLowerCase()}`}>{status}</span>;
}
