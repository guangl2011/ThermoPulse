import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

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

  it("clears the error state when a valid value is restored", () => {
    render(<App />);
    const nominal = screen.getByLabelText(/Nominal campus load/);
    fireEvent.change(nominal, { target: { value: "-5" } });
    fireEvent.change(nominal, { target: { value: "72" } });
    expect(screen.queryByRole("alert")).toBeNull();
    const run = screen.getByRole("button", { name: "Run simulation" }) as HTMLButtonElement;
    // The engine is wired in D2 part 2, so the run stays disabled — but for
    // the validated-input reason, not the invalid-input reason.
    expect(run.disabled).toBe(true);
    expect(screen.queryByText("Fix the highlighted fields to run the simulation.")).toBeNull();
  });
});
