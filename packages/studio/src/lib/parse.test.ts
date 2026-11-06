import { describe, expect, it } from "vitest";
import { parseNumberInput } from "./parse";

describe("parseNumberInput", () => {
  it("parses ordinary numeric strings", () => {
    expect(parseNumberInput("42")).toBe(42);
    expect(parseNumberInput(" 0.5 ")).toBe(0.5);
    expect(parseNumberInput("-3")).toBe(-3);
  });

  it("returns NaN for empty or malformed input", () => {
    expect(Number.isNaN(parseNumberInput(""))).toBe(true);
    expect(Number.isNaN(parseNumberInput("   "))).toBe(true);
    expect(Number.isNaN(parseNumberInput("12abc"))).toBe(true);
  });
});
