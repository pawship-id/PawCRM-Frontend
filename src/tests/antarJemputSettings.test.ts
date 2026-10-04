import {
  commissionOn,
  draftToSettings,
  toDraft,
  validateDraft,
  withAntarJemputDefaults,
} from "@/features/antar-jemput/settings";

/** Layanan › Antar-Jemput › Pengaturan's draft — 21 September 2026. */
describe("antar-jemput commission settings", () => {
  it("reads a tenant that never saved one as no commission", () => {
    expect(withAntarJemputDefaults(undefined)).toEqual({
      commission: {
        service: { mode: "percentage", percent: 0, fixed: 0 },
        addon: { mode: "percentage", percent: 0, fixed: 0 },
      },
    });
  });

  it("round-trips what was typed, rupiah grouped the Indonesian way", () => {
    const stored = withAntarJemputDefaults(undefined);
    const draft = {
      ...toDraft(stored),
      service: { mode: "fixed" as const, percent: "0", fixed: "10.000" },
      addon: { mode: "percentage" as const, percent: "12,5", fixed: "0" },
    };

    expect(validateDraft(draft)).toEqual({});
    expect(draftToSettings(draft, stored).commission).toEqual({
      service: { mode: "fixed", percent: 0, fixed: 10000 },
      addon: { mode: "percentage", percent: 12.5, fixed: 0 },
    });
  });

  it("checks only the box in use", () => {
    const draft = {
      service: { mode: "percentage" as const, percent: "150", fixed: "abc" },
      addon: { mode: "fixed" as const, percent: "abc", fixed: "5000" },
    };

    expect(validateDraft(draft)).toEqual({ "service.percent": "Isi angka 0–100." });
  });

  it("works the example through: a percentage rounds down, a nominal is flat", () => {
    expect(commissionOn({ mode: "percentage", percent: 15, fixed: 0 }, 45_000)).toBe(6750);
    expect(commissionOn({ mode: "percentage", percent: 15, fixed: 0 }, 45_001)).toBe(6750);
    expect(commissionOn({ mode: "fixed", percent: 0, fixed: 10_000 }, 45_000)).toBe(10_000);
  });
});
