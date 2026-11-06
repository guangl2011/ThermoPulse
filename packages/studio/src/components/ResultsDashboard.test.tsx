import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResultsView } from "../types";
import { ComplianceScorecard } from "./ComplianceScorecard";
import { EfficiencyPanels } from "./EfficiencyPanels";
import { ResultsDashboard } from "./ResultsDashboard";
import { ThermalEnvelopeChart } from "./ThermalEnvelopeChart";
import { RunPanel } from "./RunPanel";

const PASSING_RESULT: ResultsView = {
  compliance: {
    thermalStress: "PASS",
    surge: "PASS",
    storageAdequacy: "PASS",
    overall: "PASS",
  },
  sofcTemperatureC: [
    { timeS: 0, tempC: 650 },
    { timeS: 100, tempC: 720 },
    { timeS: 200, tempC: 690 },
  ],
  tempBandC: [600, 850],
  surgeMarginMin: 0.12,
  storageEvents: [],
  electricalEfficiencyPct: 52.3,
  thermalEfficiencyPct: 24.1,
  combinedEfficiencyPct: 76.4,
};

describe("ComplianceScorecard", () => {
  it("renders a row per criterion with its status badge", () => {
    render(<ComplianceScorecard compliance={PASSING_RESULT.compliance} />);
    for (const label of ["Thermal stress", "Compressor surge", "Storage adequacy", "Overall"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getAllByText("PASS")).toHaveLength(4);
  });

  it("renders a FAIL status as its own badge", () => {
    render(
      <ComplianceScorecard
        compliance={{ ...PASSING_RESULT.compliance, surge: "FAIL", overall: "FAIL" }}
      />,
    );
    expect(screen.getAllByText("FAIL")).toHaveLength(2);
  });
});

describe("EfficiencyPanels", () => {
  it("renders the three efficiency figures as percentages", () => {
    render(<EfficiencyPanels electricalPct={52.3} thermalPct={24.1} combinedPct={76.4} />);
    expect(screen.getByText("52.3%")).toBeDefined();
    expect(screen.getByText("24.1%")).toBeDefined();
    expect(screen.getByText("76.4%")).toBeDefined();
  });
});

describe("ThermalEnvelopeChart", () => {
  it("renders the SVG envelope with band labels", () => {
    render(
      <ThermalEnvelopeChart samples={PASSING_RESULT.sofcTemperatureC} tempBandC={[600, 850]} />,
    );
    expect(
      screen.getByRole("img", { name: /SOFC stack temperature against the safe temperature band/ }),
    ).toBeDefined();
    expect(screen.getByText("850 °C")).toBeDefined();
    expect(screen.getByText("600 °C")).toBeDefined();
  });

  it("shows an explanatory note instead of an empty chart", () => {
    render(<ThermalEnvelopeChart samples={[]} tempBandC={[600, 850]} />);
    expect(screen.getByText(/Not enough temperature samples/)).toBeDefined();
  });
});

describe("ResultsDashboard", () => {
  it("shows the empty-state call to action before the first run", () => {
    render(<ResultsDashboard result={null} />);
    expect(screen.getByText("No assessment yet")).toBeDefined();
    expect(screen.getByText(/Pick a preset load profile/)).toBeDefined();
  });

  it("renders the populated dashboard: scorecard, envelope, and efficiency", () => {
    render(<ResultsDashboard result={PASSING_RESULT} />);
    expect(screen.getAllByText("PASS").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Minimum compressor surge margin over the horizon: 0.12/),
    ).toBeDefined();
    expect(screen.getByText("76.4%")).toBeDefined();
    expect(screen.getByText(/No buffering shortfalls/)).toBeDefined();
  });

  it("renders storage shortfall rows when events exist", () => {
    const withEvents: ResultsView = {
      ...PASSING_RESULT,
      storageEvents: [{ deficitMW: 18.5, durationS: 2.4 }],
    };
    render(<ResultsDashboard result={withEvents} />);
    expect(screen.getByText("18.5")).toBeDefined();
    expect(screen.getByText("2.4")).toBeDefined();
  });
});

describe("RunPanel", () => {
  it("disables the run button and explains why while inputs are invalid", () => {
    render(
      <RunPanel
        disabled
        disabledReason="Fix the highlighted fields to run the simulation."
        onRun={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Run simulation" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Fix the highlighted fields to run the simulation.")).toBeDefined();
  });

  it("enables the run button when inputs are valid", () => {
    render(<RunPanel disabled={false} onRun={() => {}} />);
    const button = screen.getByRole("button", { name: "Run simulation" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("notes the missing engine when no run handler is wired", () => {
    render(<RunPanel disabled={false} />);
    const button = screen.getByRole("button", { name: "Run simulation" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      screen.getByText(/simulation runner lands in the next studio deliverable/),
    ).toBeDefined();
  });
});
