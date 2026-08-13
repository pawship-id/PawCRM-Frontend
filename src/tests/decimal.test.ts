import {
  absDecimal,
  divideRound,
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
  trimQty,
  weightedAverage,
} from "@/utils/decimal";

/**
 * The decimal helpers carry the same contract as the backend's money util: the
 * API sends amounts as strings so they never pass through a float, and these
 * are what keeps that true once the value is on screen.
 *
 * The weighted-average cases are copied from the backend's own service tests on
 * purpose. If the two ever disagree, a stock form would preview a number the
 * server then refuses to produce — the exact class of bug a shared contract is
 * supposed to make impossible.
 */
describe("toMinor / toDecimalString", () => {
  it("round-trips a decimal string without losing a digit", () => {
    expect(toDecimalString(toMinor("150000.0000")!)).toBe("150000.0000");
    expect(toDecimalString(toMinor("2.5")!)).toBe("2.5000");
    expect(toDecimalString(toMinor("-3")!)).toBe("-3.0000");
  });

  it("returns null for anything that is not a well-formed number", () => {
    // Null rather than 0, so a caller can tell "not a number" from "zero" — on
    // a stock form those are very different answers.
    expect(toMinor("")).toBeNull();
    expect(toMinor("abc")).toBeNull();
    expect(toMinor("1e3")).toBeNull();
    expect(toMinor("1.23456")).toBeNull();
  });

  it("parses a value a float would already have corrupted", () => {
    expect(toDecimalString(toMinor("199999.99")!)).toBe("199999.9900");
  });

  it("rejects exponent notation, which is a serialisation accident", () => {
    expect(isDecimal("1e3")).toBe(false);
    expect(isDecimal("12.5")).toBe(true);
  });
});

describe("weightedAverage", () => {
  const avg = (a: string, q: string, c: string, qi: string) =>
    toDecimalString(
      weightedAverage(toMinor(a)!, toMinor(q)!, toMinor(c)!, toMinor(qi)!),
    );

  it("blends the old cost basis with the arriving one", () => {
    // 10 on hand at 100, plus 10 at 120 → (1000 + 1200) / 20 = 110
    expect(avg("100", "10", "120", "10")).toBe("110.0000");
  });

  it("leaves the average alone when goods arrive at the current cost", () => {
    expect(avg("100", "10", "100", "5")).toBe("100.0000");
  });

  it("takes the incoming cost when there is nothing to weight against", () => {
    expect(avg("0", "0", "77.5", "5")).toBe("77.5000");
  });

  it("ignores negative stock rather than producing a nonsense average", () => {
    // Weighting by a negative quantity can yield a negative cost. The arriving
    // price simply becomes the new one.
    expect(avg("100", "-4", "200", "10")).toBe("200.0000");
  });

  it("rounds half-up rather than truncating", () => {
    // 2 ÷ 3 = 0.6666… → 0.6667. Truncation would bias every recomputed average
    // downward, in the same direction every time.
    expect(avg("0", "1", "1", "2")).toBe("0.6667");
  });
});

describe("divideRound", () => {
  it("rounds at the half, away from zero on both signs", () => {
    expect(divideRound(3n, 2n)).toBe(2n);
    expect(divideRound(-3n, 2n)).toBe(-2n);
    expect(divideRound(1n, 3n)).toBe(0n);
  });

  it("returns zero rather than throwing on a zero denominator", () => {
    expect(divideRound(5n, 0n)).toBe(0n);
  });
});

describe("sumDecimals / multiplyDecimals", () => {
  it("sums exactly where floats would drift", () => {
    expect(sumDecimals(["0.1", "0.2"])).toBe("0.3000");
  });

  it("treats an unparseable entry as zero rather than poisoning the total", () => {
    expect(sumDecimals(["10", null])).toBe("10.0000");
  });

  it("multiplies a quantity by a unit cost", () => {
    expect(multiplyDecimals("3", "243750")).toBe("731250.0000");
    expect(multiplyDecimals("2.5", "31000")).toBe("77500.0000");
  });
});

describe("display helpers", () => {
  it("drops trailing zeros from a quantity so a whole number reads whole", () => {
    expect(formatQty("12.0000")).toBe("12");
    expect(formatQty("2.5000")).toBe("2,5");
  });

  it("renders an em dash for a value that is not a number", () => {
    expect(formatQty(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });

  it("formats rupiah without decimals", () => {
    expect(formatMoney("243750.0000")).toBe("Rp 243.750");
  });

  /**
   * `trimQty` shortens FOR AN INPUT, where `formatQty` localises for reading. A
   * localised number typed back into a form is a payload the API rejects: a
   * decimal comma is not a decimal point.
   */
  describe("trimQty", () => {
    it("drops the stored decimals a person would not type", () => {
      expect(trimQty("10.0000")).toBe("10");
      expect(trimQty("0.0000")).toBe("0");
      expect(trimQty("2.5000")).toBe("2.5");
      expect(trimQty("0.2500")).toBe("0.25");
    });

    it("keeps the decimal POINT, unlike formatQty", () => {
      expect(trimQty("2.5000")).toBe("2.5");
      expect(formatQty("2.5000")).toBe("2,5");
    });

    it("leaves a value on its way to being a number alone", () => {
      // Half-typed: shortening this under the cursor would eat the dot.
      expect(trimQty("1.")).toBe("1.");
      expect(trimQty("")).toBe("");
      expect(trimQty(null)).toBe("");
    });
  });
});

describe("sign helpers", () => {
  it("recognises a positive quantity", () => {
    expect(isPositive("0.0001")).toBe(true);
    expect(isPositive("0")).toBe(false);
    expect(isPositive("-1")).toBe(false);
    expect(isPositive("abc")).toBe(false);
  });

  it("takes the magnitude of a signed quantity", () => {
    expect(absDecimal("-3.5")).toBe("3.5000");
    expect(absDecimal("3.5")).toBe("3.5000");
  });
});
