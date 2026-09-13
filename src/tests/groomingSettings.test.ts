import {
  capacityRows,
  changedOverrides,
  DEFAULT_GROOMING_SETTINGS,
  draftToSettings,
  exampleCommission,
  isDraftDirty,
  nextOverride,
  parseMinutes,
  parsePercent,
  parseRupiah,
  percentOf,
  teamLoad,
  toDraft,
  validateDraft,
  withGroomingDefaults,
  type GroomingSettingsDraft,
} from "@/features/grooming/settings";
import type { GroomerCapacityDay, GroomingSettings } from "@/types/api";

/**
 * Grooming › Pengaturan saves a WHOLE settings object and one PATCH per changed
 * groomer, and draws a worked example of the rule — so the defaults, the
 * rounding and the save plan are the parts worth pinning down.
 */

function settings(
  change: (draft: GroomingSettings) => void = () => {},
): GroomingSettings {
  // A fresh object every time — jsdom has no `structuredClone`.
  const copy = withGroomingDefaults(DEFAULT_GROOMING_SETTINGS);
  change(copy);
  return copy;
}

const day: GroomerCapacityDay = {
  date: "2026-09-13",
  defaultMinutes: 420,
  overLimit: "warn",
  groomers: [
    {
      _id: "u-sinta",
      fullName: "Sinta",
      offReason: null,
      dailyCapacityMin: null,
      capacityMin: 420,
      usedMin: 210,
    },
    {
      _id: "u-rio",
      fullName: "Rio",
      offReason: null,
      dailyCapacityMin: 300,
      capacityMin: 300,
      usedMin: 360,
    },
    {
      _id: "u-dewi",
      fullName: "Dewi",
      offReason: "Cuti",
      dailyCapacityMin: null,
      capacityMin: 420,
      usedMin: 0,
    },
  ],
};

function draftOf(
  base: GroomingSettings = settings(),
  change: (draft: GroomingSettingsDraft) => void = () => {},
): GroomingSettingsDraft {
  const draft = toDraft(base, day);
  change(draft);
  return draft;
}

describe("withGroomingDefaults", () => {
  it("fills every key for a tenant that never saved grooming settings", () => {
    expect(withGroomingDefaults(undefined)).toEqual({
      commission: {
        service: {
          mode: "percentage",
          percent: 0,
          sizeNominal: { small: 0, medium: 0, large: 0 },
        },
        addon: { enabled: false, mode: "percentage", percent: 0, fixed: 0 },
        travel: { enabled: false, mode: "percentage", percent: 0, fixed: 0 },
      },
      capacity: { defaultMinutes: 420, overLimit: "warn" },
    });
  });

  it("keeps what is stored and fills only the holes, key by key", () => {
    const merged = withGroomingDefaults({
      commission: {
        service: { mode: "size_nominal", sizeNominal: { medium: 40000 } },
        addon: { enabled: true, mode: "fixed", fixed: 5000 },
      },
      capacity: { overLimit: "nonsense" },
    });

    expect(merged.commission.service).toEqual({
      mode: "size_nominal",
      percent: 0,
      sizeNominal: { small: 0, medium: 40000, large: 0 },
    });
    expect(merged.commission.addon).toEqual({
      enabled: true,
      mode: "fixed",
      percent: 0,
      fixed: 5000,
    });
    expect(merged.capacity).toEqual({ defaultMinutes: 420, overLimit: "warn" });
  });
});

describe("parsing what was typed", () => {
  it("reads a percentage with either decimal mark, up to 100 and 2 decimals", () => {
    expect(parsePercent("20")).toBe(20);
    expect(parsePercent("12,5")).toBe(12.5);
    expect(parsePercent("12.75")).toBe(12.75);
    expect(parsePercent("100")).toBe(100);
    expect(parsePercent("100,01")).toBeNull();
    expect(parsePercent("12,345")).toBeNull();
    expect(parsePercent("")).toBeNull();
  });

  it("refuses a thousands separator in rupiah — 150.000 is 150 to a parser", () => {
    expect(parseRupiah("25000")).toBe(25000);
    expect(parseRupiah("150.000")).toBeNull();
    expect(parseRupiah("100000001")).toBeNull();
  });

  it("keeps minutes between 1 and 1440", () => {
    expect(parseMinutes("0")).toBeNull();
    expect(parseMinutes("1440")).toBe(1440);
    expect(parseMinutes("1441")).toBeNull();
  });
});

describe("exampleCommission", () => {
  it("takes a percentage of the price, rounded DOWN to the rupiah", () => {
    const result = exampleCommission(
      settings((s) => {
        s.commission.service.percent = 20;
      }),
    );

    expect(result.service.amount).toBe(49_800);
    expect(result.service.basis).toMatch(/^20% × Rp\s?249[.,]000$/);
    expect(result.addon.amount).toBeNull();
    expect(result.total).toBe(49_800);
  });

  it("never lets a float land a rupiah above the server's answer", () => {
    // 249.000 × 33,33% = 82.991,7 — the server floors it.
    expect(percentOf(249_000, 33.33)).toBe(82_991);
    expect(percentOf(70_000, 12.5)).toBe(8_750);
  });

  it("reads the Medium nominal when commission is per size", () => {
    const result = exampleCommission(
      settings((s) => {
        s.commission.service.mode = "size_nominal";
        s.commission.service.sizeNominal = { small: 30000, medium: 45000, large: 60000 };
      }),
    );

    expect(result.service).toEqual({ amount: 45_000, basis: "nominal Sedang" });
  });

  it("adds the add-on, and shows travel without counting it", () => {
    const result = exampleCommission(
      settings((s) => {
        s.commission.service.percent = 20;
        s.commission.addon = { enabled: true, mode: "fixed", percent: 0, fixed: 10_000 };
        s.commission.travel = { enabled: true, mode: "percentage", percent: 10, fixed: 0 };
      }),
    );

    expect(result.addon).toEqual({ amount: 10_000, basis: "nominal tetap per add-on" });
    expect(result.travel.amount).toBe(7_000);
    // Zones and trips do not exist yet, so nothing pays travel.
    expect(result.total).toBe(59_800);
  });
});

