import type { JSX } from "react";
import { parseNumberInput } from "../lib/parse";
import type { FieldErrors } from "../lib/validate";
import type { SstTopology, StorageTechnology, SystemConfigInput } from "../types";
import { NumberField, SelectField } from "./ui/fields";

interface SystemConfigFormProps {
  value: SystemConfigInput;
  errors: FieldErrors<SystemConfigInput>;
  onChange: (patch: Partial<SystemConfigInput>) => void;
}

const STORAGE_TECHNOLOGY_OPTIONS = [
  { value: "ultracap", label: "Ultracapacitor" },
  { value: "flywheel", label: "Flywheel" },
  { value: "lithium", label: "Lithium-ion" },
] satisfies { value: StorageTechnology; label: string }[];

const SST_TOPOLOGY_OPTIONS = [
  { value: "ac-coupled", label: "AC-coupled" },
  { value: "dc-coupled-800v", label: "DC-coupled 800 V" },
] satisfies { value: SstTopology; label: string }[];

/** Plant architecture editor (SOFC, turbine, storage, SST). Fully controlled:
 * the current config and its validation errors arrive as props; edits leave
 * as patches. */
export function SystemConfigForm({ value, errors, onChange }: SystemConfigFormProps): JSX.Element {
  return (
    <div className="tp-stack">
      <NumberField
        id="system-sofc-mw"
        label="SOFC capacity"
        unit="MW"
        value={value.sofcMW}
        error={errors.sofcMW}
        onChange={(raw) => onChange({ sofcMW: parseNumberInput(raw) })}
      />
      <NumberField
        id="system-sofc-min-load"
        label="SOFC minimum load"
        value={value.sofcMinLoadFraction}
        step={0.05}
        hint="Minimum stable load as a fraction of capacity."
        error={errors.sofcMinLoadFraction}
        onChange={(raw) => onChange({ sofcMinLoadFraction: parseNumberInput(raw) })}
      />
      <NumberField
        id="system-sofc-ramp"
        label="SOFC ramp limit"
        unit="MW/s"
        value={value.sofcMaxRampMWPerS}
        step={0.1}
        hint="Thermal-inertia constraint the buffer layer protects."
        error={errors.sofcMaxRampMWPerS}
        onChange={(raw) => onChange({ sofcMaxRampMWPerS: parseNumberInput(raw) })}
      />
      <NumberField
        id="system-sofc-temp-min"
        label="SOFC temperature band minimum"
        unit="°C"
        value={value.sofcTempBandC[0]}
        error={errors.sofcTempBandC}
        onChange={(raw) =>
          onChange({ sofcTempBandC: [parseNumberInput(raw), value.sofcTempBandC[1]] })
        }
      />
      <NumberField
        id="system-sofc-temp-max"
        label="SOFC temperature band maximum"
        unit="°C"
        value={value.sofcTempBandC[1]}
        error={errors.sofcTempBandC}
        onChange={(raw) =>
          onChange({ sofcTempBandC: [value.sofcTempBandC[0], parseNumberInput(raw)] })
        }
      />
      <NumberField
        id="system-turbine-mw"
        label="Turbine capacity"
        unit="MW"
        value={value.turbineMW}
        error={errors.turbineMW}
        onChange={(raw) => onChange({ turbineMW: parseNumberInput(raw) })}
      />
      <NumberField
        id="system-turbine-surge"
        label="Compressor surge margin"
        value={value.turbineSurgeMarginFraction}
        step={0.01}
        hint="Surge margin floor as a fraction."
        error={errors.turbineSurgeMarginFraction}
        onChange={(raw) => onChange({ turbineSurgeMarginFraction: parseNumberInput(raw) })}
      />
      <NumberField
        id="system-storage-power"
        label="Storage power"
        unit="MW"
        value={value.storagePowerMW}
        hint="0 on both power and energy gives the unbuffered baseline."
        error={errors.storagePowerMW}
        onChange={(raw) => onChange({ storagePowerMW: parseNumberInput(raw) })}
      />
      <NumberField
        id="system-storage-energy"
        label="Storage energy"
        unit="kWh"
        value={value.storageEnergyKWh}
        error={errors.storagePowerMW}
        onChange={(raw) => onChange({ storageEnergyKWh: parseNumberInput(raw) })}
      />
      <SelectField
        id="system-storage-technology"
        label="Storage technology"
        value={value.storageTechnology}
        options={STORAGE_TECHNOLOGY_OPTIONS}
        onChange={(tech) => onChange({ storageTechnology: tech as StorageTechnology })}
      />
      <SelectField
        id="system-sst-topology"
        label="SST topology"
        value={value.sstTopology}
        options={SST_TOPOLOGY_OPTIONS}
        onChange={(topology) => onChange({ sstTopology: topology as SstTopology })}
      />
      <NumberField
        id="system-sst-efficiency"
        label="SST efficiency"
        unit="%"
        value={value.sstEfficiencyPct}
        step={0.5}
        error={errors.sstEfficiencyPct}
        onChange={(raw) => onChange({ sstEfficiencyPct: parseNumberInput(raw) })}
      />
    </div>
  );
}
