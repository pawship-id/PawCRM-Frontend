import {
  addStep,
  clockTimeOf,
  fixedTimeText,
  withoutFixedTimes,
  MAX_SESSIONS,
  moveStep,
  removeStep,
  seedSteps,
  setTime,
  setWeight,
  splitEvenly,
  stepsPatch,
  stepsProblem,
  stepsSignature,
  stepsTotal,
} from "@/features/grooming/serviceStepsDraft";
import type { Service } from "@/types/api";

/**
 * The Tahapan & bobot komisi card's draft — the rules of the list without the list.
 */
const WEIGHTED = {
  _id: "svc-1",
  sessions: ["Mandi", "Blow dry"],
  sessionWeights: [70, 30],
} as unknown as Service;

describe("serviceStepsDraft", () => {
  it("seeds weights by name, and drops weights that do not line up", () => {
    expect(seedSteps(WEIGHTED).weights).toEqual({ Mandi: "70", "Blow dry": "30" });
    expect(
      seedSteps({ ...WEIGHTED, sessionWeights: [100] } as Service).weights,
    ).toEqual({});
  });

  it("adds a tahapan once, whatever its case, and never past the cap", () => {
    const draft = seedSteps(WEIGHTED);

    expect(addStep(draft, "  mandi ")).toBe(draft);
    expect(addStep(draft, "   ")).toBe(draft);
    expect(addStep(draft, " Gunting ").sessions).toEqual(["Mandi", "Blow dry", "Gunting"]);

    const full = {
      sessions: Array.from({ length: MAX_SESSIONS }, (_, index) => `T${index}`),
      weights: {},
      times: {},
    };
    expect(addStep(full, "Satu lagi")).toBe(full);
  });

  it("moves a tahapan with its weight, and removes one with its weight", () => {
    const moved = moveStep(seedSteps(WEIGHTED), 1, 0);
    expect(stepsPatch(moved)).toEqual({
      sessions: ["Blow dry", "Mandi"],
      sessionWeights: [30, 70],
    });
    expect(moveStep(moved, 0, -1)).toBe(moved);

    const removed = removeStep(moved, 0);
    expect(removed).toEqual({ sessions: ["Mandi"], weights: { Mandi: "70" }, times: {} });
    // One tahapan takes it all — nothing to split, so nothing is sent.
    expect(stepsPatch(removed)).toEqual({ sessions: ["Mandi"], sessionWeights: [] });
  });

  it("totals what is typed, and says why a wrong total cannot be saved", () => {
    const draft = setWeight(seedSteps(WEIGHTED), "Mandi", "60");

    expect(stepsTotal(draft)).toBe(90);
    expect(stepsProblem(draft)).toBe("Total bobotnya 90%, harus pas 100%.");
    expect(stepsTotal(seedSteps({ ...WEIGHTED, sessionWeights: [] } as Service))).toBeNull();
    expect(stepsTotal({ sessions: ["Mandi"], weights: {}, times: {} })).toBe(100);
  });

  it("splits evenly into whole per cents that add up to 100", () => {
    const draft = splitEvenly(addStep(seedSteps(WEIGHTED), "Gunting"));

    expect(stepsPatch(draft).sessionWeights).toEqual([34, 33, 33]);
    expect(stepsProblem(draft)).toBeNull();
  });

  it("signs an unchanged draft the same, and a change differently", () => {
    const draft = seedSteps(WEIGHTED);

    expect(stepsSignature(setWeight(draft, "Mandi", " 70 "))).toBe(stepsSignature(draft));
    expect(stepsSignature(moveStep(draft, 0, 1))).not.toBe(stepsSignature(draft));
  });

  it("keeps a hotel tahapan's default time by name, optional, and checks its shape", () => {
    const hotel = {
      ...WEIGHTED,
      sessions: ["Makan pagi", "Bersihkan kandang"],
      sessionWeights: [],
      sessionTimes: ["08:00", null],
    } as Service;
    const draft = seedSteps(hotel);

    expect(draft.times).toEqual({ "Makan pagi": "08:00", "Bersihkan kandang": "" });
    expect(stepsPatch(moveStep(draft, 1, 0), { withTimes: true }).sessionTimes).toEqual([null, "08:00"]);
    expect(stepsPatch(setTime(draft, "Makan pagi", ""), { withTimes: true }).sessionTimes).toEqual([]);
    expect(stepsPatch(draft).sessionTimes).toBeUndefined();
    expect(stepsProblem(setTime(draft, "Makan pagi", "25:00"))).toMatch(/Jam Makan pagi/);
  });
});

describe("addStep with the list's Jam default (hotel) — 22 November 2026", () => {
  const empty = { sessions: [], weights: {}, times: {} };

  it("fills the time the step carries", () => {
    expect(addStep(empty, "Makan pagi", "08:00").times).toEqual({ "Makan pagi": "08:00" });
  });

  it("leaves the time empty when the step has none", () => {
    expect(addStep(empty, "Makan pagi", null).times).toEqual({});
  });

  it("keeps a time already typed for that name", () => {
    const typed = { ...empty, times: { "Makan pagi": "07:30" } };
    expect(addStep(typed, "Makan pagi", "08:00").times).toEqual({ "Makan pagi": "07:30" });
  });
});

describe("clockTimeOf — Jam default (hotel) is free text", () => {
  it("reads a clock time, and nothing else", () => {
    expect(clockTimeOf("08:00")).toBe("08:00");
    expect(clockTimeOf(" 8.30 ")).toBe("08:30");
    expect(clockTimeOf("Ikut jam datang")).toBeNull();
    expect(clockTimeOf("25:00")).toBeNull();
    expect(clockTimeOf(null)).toBeNull();
  });
});

describe("fixedTimeText / withoutFixedTimes — a Jam default written as words", () => {
  it("is the words, never a clock time", () => {
    expect(fixedTimeText("Ikut jam datang")).toBe("Ikut jam datang");
    expect(fixedTimeText("08:00")).toBeNull();
    expect(fixedTimeText("")).toBeNull();
  });

  it("drops the time of a step whose Jam default is words", () => {
    const draft = {
      sessions: ["Check-in", "Makan pagi"],
      weights: {},
      times: { "Check-in": "10:00", "Makan pagi": "08:00" },
    };
    const hotelTime = (name: string) =>
      name === "Check-in" ? "Ikut jam datang" : "08:00";
    expect(withoutFixedTimes(draft, hotelTime).times).toEqual({ "Makan pagi": "08:00" });
  });
});
