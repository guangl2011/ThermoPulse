import type { JSX } from "react";

interface RunPanelProps {
  /** Disabled while validation errors are present. */
  disabled: boolean;
  /** Why the run is unavailable, shown next to the button when disabled. */
  disabledReason?: string;
  /** Absent until the simulation runner is wired in D2 part 2. */
  onRun?: () => void;
}

/** Run control for the configuration sidebar. */
export function RunPanel({ disabled, disabledReason, onRun }: RunPanelProps): JSX.Element {
  const engineNotWired = onRun === undefined;
  const runDisabled = disabled || engineNotWired;
  // Validation problems outrank the missing engine — the user can act on them.
  const note =
    disabled && disabledReason !== undefined
      ? disabledReason
      : engineNotWired
        ? "The simulation runner lands in the next studio deliverable."
        : undefined;
  return (
    <div className="tp-run-panel">
      <button type="button" className="tp-button" disabled={runDisabled} onClick={onRun}>
        Run simulation
      </button>
      {runDisabled && note !== undefined && <span className="tp-run-panel__note">{note}</span>}
    </div>
  );
}
