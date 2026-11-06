import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";
import { validateLoadProfile, validateSystemConfig } from "./validate";

describe("PRESETS", () => {
  it("offers exactly the three contract presets", () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      "training-heavy",
      "inference-serving",
      "mixed",
    ]);
  });

  it("ships profiles and configs that pass studio validation", () => {
    for (const preset of PRESETS) {
      expect(validateLoadProfile(preset.loadProfile), preset.id).toEqual({});
      expect(validateSystemConfig(preset.systemConfig), preset.id).toEqual({});
    }
  });

  it("names each preset load profile after its label", () => {
    for (const preset of PRESETS) {
      expect(preset.loadProfile.name).toBe(preset.label);
    }
  });
});
