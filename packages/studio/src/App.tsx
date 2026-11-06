import type { JSX } from "react";

/**
 * Studio layout shell. The configuration sidebar and results area are
 * composed from presentational components in the studio deliverable;
 * this commit establishes the shell and tokens.
 */
export function App(): JSX.Element {
  return (
    <div className="tp-shell">
      <header className="tp-shell__header">
        <h1 className="tp-shell__title">ThermoPulse-AI Studio</h1>
        <p className="tp-shell__subtitle">
          Sizing and simulation studio for SOFC-GT hybrid power plants serving AI data centers.
        </p>
      </header>
      <div className="tp-shell__body">
        <section className="tp-panel" aria-label="Configuration">
          <h2 className="tp-panel__title">Plant configuration</h2>
        </section>
        <section className="tp-panel" aria-label="Results">
          <h2 className="tp-panel__title">Assessment results</h2>
        </section>
      </div>
    </div>
  );
}
