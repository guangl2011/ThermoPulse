import type { JSX } from "react";
import type { PresetId, StudioPreset } from "../lib/presets";

interface PresetSelectorProps {
  presets: readonly StudioPreset[];
  activeId: PresetId;
  onSelect: (id: PresetId) => void;
}

/** Starter-profile picker. Presentational: renders the presets it is given
 * and reports the chosen id upward. */
export function PresetSelector({ presets, activeId, onSelect }: PresetSelectorProps): JSX.Element {
  return (
    <div className="tp-preset-list" role="group" aria-label="Preset load profiles">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="tp-preset-option"
          aria-pressed={preset.id === activeId}
          onClick={() => onSelect(preset.id)}
        >
          <span className="tp-preset-option__label">{preset.label}</span>
          <span className="tp-preset-option__description">{preset.description}</span>
        </button>
      ))}
    </div>
  );
}
