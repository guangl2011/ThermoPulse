import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { RunnerInputError } from "./lib/runner";

// The runner is pure and fast, so the App tests exercise it for real — the
// module is mocked only to count calls and stub the rejection path.
vi.mock("./lib/runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/runner")>();
  return { ...actual, runSimulation: vi.fn(actual.runSimulation) };
});

async function importRunMock(): Promise<ReturnType<typeof vi.fn>> {
  const runner = await import("./lib/runner");
  return runner.runSimulation as unknown as ReturnType<typeof vi.fn>;
}

describe("App", () => {
  it("renders the shell with presets, both forms, and the empty results state", () => {
    render(<App />);
    expect(screen.getByRole("group", { name: "Preset load profiles" })).toBeDefined();
    expect(screen.getByLabelText("Profile name")).toBeDefined();
    expect(screen.getByLabelText(/SOFC capacity/)).toBeDefined();
    expect(screen.getByText("No assessment yet")).toBeDefined();
    expect(screen.getByLabelText("Results")).toBeDefined();
  });

  it("selecting a preset loads its values into both forms", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Inference-serving/ }));
    const nominal = screen.getByLabelText(/Nominal campus load/) as HTMLInputElement;
    expect(nominal.value).toBe("50");
  });

  it("shows an inline invalid-input message and keeps the run button disabled", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Nominal campus load/), { target: { value: "-5" } });
    expect(screen.getByRole("alert").textContent).toMatch(/greater than 0/);
    const run = screen.getByRole("button", { name: "Run simulation" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(screen.getByText("Fix the highlighted fields to run the simulation.")).toBeDefined();
  });

  it("clears the error state and re-enables the run when a valid value is restored", () => {
    render(<App />);
    const nominal = screen.getByLabelText(/Nominal campus load/);
    fireEvent.change(nominal, { target: { value: "-5" } });
    fireEvent.change(nominal, { target: { value: "72" } });
    expect(screen.queryByRole("alert")).toBeNull();
    const run = screen.getByRole("button", { name: "Run simulation" }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
  });

  it("runs the preset simulation and renders the assessment dashboard", async () => {
    // Preset-to-first-result contract: the preset is preselected, so one
    // click on Run produces the full assessment.
    const runMock = await importRunMock();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(screen.getByTestId("results-body")).toBeDefined();
    expect(screen.getByText("Compliance scorecard")).toBeDefined();
    expect(screen.getByText("SOFC safety envelope")).toBeDefined();
    expect(screen.getByText("Storage shortfalls")).toBeDefined();
    expect(screen.getByText("Efficiency")).toBeDefined();
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("renders the runner's actionable rejection instead of crashing", async () => {
    const runMock = await importRunMock();
    runMock.mockImplementationOnce(() => {
      throw new RunnerInputError(
        "nominalMW must be in (0, 10000] MW. Set nominalMW to the sustained campus load in MW.",
      );
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(screen.getByText("Simulation could not run")).toBeDefined();
    expect(screen.getByText(/nominalMW must be in/)).toBeDefined();
    expect(screen.queryByTestId("results-body")).toBeNull();
  });
});
