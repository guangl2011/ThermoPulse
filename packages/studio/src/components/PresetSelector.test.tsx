import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PRESETS } from "../lib/presets";
import { PresetSelector } from "./PresetSelector";

describe("PresetSelector", () => {
  it("renders one option per preset with its description", () => {
    render(<PresetSelector presets={PRESETS} activeId="mixed" onSelect={() => {}} />);
    expect(screen.getByRole("group", { name: "Preset load profiles" }).children).toHaveLength(3);
    expect(screen.getByText("Training-heavy")).toBeDefined();
    expect(screen.getByText("Mixed")).toBeDefined();
  });

  it("marks only the active preset as pressed", () => {
    render(<PresetSelector presets={PRESETS} activeId="inference-serving" onSelect={() => {}} />);
    const active = screen.getByRole("button", { name: /Inference-serving/ });
    const inactive = screen.getByRole("button", { name: /Training-heavy/ });
    expect(active.getAttribute("aria-pressed")).toBe("true");
    expect(inactive.getAttribute("aria-pressed")).toBe("false");
  });

  it("reports the selected preset id upward", async () => {
    const onSelect = vi.fn();
    render(<PresetSelector presets={PRESETS} activeId="mixed" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Training-heavy/ }));
    expect(onSelect).toHaveBeenCalledWith("training-heavy");
  });
});
