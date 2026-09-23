import {
  branchHoursSummary,
  formatHours,
  formatOperatingDays,
  sortDays,
} from "@/features/branches/hours";
import type { Branch } from "@/types/api";

/**
 * The database stores day CODES and the screens print a RANGE (22 September
 * 2026). What is worth pinning is where that stops being a range: a shop closed
 * mid-week is not one, and forcing it into "Senin – Minggu" would tell every
 * reader the shop is open on days it is shut.
 */
describe("formatOperatingDays", () => {
  it("reads a contiguous run as a range", () => {
    expect(formatOperatingDays(["mon", "tue", "wed", "thu", "fri", "sat"])).toBe(
      "Senin – Sabtu",
    );
    expect(formatOperatingDays(["sat", "sun"])).toBe("Sabtu – Minggu");
  });

  it("lists days that are not a run", () => {
    expect(formatOperatingDays(["mon", "wed", "fri"])).toBe("Sen, Rab, Jum");
  });

  /*
    WEEK ORDER IS MONDAY-FIRST, so Sunday-plus-Monday is NOT contiguous:
    "Minggu – Senin" would be read as every day from Sunday to Monday.
  */
  it("does not wrap the week around", () => {
    expect(formatOperatingDays(["sun", "mon"])).toBe("Sen, Min");
  });

  it("names a single day in full", () => {
    expect(formatOperatingDays(["wed"])).toBe("Rabu");
  });

  it("answers null when nothing was recorded", () => {
    expect(formatOperatingDays([])).toBeNull();
    expect(formatOperatingDays(undefined)).toBeNull();
  });

  it("orders the codes by the week, not by how they were ticked", () => {
    expect(sortDays(["sun", "tue", "mon"])).toEqual(["mon", "tue", "sun"]);
  });
});

describe("formatHours", () => {
  it("joins the pair", () => {
    expect(formatHours("09:00", "20:00")).toBe("09:00 – 20:00");
  });

  /* Null means UNRECORDED, not closed — and half a pair says nothing at all. */
  it("answers null unless both are there", () => {
    expect(formatHours("09:00", null)).toBeNull();
    expect(formatHours(null, null)).toBeNull();
    expect(formatHours(undefined, undefined)).toBeNull();
  });
});

describe("branchHoursSummary", () => {
  const branch = (over: Partial<Branch>) => ({ ...over }) as Branch;

  it("puts the hours and the days on one line", () => {
    expect(
      branchHoursSummary(
        branch({
          openTime: "08:30",
          closeTime: "19:00",
          operatingDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
        }),
      ),
    ).toBe("08:30 – 19:00 · Senin – Sabtu");
  });

  it("says what it has when only one half was recorded", () => {
    expect(branchHoursSummary(branch({ operatingDays: ["sun"] }))).toBe(
      "Minggu",
    );
  });

  /* A branch written before these fields existed comes back without the keys. */
  it("answers null for a branch that recorded none of it", () => {
    expect(branchHoursSummary(branch({ name: "Pusat" }))).toBeNull();
  });
});
