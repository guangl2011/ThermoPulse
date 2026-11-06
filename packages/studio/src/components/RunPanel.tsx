import type { JSX } from "react";

interface RunPanelProps {
  /** Disabled while validation errors are present. */
  disabled: boolean;
  /** Why the run is unavailable, shown next to the button when disabled. */
  disabledReason?: string;
  onRun: () => void;
}

/** Run control for the configuration sidebar. */
export function RunPanel({ disabled, disabledReason, onRun }: RunPanelProps): JSX.Element {
  return (
    <div className="tp-run-panel">
      <button type="button" className="tp-button" disabled={disabled} onClick={onRun}>
        Run simulation
      </button>
      {disabled && disabledReason !== undefined && (
        <span className="tp-run-panel__note">{disabledReason}</span>
      )}
    </div>
  );
}
