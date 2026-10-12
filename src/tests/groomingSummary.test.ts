import type { GroomingRow } from "@/features/grooming/board";
import {
  dormantCustomers,
  historyRange,
  newPets,
  rebookRate,
} from "@/features/grooming/summary";

/**
 * Grooming › Ringkasan's history figures — 12 October 2026. What is pinned:
 * the rebook cohort window, who counts as not coming back, and which animals
 * are on their first or second visit.
 */

const NOW = new Date(2026, 9, 12, 12, 0); // 12 Oct 2026, local noon

/** A local date `days` from NOW, at 10:00, as the ISO a booking carries. */
function day(days: number): string {
  const at = new Date(2026, 9, 12 + days, 10, 0);
  return at.toISOString();
}

let seq = 0;
function row(over: {
  petId?: string | null;
  customerId?: string;
  at: string;
  status?: string;
}): GroomingRow {
  seq += 1;
  return {
    key: `bk-${seq}`,
    booking: {
      _id: `bk-${seq}`,
      petId: over.petId === undefined ? "pet-1" : over.petId,
      petName: `Hewan ${over.petId ?? "1"}`,
      customerId: over.customerId ?? "cust-1",
      customerName: `Pelanggan ${over.customerId ?? "1"}`,
      scheduledAt: over.at,
      status: over.status ?? "completed",
    },
  } as unknown as GroomingRow;
}

describe("rebookRate", () => {
  it("counts an animal from the 30–60 day window that came back within 30 days", () => {
    const rows = [
      row({ petId: "a", at: day(-45) }),
      row({ petId: "a", at: day(-20) }), // 25 days later — rebooked
      row({ petId: "b", at: day(-50) }), // never came back
    ];
    expect(rebookRate(rows, NOW)).toEqual({ animals: 2, rebooked: 1, percent: 50 });
  });

  it("measures from the last visit in the window, and counts a booking ahead", () => {
    const rows = [
      row({ petId: "a", at: day(-58) }),
      row({ petId: "a", at: day(-31) }),
      row({ petId: "a", at: day(-5) }), // 26 days after -31
    ];
    expect(rebookRate(rows, NOW).rebooked).toBe(1);
  });

  it("leaves out animals seen only in the last 30 days, and cancelled visits", () => {
    const rows = [
      row({ petId: "a", at: day(-10) }),
      row({ petId: "b", at: day(-40), status: "cancelled" }),
    ];
    expect(rebookRate(rows, NOW)).toEqual({ animals: 0, rebooked: 0, percent: null });
  });
});

describe("dormantCustomers", () => {
  it("lists customers whose last grooming is at least N days ago, longest first", () => {
    const rows = [
      row({ customerId: "x", at: day(-50) }),
      row({ customerId: "y", at: day(-80) }),
      row({ customerId: "z", at: day(-10) }),
    ];
    const out = dormantCustomers(rows, 45, NOW);
    expect(out.map((c) => [c.customerId, c.days])).toEqual([
      ["y", 80],
      ["x", 50],
    ]);
  });

  it("drops a customer with something booked ahead", () => {
    const rows = [
      row({ customerId: "x", at: day(-60) }),
      row({ customerId: "x", at: day(7), status: "confirmed" }),
    ];
    expect(dormantCustomers(rows, 45, NOW)).toEqual([]);
  });
});

describe("newPets", () => {
  const history = historyRange(NOW);

  it("keeps animals on their first or second visit, by lifetime count", () => {
    const period = [
      row({ petId: "new", at: day(-2) }),
      row({ petId: "second", at: day(-3) }),
      row({ petId: "regular", at: day(-4) }),
    ];
    const past = [
      ...period,
      row({ petId: "second", at: day(-40) }),
      row({ petId: "regular", at: day(-40) }),
      row({ petId: "regular", at: day(-80) }),
    ];
    const firsts = new Map([
      ["new", day(-2)],
      ["second", day(-40)],
      ["regular", day(-80)],
    ]);

    const out = newPets(period, past, firsts, history.from, "2026-10-31");
    expect(out.map((p) => [p.petId, p.visit])).toEqual([
      ["new", 1],
      ["second", 2],
    ]);
  });

  it("leaves out an animal whose first visit is older than the history read", () => {
    const period = [row({ petId: "old", at: day(-2) })];
    const firsts = new Map([["old", day(-400)]]);
    expect(newPets(period, period, firsts, history.from, "2026-10-31")).toEqual([]);
  });
});
