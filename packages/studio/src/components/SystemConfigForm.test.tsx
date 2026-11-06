import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRESETS } from "../lib/presets";
import type { SystemConfigInput } from "../types";
import { SystemConfigForm } from "./SystemConfigForm";

const CONFIG: SystemConfigInput = PRESETS[0]!.systemConfig;

describe("SystemConfigForm", () => {
  it("renders plant fields with their current values", () => {
    render(<SystemConfigForm value={CONFIG} errors={{}} onChange={() => {}} />);
    const sofc = screen.getByLabelText(/SOFC capacity/) as HTMLInputElement;
    expect(sofc.value).toBe("60");
    const turbine = screen.getByLabelText(/Turbine capacity/) as HTMLInputElement;
    expect(turbine.value).toBe("20");
  });

  it("renders the storage and SST selects with the configured options", () => {
    render(<SystemConfigForm value={CONFIG} errors={{}} onChange={() => {}} />);
    const technology = screen.getByLabelText("Storage technology") as HTMLSelectElement;
    expect(technology.value).toBe("ultracap");
    const topology = screen.getByLabelText("SST topology") as HTMLSelectElement;
    expect(topology.value).toBe("dc-coupled-800v");
  });

  it("emits a parsed numeric patch on edit", () => {
    const onChange = vi.fn();
    render(<SystemConfigForm value={CONFIG} errors={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/SOFC capacity/), { target: { value: "70" } });
    expect(onChange).toHaveBeenLastCalledWith({ sofcMW: 70 });
  });

  it("renders an inline error message for an invalid field", () => {
    render(
      <SystemConfigForm
        value={CONFIG}
        errors={{ sstEfficiencyPct: "SST efficiency must be between 0 and 100 percent." }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/between 0 and 100/);
  });
});
