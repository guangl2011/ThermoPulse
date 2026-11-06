import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRESETS } from "../lib/presets";
import type { LoadProfileInput } from "../types";
import { LoadProfileForm } from "./LoadProfileForm";

const PROFILE: LoadProfileInput = PRESETS[0]!.loadProfile;

describe("LoadProfileForm", () => {
  it("renders the profile fields with their current values", () => {
    render(<LoadProfileForm value={PROFILE} errors={{}} onChange={() => {}} />);
    const nominal = screen.getByLabelText(/Nominal campus load/) as HTMLInputElement;
    expect(nominal.value).toBe("80");
    const name = screen.getByLabelText("Profile name") as HTMLInputElement;
    expect(name.value).toBe("Training-heavy");
  });

  it("emits a parsed numeric patch on edit", () => {
    const onChange = vi.fn();
    render(<LoadProfileForm value={PROFILE} errors={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Nominal campus load/), { target: { value: "95" } });
    expect(onChange).toHaveBeenLastCalledWith({ nominalMW: 95 });
  });

  it("renders an actionable inline error for an invalid field", () => {
    render(
      <LoadProfileForm
        value={PROFILE}
        errors={{ nominalMW: "Nominal load must be a number greater than 0 MW." }}
        onChange={() => {}}
      />,
    );
    const error = screen.getByRole("alert");
    expect(error.textContent).toMatch(/greater than 0/);
    const field = screen.getByLabelText(/Nominal campus load/);
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });

  it("renders no error message when the profile is valid", () => {
    render(<LoadProfileForm value={PROFILE} errors={{}} onChange={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