describe("the draft", () => {
  it("is not dirty straight after it is read", () => {
    const draft = draftOf();

    expect(isDraftDirty(draft, draftOf(), day)).toBe(false);
  });

  it("is not dirty when a number is retyped in another form", () => {
    const base = settings((s) => {
      s.commission.service.percent = 20;
    });
    const draft = draftOf(base, (d) => {
      d.service.percent = "20,0";
    });

    expect(isDraftDirty(draft, draftOf(base), day)).toBe(false);
  });

  it("is dirty when a box is emptied, even though that is not a number", () => {
    const draft = draftOf(settings(), (d) => {
      d.capacity.defaultMinutes = "";
    });

    expect(isDraftDirty(draft, draftOf(), day)).toBe(true);
  });

  it("checks only the boxes on screen", () => {
    const draft = draftOf(settings(), (d) => {
      d.service.mode = "size_nominal";
      d.service.percent = "abc";
      d.addon = { enabled: false, mode: "fixed", percent: "x", fixed: "y" };
      d.overrides["u-sinta"] = "";
    });

    expect(validateDraft(draft)).toEqual({ "override.u-sinta": expect.any(String) });
  });

  it("builds every key, keeping the stored value for an off-screen box that does not parse", () => {
    const base = settings((s) => {
      s.commission.service.percent = 15;
    });
    const draft = draftOf(base, (d) => {
      d.service.mode = "size_nominal";
      d.service.percent = "abc";
      d.service.sizeNominal = { small: "30000", medium: "45000", large: "60000" };
      d.capacity = { defaultMinutes: "480", overLimit: "block" };
    });

    expect(draftToSettings(draft, base)).toEqual({
      commission: {
        service: {
          mode: "size_nominal",
          percent: 15,
          sizeNominal: { small: 30000, medium: 45000, large: 60000 },
        },
        addon: { enabled: false, mode: "percentage", percent: 0, fixed: 0 },
        travel: { enabled: false, mode: "percentage", percent: 0, fixed: 0 },
      },
      capacity: { defaultMinutes: 480, overLimit: "block" },
    });
  });
});

describe("per-groomer overrides", () => {
  it("clears the override when somebody types the default", () => {
    expect(nextOverride("420", "420")).toBeNull();
    expect(nextOverride("4", "420")).toBe("4");
    expect(nextOverride("480", "420")).toBe("480");
  });

  it("sends one change per groomer whose number moved — and nothing else", () => {
    const draft = draftOf(settings(), (d) => {
      d.overrides["u-sinta"] = "480";
      d.overrides["u-rio"] = null;
      d.overrides["u-dewi"] = null;
    });

    expect(changedOverrides(draft, day)).toEqual([
      { id: "u-sinta", name: "Sinta", dailyCapacityMin: 480 },
      { id: "u-rio", name: "Rio", dailyCapacityMin: null },
    ]);
  });

  it("does not send a box that is still being typed", () => {
    const draft = draftOf(settings(), (d) => {
      d.overrides["u-sinta"] = "";
    });

    expect(changedOverrides(draft, day)).toEqual([]);
  });
});

describe("capacityRows and teamLoad", () => {
  it("draws each groomer against the draft's numbers", () => {
    const rows = capacityRows(
      day,
      draftOf(settings(), (d) => {
        d.capacity.defaultMinutes = "240";
      }),
    );

    expect(rows[0]).toMatchObject({
      name: "Sinta",
      overridden: false,
      capacity: 240,
      used: 210,
      percent: 88,
      overBy: 0,
      tone: "high",
    });
    expect(rows[1]).toMatchObject({
      name: "Rio",
      overridden: true,
      capacity: 300,
      percent: 120,
      overBy: 60,
      tone: "over",
    });
  });

  it("keeps the server's figure while a box is half typed", () => {
    const rows = capacityRows(
      day,
      draftOf(settings(), (d) => {
        d.overrides["u-rio"] = "";
      }),
    );

    expect(rows[1].capacity).toBe(300);
  });

  it("counts nobody on leave towards the team's minutes", () => {
    const load = teamLoad(capacityRows(day, draftOf()));

    // Sinta 420 + Rio 300; Dewi is on leave.
    expect(load).toEqual({ used: 570, capacity: 720, percent: 79, tone: "normal" });
  });

  it("has no percentage when nobody is in", () => {
    expect(teamLoad([])).toEqual({ used: 0, capacity: 0, percent: null, tone: "normal" });
  });
});
