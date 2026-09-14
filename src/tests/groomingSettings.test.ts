import {
  capacityRows,
  changedOverrides,
  commissionSizes,
  DEFAULT_GROOMING_SETTINGS,
  draftToSettings,
  exampleCommission,
  isDraftDirty,
  nextOverride,
  parseMinutes,
  parsePercent,
  parseRupiah,
  percentOf,
  RUPIAH_ERROR,
  teamLoad,
  toDraft,
  validateDraft,
  withGroomingDefaults,
  type GroomingSettingsDraft,
} from "@/features/grooming/settings";
import type { GroomerCapacityDay, GroomingSettings } from "@/types/api";

import { makePetOption, PET_OPTION_FIXTURES } from "./helpers/petOptions";

/**
 * Grooming › Pengaturan saves a WHOLE settings object and one PATCH per changed
 * groomer, and draws a worked example of the rule — so the defaults, the
 * rounding and the save plan are the parts worth pinning down.
 *
 * Sizes are the tenant's since 14 September 2026, so every function that lays
 * something out per size is handed the list, built here from the seeded
 * options the way the screen builds it from `usePetOptions()`.
 */

/** Kecil, Sedang, Besar — what every tenant is seeded with, in order. */
const SEEDED_SIZES = PET_OPTION_FIXTURES.filter((option) => option.type === "size");

/** A size a shop added itself, after the seeded three. */
const XL = makePetOption({
  type: "size",
  code: "xl",
  label: "Ekstra besar",
  sortOrder: 3,
});

const SIZES = commissionSizes(SEEDED_SIZES, {});
const SIZES_WITH_XL = commissionSizes([...SEEDED_SIZES, XL], {});

const PRICED = { small: 30000, medium: 45000, large: 60000 };

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
          sizeNominal: {},
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
      sizeNominal: { medium: 40000 },
    });
    expect(merged.commission.addon).toEqual({
      enabled: true,
      mode: "fixed",
      percent: 0,
      fixed: 5000,
    });
    expect(merged.capacity).toEqual({ defaultMinutes: 420, overLimit: "warn" });
  });

  it("keeps a stored nominal whatever its size code, and drops what is not a number", () => {
    const merged = withGroomingDefaults({
      commission: {
        service: { sizeNominal: { xl: 55000, jumbo: 80000, medium: "40000" } },
      },
    });

    expect(merged.commission.service.sizeNominal).toEqual({ xl: 55000, jumbo: 80000 });
  });
});

