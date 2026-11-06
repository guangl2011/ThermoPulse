import { describe, expect, it } from "vitest";
import { formatPercent } from "./format";

describe("formatPercent", () => {
  it("formats with one decimal by default", () => {
    expect(formatPercent(72.36)).toBe("72.4%");
  });

  it("honors an explicit decimal count", () => {
    expect(formatPercent(72.361, 2)).toBe("72.36%");
  });

  it("rejects non-finite input instead of rendering NaN", () => {
    expect(() => formatPercent(Number.NaN)).toThrow(RangeError);
  });
});
