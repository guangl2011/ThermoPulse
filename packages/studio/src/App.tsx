import { useState } from "react";
import type { JSX } from "react";
import { LoadProfileForm } from "./components/LoadProfileForm";
import { PresetSelector } from "./components/PresetSelector";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { RunPanel } from "./components/RunPanel";
import { SystemConfigForm } from "./components/SystemConfigForm";
import { DEFAULT_PRESET_ID, getPreset, PRESETS } from "./lib/presets";
import type { PresetId } from "./lib/presets";
import { validateLoadProfile, validateSystemConfig } from "./lib/validate";
import type { LoadProfileInput, ResultsView, SystemConfigInput } from "./types";

/**
 * Studio shell: preset selector and configuration forms on the left, the
 * assessment dashboard on the right. State is local to this shell and flows
 * down as props — components stay presentational, with no API calls and no
 * global state reads.
 */
export function App(): JSX.Element {
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET_ID);
  const [loadProfile, setLoadProfile] = useState<LoadProfileInput>(
    getPreset(DEFAULT_PRESET_ID).loadProfile,
  );
  const [systemConfig, setSystemConfig] = useState<SystemConfigInput>(
    getPreset(DEFAULT_PRESET_ID).systemConfig,
  );
  // why: the setter arrives with the runner wiring in D2 part 2; the state
  // slot exists so the shell's shape is already final.
  const [result] = useState<ResultsView | null>(null);

  const loadErrors = validateLoadProfile(loadProfile);
  const configErrors = validateSystemConfig(systemConfig);
  const hasErrors = Object.keys(loadErrors).length > 0 || Object.keys(configErrors).length > 0;

  const selectPreset = (id: PresetId): void => {
    const preset = getPreset(id);
    setPresetId(id);
    setLoadProfile(preset.loadProfile);
    setSystemConfig(preset.systemConfig);
  };

  return (
    <div className="tp-shell">
      <header className="tp-shell__header">
        <h1 className="tp-shell__title">ThermoPulse-AI Studio</h1>
        <p className="tp-shell__subtitle">
          Sizing and simulation studio for SOFC-GT hybrid power plants serving AI data centers.
        </p>
      </header>
      <div className="tp-shell__body">
        <div className="tp-stack">
          <section className="tp-panel" aria-label="Presets">
            <h2 className="tp-panel__title">Start from a preset</h2>
            <PresetSelector presets={PRESETS} activeId={presetId} onSelect={selectPreset} />
          </section>
          <section className="tp-panel" aria-label="Load profile">
            <h2 className="tp-panel__title">Campus load profile</h2>
            <LoadProfileForm
              value={loadProfile}
              errors={loadErrors}
              onChange={(patch) => setLoadProfile((previous) => ({ ...previous, ...patch }))}
            />
          </section>
          <section className="tp-panel" aria-label="Plant configuration">
            <h2 className="tp-panel__title">Plant configuration</h2>
            <SystemConfigForm
              value={systemConfig}
              errors={configErrors}
              onChange={(patch) => setSystemConfig((previous) => ({ ...previous, ...patch }))}
            />
          </section>
          <RunPanel
            disabled={hasErrors}
            disabledReason="Fix the highlighted fields to run the simulation."
          />
        </div>
        <section className="tp-panel" aria-label="Results">
          <h2 className="tp-panel__title">Assessment results</h2>
          <ResultsDashboard result={result} />
        </section>
      </div>
    </div>
  );
}