describe("commissionSizes", () => {
  it("draws every active size in the tenant's order, a size the shop added included", () => {
    expect(SIZES_WITH_XL).toEqual([
      { code: "small", label: "Kecil", retired: false },
      { code: "medium", label: "Sedang", retired: false },
      { code: "large", label: "Besar", retired: false },
      { code: "xl", label: "Ekstra besar", retired: false },
    ]);
  });

  it("shows a retired size only while a nominal is stored for it", () => {
    const options = SEEDED_SIZES.map((option) =>
      option.code === "large" ? { ...option, isActive: false } : option,
    );

    expect(commissionSizes(options, PRICED)).toContainEqual({
      code: "large",
      label: "Besar",
      retired: true,
    });
    expect(commissionSizes(options, { small: 30000 }).map((size) => size.code)).toEqual([
      "small",
      "medium",
    ]);
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
      SIZES,
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

  it("reads the middle active size's nominal when commission is per size", () => {
    const perSize = settings((s) => {
      s.commission.service.mode = "size_nominal";
      s.commission.service.sizeNominal = { ...PRICED, xl: 75000 };
    });

    const result = exampleCommission(perSize, SIZES);
    expect(result.size).toEqual({ code: "medium", label: "Sedang", retired: false });
    expect(result.service).toEqual({ amount: 45_000, basis: "nominal Sedang" });

    // Adding a size at the end does not change the example's animal.
    expect(exampleCommission(perSize, SIZES_WITH_XL).service).toEqual({
      amount: 45_000,
      basis: "nominal Sedang",
    });
  });

  it("says the example's size is not priced yet rather than counting Rp 0", () => {
    const result = exampleCommission(
      settings((s) => {
        s.commission.service.mode = "size_nominal";
      }),
      SIZES,
    );

    expect(result.service).toEqual({ amount: null, basis: "nominal Sedang belum diisi" });
    expect(result.total).toBe(0);
  });

  it("adds the add-on, and shows travel without counting it", () => {
    const result = exampleCommission(
      settings((s) => {
        s.commission.service.percent = 20;
        s.commission.addon = { enabled: true, mode: "fixed", percent: 0, fixed: 10_000 };
        s.commission.travel = { enabled: true, mode: "percentage", percent: 10, fixed: 0 };
      }),
      SIZES,
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

  it("treats a new size's box typed into and cleared again as no change — and an emptied stored one as a change", () => {
    const base = settings((s) => {
      s.commission.service.sizeNominal = { ...PRICED };
    });

    const retyped = draftOf(base, (d) => {
      d.service.sizeNominal.xl = "";
    });
    expect(isDraftDirty(retyped, draftOf(base), day)).toBe(false);

    const emptied = draftOf(base, (d) => {
      d.service.sizeNominal.small = "";
    });
    expect(isDraftDirty(emptied, draftOf(base), day)).toBe(true);
  });

  it("checks only the boxes on screen", () => {
    const base = settings((s) => {
      s.commission.service.sizeNominal = { ...PRICED };
    });
    const draft = draftOf(base, (d) => {
      d.service.mode = "size_nominal";
      d.service.percent = "abc";
      d.addon = { enabled: false, mode: "fixed", percent: "x", fixed: "y" };
      d.overrides["u-sinta"] = "";
    });

    expect(validateDraft(draft, SIZES)).toEqual({ "override.u-sinta": expect.any(String) });
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

describe("nominal per size, on the tenant's own sizes", () => {
  const perSize = settings((s) => {
    s.commission.service.mode = "size_nominal";
    s.commission.service.sizeNominal = { ...PRICED };
  });

  it("holds up the save until a size the shop added is priced — then sends it", () => {
    const empty = draftOf(perSize);
    expect(validateDraft(empty, SIZES_WITH_XL)).toEqual({
      "service.size.xl": RUPIAH_ERROR,
    });

    const priced = draftOf(perSize, (d) => {
      d.service.sizeNominal.xl = "55000";
    });
    expect(validateDraft(priced, SIZES_WITH_XL)).toEqual({});
    expect(draftToSettings(priced, perSize).commission.service.sizeNominal).toEqual({
      ...PRICED,
      xl: 55000,
    });
  });

  it("carries a stored nominal for a size not on screen back unchanged", () => {
    const base = settings((s) => {
      s.commission.service.mode = "size_nominal";
      s.commission.service.sizeNominal = { ...PRICED, jumbo: 80000 };
    });
    const draft = draftOf(base, (d) => {
      d.service.sizeNominal.medium = "50000";
    });

    // "jumbo" is not one of the tenant's sizes, so it is not a row to check…
    expect(validateDraft(draft, SIZES)).toEqual({});
    // …and saving does not delete it.
    expect(draftToSettings(draft, base).commission.service.sizeNominal).toEqual({
      small: 30000,
      medium: 50000,
      large: 60000,
      jumbo: 80000,
    });
  });

  it("sends no key, not a 0, for a size nobody priced while the rule is a percentage", () => {
    const base = settings((s) => {
      s.commission.service.sizeNominal = { ...PRICED };
    });
    const draft = draftOf(base, (d) => {
      d.service.percent = "20";
    });

    expect(validateDraft(draft, SIZES_WITH_XL)).toEqual({});
    expect(draftToSettings(draft, base).commission.service.sizeNominal).toEqual(PRICED);
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
