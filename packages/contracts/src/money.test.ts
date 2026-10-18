import { describe, expect, it } from "vitest";
import { microsToUsd, usdToMicros } from "./money";

describe("decimal-safe USD", () => {
  it.each([
    ["0", 0n], ["5.00", 5_000_000n], ["0.010000", 10_000n], ["0.000001", 1n], ["123.456789", 123_456_789n],
  ])("parses %s", (v, m) => expect(usdToMicros(v)).toBe(m));

  it("rejects >6 decimals, negatives, exponents and junk", () => {
    for (const bad of ["0.0000001", "-1", "1e3", "", "1.", ".5", "abc"]) {
      expect(() => usdToMicros(bad)).toThrow(/invalid USD/);
    }
  });

  it("round-trips", () => {
    expect(microsToUsd(10_000n)).toBe("0.010000");
    expect(microsToUsd(5_000_000n)).toBe("5.000000");
    expect(microsToUsd(0n)).toBe("0.000000");
    expect(() => microsToUsd(-1n)).toThrow(/negative/);
  });

  it("does not lose precision where floats do", () => {
    expect(usdToMicros("0.1") + usdToMicros("0.2")).toBe(usdToMicros("0.3"));
  });
});
