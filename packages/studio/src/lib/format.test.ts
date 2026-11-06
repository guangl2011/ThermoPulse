import { describe, expect, it } from "vitest";
import { formatNumber, formatPercent } from "./format";

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

describe("formatNumber", () => {
  it("formats with two decimals by default", () => {
    expect(formatNumber(18.5)).toBe("18.50");
  });

  it("honors an explicit decimal count", () => {
    expect(formatNumber(2.44, 1)).toBe("2.4");
  });

  it("rejects non-finite input instead of rendering NaN", () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError);
  });
});
