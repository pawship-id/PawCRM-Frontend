import {
  addonCommission,
  draftToSettings,
  nightCommission,
  toDraft,
  validateDraft,
  withHotelDefaults,
} from "@/features/hotel/settings";

const SMALL = "66f0000000000000000000d1";
const LARGE = "66f0000000000000000000d2";

describe("hotel settings draft", () => {
  it("reads a tenant that never saved one as no commission, night to the PIC", () => {
    const settings = withHotelDefaults(undefined);
    expect(settings.commission.service.mode).toBe("none");
    expect(settings.commission.split).toBe("night_pic");
    expect(settings.commission.addon.mode).toBe("none");
  });

  it("checks only the boxes in use", () => {
    const draft = { ...toDraft(withHotelDefaults(undefined)), serviceMode: "fixed" as const, fixed: "abc", percent: "999" };
    expect(validateDraft(draft, [])).toEqual({ fixed: "Isi rupiah tanpa koma." });
    expect(validateDraft({ ...draft, serviceMode: "size_nominal", sizeNominal: { [SMALL]: "12.000" } }, [SMALL, LARGE])).toEqual({});
  });

  it("saves whole, keeping a stored size nominal that is not on screen", () => {
    const stored = withHotelDefaults({
      commission: {
        service: { mode: "size_nominal", percent: 0, fixed: 0, sizeNominal: { [LARGE]: 18000 } },
        split: "by_step",
        addon: { mode: "percentage", percent: 10, fixed: 0 },
      },
    });
    const draft = { ...toDraft(stored), sizeNominal: { [SMALL]: "12.000" } };
    const saved = draftToSettings(draft, stored);
    expect(saved.commission.service.sizeNominal).toEqual({ [SMALL]: 12000, [LARGE]: 18000 });
    expect(saved.commission.split).toBe("by_step");
  });

  it("works out one night and one add-on", () => {
    const service = { mode: "percentage" as const, percent: 10, fixed: 0, sizeNominal: {} };
    expect(nightCommission(service, 120000, null)).toBe(12000);
    expect(nightCommission({ ...service, mode: "size_nominal", sizeNominal: { [SMALL]: 9000 } }, 0, SMALL)).toBe(9000);
    expect(nightCommission({ ...service, mode: "none" }, 120000, null)).toBe(0);
    expect(addonCommission({ mode: "fixed", percent: 0, fixed: 5000 }, 20000)).toBe(5000);
  });

  it("carries kegiatan harian through the draft, weights and times by name", () => {
    const settings = withHotelDefaults({
      defaultSteps: {
        sessions: ["Makan pagi", "Jalan-jalan"],
        sessionWeights: [60, 40],
        sessionTimes: ["08:00", null],
      },
    });
    const draft = toDraft(settings);
    expect(draft.steps.weights).toEqual({ "Makan pagi": "60", "Jalan-jalan": "40" });
    expect(draft.steps.times).toEqual({ "Makan pagi": "08:00", "Jalan-jalan": "" });
    expect(validateDraft(draft, [])).toEqual({});
    expect(draftToSettings(draft, settings).defaultSteps).toEqual({
      sessions: ["Makan pagi", "Jalan-jalan"],
      sessionWeights: [60, 40],
      sessionTimes: ["08:00", null],
    });

    const off = { ...draft, steps: { ...draft.steps, weights: { "Makan pagi": "60", "Jalan-jalan": "30" } } };
    expect(validateDraft(off, []).steps).toBeTruthy();
  });

  it("drops stored weights that do not line up with the names", () => {
    const settings = withHotelDefaults({
      defaultSteps: { sessions: ["Makan pagi"], sessionWeights: [50, 50], sessionTimes: [] },
    });
    expect(settings.defaultSteps.sessionWeights).toEqual([]);
  });
});
