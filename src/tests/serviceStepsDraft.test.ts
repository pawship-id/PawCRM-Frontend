import {
  addStep,
  MAX_SESSIONS,
  moveStep,
  removeStep,
  seedSteps,
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
    expect(removed).toEqual({ sessions: ["Mandi"], weights: { Mandi: "70" } });
    // One tahapan takes it all — nothing to split, so nothing is sent.
    expect(stepsPatch(removed)).toEqual({ sessions: ["Mandi"], sessionWeights: [] });
  });

  it("totals what is typed, and says why a wrong total cannot be saved", () => {
    const draft = setWeight(seedSteps(WEIGHTED), "Mandi", "60");

    expect(stepsTotal(draft)).toBe(90);
    expect(stepsProblem(draft)).toBe("Total bobotnya 90%, harus pas 100%.");
    expect(stepsTotal(seedSteps({ ...WEIGHTED, sessionWeights: [] } as Service))).toBeNull();
    expect(stepsTotal({ sessions: ["Mandi"], weights: {} })).toBe(100);
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
});
