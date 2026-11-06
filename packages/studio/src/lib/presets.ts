import type { LoadProfileInput, StorageTechnology, SstTopology, SystemConfigInput } from "../types";

export type PresetId = "training-heavy" | "inference-serving" | "mixed";

export interface StudioPreset {
  id: PresetId;
  label: string;
  description: string;
  loadProfile: LoadProfileInput;
  systemConfig: SystemConfigInput;
}

interface PresetShape {
  id: PresetId;
  label: string;
  description: string;
  load: {
    nominalMW: number;
    pulseDepthFraction: number;
    pulseCount: number;
    durationS: number;
    timestepS: number;
  };
  system: {
    sofcMW: number;
    sofcMinLoadFraction: number;
    sofcMaxRampMWPerS: number;
    tempBandC: [number, number];
    turbineMW: number;
    surgeMarginFraction: number;
    storagePowerMW: number;
    storageEnergyKWh: number;
    storageTechnology: StorageTechnology;
    sstTopology: SstTopology;
    sstEfficiencyPct: number;
  };
}

const PRESET_SHAPES: readonly PresetShape[] = [
  {
    id: "training-heavy",
    label: "Training-heavy",
    description: "Large checkpoint drops at high cadence — the hardest case for thermal following.",
    load: {
      nominalMW: 80,
      pulseDepthFraction: 0.7,
      pulseCount: 12,
      durationS: 3600,
      timestepS: 0.1,
    },
    system: {
      sofcMW: 60,
      sofcMinLoadFraction: 0.4,
      sofcMaxRampMWPerS: 0.5,
      tempBandC: [600, 850],
      turbineMW: 20,
      surgeMarginFraction: 0.1,
      storagePowerMW: 40,
      storageEnergyKWh: 120,
      storageTechnology: "ultracap",
      sstTopology: "dc-coupled-800v",
      sstEfficiencyPct: 97,
    },
  },
  {
    id: "inference-serving",
    label: "Inference-serving",
    description: "Shallow, frequent request-level pulses against a near-flat bus load.",
    load: {
      nominalMW: 50,
      pulseDepthFraction: 0.3,
      pulseCount: 60,
      durationS: 3600,
      timestepS: 0.1,
    },
    system: {
      sofcMW: 40,
      sofcMinLoadFraction: 0.4,
      sofcMaxRampMWPerS: 0.5,
      tempBandC: [600, 850],
      turbineMW: 10,
      surgeMarginFraction: 0.1,
      storagePowerMW: 15,
      storageEnergyKWh: 40,
      storageTechnology: "lithium",
      sstTopology: "ac-coupled",
      sstEfficiencyPct: 97,
    },
  },
  {
    id: "mixed",
    label: "Mixed",
    description: "Training checkpoints overlaid on a serving baseline — the realistic campus day.",
    load: {
      nominalMW: 65,
      pulseDepthFraction: 0.45,
      pulseCount: 30,
      durationS: 3600,
      timestepS: 0.1,
    },
    system: {
      sofcMW: 50,
      sofcMinLoadFraction: 0.4,
      sofcMaxRampMWPerS: 0.5,
      tempBandC: [600, 850],
      turbineMW: 15,
      surgeMarginFraction: 0.1,
      storagePowerMW: 25,
      storageEnergyKWh: 80,
      storageTechnology: "flywheel",
      sstTopology: "dc-coupled-800v",
      sstEfficiencyPct: 97,
    },
  },
];

function toLoadProfile(shape: PresetShape["load"], name: string): LoadProfileInput {
  return { name, ...shape };
}

function toSystemConfig(shape: PresetShape["system"]): SystemConfigInput {
  return {
    sofcMW: shape.sofcMW,
    sofcMinLoadFraction: shape.sofcMinLoadFraction,
    sofcMaxRampMWPerS: shape.sofcMaxRampMWPerS,
    sofcTempBandC: shape.tempBandC,
    turbineMW: shape.turbineMW,
    turbineSurgeMarginFraction: shape.surgeMarginFraction,
    storagePowerMW: shape.storagePowerMW,
    storageEnergyKWh: shape.storageEnergyKWh,
    storageTechnology: shape.storageTechnology,
    sstTopology: shape.sstTopology,
    sstEfficiencyPct: shape.sstEfficiencyPct,
  };
}

/** The three starter profiles behind the studio's empty state: a new user
 * picks one, presses run, and sees a first assessment without typing. */
export const PRESETS: readonly StudioPreset[] = PRESET_SHAPES.map((shape) => ({
  id: shape.id,
  label: shape.label,
  description: shape.description,
  loadProfile: toLoadProfile(shape.load, shape.label),
  systemConfig: toSystemConfig(shape.system),
}));
