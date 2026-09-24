import {
  CURRENCY_OPTIONS,
  FISCAL_YEAR_OPTIONS,
  TIMEZONE_OPTIONS,
  currencyLabel,
  fiscalYearLabel,
  timezoneLabel,
} from "@/features/tenant/locale";

/**
 * Words for the tenant's locale preferences (23 September 2026). What is worth
 * pinning: each `*label` helper shows an unrecognised value verbatim rather
 * than dropping it — the enums only started being enforced when these fields
 * were added, so a tenant written earlier, or read by an app that has not
 * caught up with a new option, must not throw or go blank.
 */
describe("timezoneLabel", () => {
  it("adds the abbreviation Indonesians say", () => {
    expect(timezoneLabel("Asia/Jakarta")).toBe("Asia/Jakarta (WIB)");
    expect(timezoneLabel("Asia/Makassar")).toBe("Asia/Makassar (WITA)");
    expect(timezoneLabel("Asia/Jayapura")).toBe("Asia/Jayapura (WIT)");
  });

  it("shows an unrecognised zone verbatim", () => {
    expect(timezoneLabel("UTC")).toBe("UTC");
  });
});

describe("currencyLabel", () => {
  it("names Rupiah in full", () => {
    expect(currencyLabel("IDR")).toBe("Rupiah (IDR)");
  });

  it("shows an unrecognised currency verbatim", () => {
    expect(currencyLabel("USD")).toBe("USD");
  });
});

describe("fiscalYearLabel", () => {
  it("names the twelve-month range starting from the given month", () => {
    expect(fiscalYearLabel(1)).toBe("Januari – Desember");
    expect(fiscalYearLabel(4)).toBe("April – Maret");
    expect(fiscalYearLabel(7)).toBe("Juli – Juni");
  });

  it("names an unlisted month by number rather than going blank", () => {
    expect(fiscalYearLabel(3)).toBe("Bulan ke-3");
  });
});

describe("the option lists the pickers are built from", () => {
  it("offers exactly the three official zones", () => {
    expect(TIMEZONE_OPTIONS.map((option) => option.value)).toEqual([
      "Asia/Jakarta",
      "Asia/Makassar",
      "Asia/Jayapura",
    ]);
  });

  it("offers exactly one currency, ready for the day a second one is real", () => {
    expect(CURRENCY_OPTIONS).toEqual([{ value: "IDR", label: "Rupiah (IDR)" }]);
  });

  it("offers the fiscal year's start month as a string, for the select control", () => {
    expect(FISCAL_YEAR_OPTIONS).toEqual([
      { value: "1", label: "Januari – Desember" },
      { value: "4", label: "April – Maret" },
      { value: "7", label: "Juli – Juni" },
    ]);
  });
});
