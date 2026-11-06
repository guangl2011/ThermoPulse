import { describe, expect, it } from "vitest";
import type { ResultsView } from "../types";
import { getPreset } from "./presets";
import { runSimulation } from "./runner";
import { buildSystemSpecMarkdown, specFileName } from "./specExport";

const TRAINING = getPreset("training-heavy");

const PASSING_VIEW: ResultsView = {
  compliance: {
    thermalStress: "PASS",
    surge: "PASS",
    storageAdequacy: "PASS",
    overall: "PASS",
  },
  sofcTemperatureC: [
    { timeS: 0, tempC: 650 },
    { timeS: 100, tempC: 700 },
  ],
  tempBandC: [600, 850],
  surgeMarginMin: 0.62,
  storageEvents: [],
  electricalEfficiencyPct: 52.3,
  thermalEfficiencyPct: 24.1,
  combinedEfficiencyPct: 76.4,
};

const FAILING_VIEW: ResultsView = {
  ...PASSING_VIEW,
  compliance: {
    thermalStress: "FAIL",
    surge: "FAIL",
    storageAdequacy: "FAIL",
    overall: "FAIL",
  },
  storageEvents: [{ deficitMW: 5.65, durationS: 195.1 }],
};

describe("specFileName", () => {
  it("slugs the profile name into the file name", () => {
    expect(specFileName("Training-heavy")).toBe("thermopulse-system-spec-training-heavy.md");
  });

  it("falls back to a generic name for an empty profile name", () => {
    expect(specFileName("   ")).toBe("thermopulse-system-spec-profile.md");
  });
});

describe("buildSystemSpecMarkdown", () => {
  it("contains the compliance scorecard on a PASS run", () => {
    const doc = buildSystemSpecMarkdown(
      TRAINING.loadProfile,
      TRAINING.systemConfig,
      PASSING_VIEW,
      "2026-11-06T00:00:00Z",
    );
    expect(doc).toContain("## Compliance scorecard");
    expect(doc).toContain("| Thermal stress | PASS |");
    expect(doc).toContain("| **Overall** | **PASS** |");
  });

  it("is equally complete on a FAIL run — the document records the failure", () => {
    const doc = buildSystemSpecMarkdown(
      TRAINING.loadProfile,
      TRAINING.systemConfig,
      FAILING_VIEW,
      "2026-11-06T00:00:00Z",
    );
    expect(doc).toContain("## Compliance scorecard");
    expect(doc).toContain("| Compressor surge | FAIL |");
    expect(doc).toContain("| **Overall** | **FAIL** |");
    // Storage shortfalls are listed, never silently clamped away.
    expect(doc).toContain("5.65 MW for 195.1 s");
  });

  it("traces every number to its configuration, including the fixed assumptions", () => {
    const doc = buildSystemSpecMarkdown(
      TRAINING.loadProfile,
      TRAINING.systemConfig,
      PASSING_VIEW,
      "2026-11-06T00:00:00Z",
    );
    expect(doc).toContain("Training-heavy");
    expect(doc).toContain("80.0 MW");
    expect(doc).toContain("600–850 °C");
    expect(doc).toContain("ultracap");
    expect(doc).toContain("dc-coupled-800v");
    expect(doc).toContain("76.4%");
    expect(doc).toContain("Absorption chiller COP | 0.7");
  });

  it("carries the generated-at stamp and the draft-assessment caveat", () => {
    const doc = buildSystemSpecMarkdown(
      TRAINING.loadProfile,
      TRAINING.systemConfig,
      PASSING_VIEW,
      "2026-11-06T00:00:00Z",
    );
    expect(doc).toContain("Generated 2026-11-06T00:00:00Z");
    expect(doc).toContain("not a validated digital-twin result");
  });

  it("matches a real runner output end to end", () => {
    const view = runSimulation({ profile: TRAINING.loadProfile, config: TRAINING.systemConfig });
    const doc = buildSystemSpecMarkdown(
      TRAINING.loadProfile,
      TRAINING.systemConfig,
      view,
      new Date(0).toISOString(),
    );
    expect(doc).toContain("## Compliance scorecard");
    expect(doc).toContain(`| **Overall** | **${view.compliance.overall}** |`);
  });
});
