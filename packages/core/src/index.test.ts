import { describe, expect, it } from "vitest";
import { clamp } from "./index.js";

describe("clamp", () => {
  it("returns the value when inside the band", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps below the minimum", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it("clamps above the maximum", () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("rejects NaN instead of propagating it", () => {
    expect(() => clamp(Number.NaN, 0, 10)).toThrow(TypeError);
  });

  it("rejects an inverted band", () => {
    expect(() => clamp(5, 10, 0)).toThrow(RangeError);
  });
});
