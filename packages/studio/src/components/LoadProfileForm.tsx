import type { JSX } from "react";
import { parseNumberInput } from "../lib/parse";
import type { FieldErrors } from "../lib/validate";
import type { LoadProfileInput } from "../types";
import { NumberField, TextField } from "./ui/fields";

interface LoadProfileFormProps {
  value: LoadProfileInput;
  errors: FieldErrors<LoadProfileInput>;
  onChange: (patch: Partial<LoadProfileInput>) => void;
}

/** Campus load-profile editor. Fully controlled: the current profile and its
 * validation errors arrive as props; edits leave as patches. */
export function LoadProfileForm({ value, errors, onChange }: LoadProfileFormProps): JSX.Element {
  return (
    <div className="tp-stack">
      <TextField
        id="load-profile-name"
        label="Profile name"
        value={value.name}
        error={errors.name}
        onChange={(name) => onChange({ name })}
      />
      <NumberField
        id="load-profile-nominal"
        label="Nominal campus load"
        unit="MW"
        value={value.nominalMW}
        error={errors.nominalMW}
        onChange={(raw) => onChange({ nominalMW: parseNumberInput(raw) })}
      />
      <NumberField
        id="load-profile-depth"
        label="Pulse depth"
        value={value.pulseDepthFraction}
        step={0.05}
        hint="Checkpoint / All-Reduce drop as a fraction of nominal load (0.30–0.70)."
        error={errors.pulseDepthFraction}
        onChange={(raw) => onChange({ pulseDepthFraction: parseNumberInput(raw) })}
      />
      <NumberField
        id="load-profile-count"
        label="Pulse count"
        value={value.pulseCount}
        step={1}
        hint="Number of load pulses across the horizon."
        error={errors.pulseCount}
        onChange={(raw) => onChange({ pulseCount: parseNumberInput(raw) })}
      />
      <NumberField
        id="load-profile-duration"
        label="Simulated horizon"
        unit="s"
        value={value.durationS}
        error={errors.durationS}
        onChange={(raw) => onChange({ durationS: parseNumberInput(raw) })}
      />
      <NumberField
        id="load-profile-timestep"
        label="Integration timestep"
        unit="s"
        value={value.timestepS}
        step={0.01}
        hint="0.001–1.0 s; smaller steps resolve faster pulses."
        error={errors.timestepS}
        onChange={(raw) => onChange({ timestepS: parseNumberInput(raw) })}
      />
    </div>
  );
}
