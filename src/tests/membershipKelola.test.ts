import {
  addDays,
  addMonths,
  canMoveRow,
  diffDays,
  hasUsage,
  periodOf,
  planEnd,
  previewAdjustDates,
  previewAdjustQuota,
  previewMoveRedemption,
  previewPause,
  previewTransfer,
  transferBlockReason,
} from "@/features/memberships/kelola";
import { kelolaRows } from "@/features/memberships/components/MembershipCardDetail";

import { benefitAvailability, membershipCard, redemption } from "./helpers/membershipFixture";

/** Midday LOCAL time, so the calendar day is the same in every timezone the suite runs in. */
const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).toISOString();

/** A card that ran 1 Oct 2026 – 31 Mar 2027 (6 months), anniversary periods. */
const base = (overrides: Parameters<typeof membershipCard>[0] = {}) =>
  membershipCard({
    startDate: at(2026, 10, 1),
    endDate: at(2027, 3, 31),
    ...overrides,
  });

const unused = benefitAvailability({ usedTotal: 0, usedThisPeriod: 0, used: 0, remaining: 3 });
const TODAY = "2026-10-16";

/**
 * The Kelola dialogs' forecast (`features/memberships/kelola.ts`). What it
 * protects: the preview box is the only place somebody sees the effect of a
 * change before it is written — a wrong "Berakhir baru" or a missed "kuota
 * periode tujuan sudah habis" is a change made on a false promise.
 */
describe("calendar arithmetic", () => {
  it("clamps a month step to the shorter month, counted from the same anchor", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(diffDays("2026-10-01", "2026-10-15")).toBe(14);
  });

  it("ends a month-based plan N months less a day after its start, a day-based one N−1 days after", () => {
    expect(planEnd("2026-10-01", { durationMonths: 6 })).toBe("2027-03-31");
    expect(planEnd("2026-10-01", { durationMonths: null, durationDays: 30 })).toBe("2026-10-30");
  });
});

describe("adjust-dates", () => {
  it("moves the end and says by how many days", () => {
    const preview = previewAdjustDates(base(), { mode: "end", date: "2027-04-07" }, TODAY);

    expect(preview.errors).toEqual([]);
    expect(preview.rows).toContainEqual(
      expect.objectContaining({ label: "Perubahan", value: "+7 hari", tone: "success" }),
    );
  });

  it("refuses an end before today", () => {
    const preview = previewAdjustDates(base(), { mode: "end", date: "2026-10-10" }, TODAY);
    expect(preview.errors).toContain("Tanggal berakhir tidak boleh sebelum hari ini.");
  });

  it("shifts the start with the plan length and the days added since", () => {
    // 6 months from 1 Oct ends 31 Mar; this card was extended to 7 Apr (+7).
    const card = base({ endDate: at(2027, 4, 7), benefits: [unused] });
    const preview = previewAdjustDates(card, { mode: "start", date: "2026-10-10" }, TODAY);

    expect(preview.errors).toEqual([]);
    expect(preview.rows[0].value).toMatch(/10 Okt 2026 – 16 Apr 2027/);
  });

  it("will not shift the start once anything was spent", () => {
    const preview = previewAdjustDates(base(), { mode: "start", date: "2026-10-10" }, TODAY);
    expect(preview.errors[0]).toMatch(/Tanggal mulai tidak bisa digeser/);
  });
});

describe("pause", () => {
  it("previews the pause window and the end it pushes back", () => {
    const preview = previewPause(base(), { startDate: "2026-10-20", days: 7 }, TODAY);

    expect(preview.errors).toEqual([]);
    expect(preview.rows[0].value).toMatch(/20 Okt 2026 – 26 Okt 2026/);
    expect(preview.rows[1].value).toMatch(/7 Apr 2027/);
  });

  it("counts earlier pauses against the 30-day budget", () => {
    const card = base({
      pauses: [
        {
          id: "p1",
          startDate: at(2026, 10, 2),
          endDate: at(2026, 10, 27),
          days: 25,
          reason: "Lainnya",
          note: null,
          createdBy: null,
          createdAt: null,
        },
      ],
    });
    const preview = previewPause(card, { startDate: "2026-11-01", days: 7 }, TODAY);
    expect(preview.errors.join(" ")).toMatch(/Maksimal 30 hari per keanggotaan/);
  });

  it("refuses more than 30 days at once, a start in the past, and an overlap", () => {
    expect(previewPause(base(), { startDate: "2026-10-20", days: 31 }, TODAY).errors).toContain(
      "Lama tunda 1–30 hari.",
    );
    expect(previewPause(base(), { startDate: "2026-10-01", days: 3 }, TODAY).errors).toContain(
      "Mulai ditunda tidak boleh sebelum hari ini.",
    );
    const paused = base({
      pauses: [
        {
          id: "p1",
          startDate: at(2026, 10, 20),
          endDate: at(2026, 10, 25),
          days: 5,
          reason: "Lainnya",
          note: null,
          createdBy: null,
          createdAt: null,
        },
      ],
    });
    expect(previewPause(paused, { startDate: "2026-10-22", days: 3 }, TODAY).errors).toContain(
      "Bertabrakan dengan penundaan sebelumnya.",
    );
  });
});

describe("adjust-quota", () => {
  it("shows old → new per corrected benefit", () => {
    const preview = previewAdjustQuota(base(), { "ben-groom": 1 });
    expect(preview.rows).toEqual([expect.objectContaining({ label: "Grooming", value: "3 → 4" })]);
    expect(preview.errors).toEqual([]);
  });

  it("will not take a cap below what was already used", () => {
    const preview = previewAdjustQuota(base(), { "ben-groom": -3 });
    expect(preview.errors[0]).toMatch(/tidak boleh di bawah yang sudah terpakai \(1\)/);
  });

  it("says when nothing is corrected yet", () => {
    expect(previewAdjustQuota(base(), {}).empty).toBe("Belum ada penyesuaian.");
  });
});

describe("move redemption", () => {
  it("names the anniversary month a row moves between", () => {
    expect(periodOf(base(), { perPeriod: 1, period: "month" }, "2026-11-05")?.key).toBe("M2");
    expect(periodOf(base(), { perPeriod: 1, period: "week" }, "2026-10-08")?.key).toBe("W2");
    expect(periodOf(base(), { total: 4 }, "2026-11-05")).toBeNull();
  });

  it("refuses a target month whose quota is full, and suggests Koreksi jatah", () => {
    const one = benefitAvailability({ quota: { total: null, perPeriod: 1, period: "month" }, cap: 1 });
    const row = redemption({ id: "r1", usedAt: at(2026, 10, 5) });
    const card = base({
      benefits: [one],
      redemptions: [row, redemption({ id: "r2", usedAt: at(2026, 11, 3) })],
    });

    const preview = previewMoveRedemption(card, row, "2026-11-04");
    expect(preview.rows).toContainEqual(
      expect.objectContaining({ label: "Periode jatah", value: "bulan ke-1 → bulan ke-2" }),
    );
    expect(preview.errors[0]).toMatch(/Kuota periode tujuan sudah habis/);
  });

  it("counts a correction on the target month", () => {
    const one = benefitAvailability({ quota: { total: null, perPeriod: 1, period: "month" }, cap: 1 });
    const row = redemption({ id: "r1", usedAt: at(2026, 10, 5) });
    const card = base({
      benefits: [one],
      redemptions: [row, redemption({ id: "r2", usedAt: at(2026, 11, 3) })],
      quotaAdjustments: [
        {
          id: "q1",
          benefitId: "ben-groom",
          periodKey: "M2",
          delta: 1,
          reason: "Lainnya",
          note: null,
          createdBy: null,
          createdAt: null,
        },
      ],
    });

    expect(previewMoveRedemption(card, row, "2026-11-04").errors).toEqual([]);
  });

  it("refuses a date outside the term", () => {
    const row = redemption();
    expect(previewMoveRedemption(base({ redemptions: [row] }), row, "2027-05-01").errors).toContain(
      "Tanggal harus di dalam masa berlaku.",
    );
  });

  it("only offers live spends of a counted benefit", () => {
    const card = base();
    expect(canMoveRow(card, redemption())).toBe(true);
    expect(canMoveRow(card, redemption({ reversedAt: at(2026, 10, 6) }))).toBe(false);
    expect(canMoveRow(card, redemption({ amount: -1, reversalOf: "red-0" }))).toBe(false);
    const unlimited = base({
      benefits: [benefitAvailability({ quota: { total: null, perPeriod: null, period: null }, unlimited: true, cap: null })],
    });
    expect(canMoveRow(unlimited, redemption())).toBe(false);
  });
});

describe("transfer", () => {
  it("disables another species and an animal that already holds a card", () => {
    const card = base({ plan: { ...base().plan, petSpecies: ["sp-cat"] } });
    const held = new Set(["pet-3"]);

    expect(transferBlockReason({ _id: "pet-2", species: "sp-dog" }, card, held)).toBe(
      "jenis hewan tidak sesuai paket",
    );
    expect(transferBlockReason({ _id: "pet-3", species: "sp-cat" }, card, held)).toBe(
      "sudah punya membership",
    );
    expect(transferBlockReason({ _id: "pet-4", species: "sp-cat" }, card, held)).toBeNull();
  });

  it("previews from → to once a pet is picked", () => {
    expect(previewTransfer(base(), null).empty).toBe("Pilih hewan tujuan.");
    expect(previewTransfer(base(), "Bruno").rows.map((row) => row.value)).toEqual([
      "Mochi",
      "Bruno",
      "sisa masa berlaku dan sisa jatah",
    ]);
  });
});

describe("the Kelola panel", () => {
  it("offers transfer only on a pet card, and switches everything but dates off once ended", () => {
    const grants = { manage: true, cancel: true };
    expect(kelolaRows(base({ attachTo: "customer" }), grants).map((row) => row.type)).not.toContain(
      "transfer",
    );

    const expired = kelolaRows(base({ status: "expired" }), grants);
    expect(expired.find((row) => row.type === "adjust-dates")?.disabled).toBeNull();
    expect(expired.find((row) => row.type === "pause")?.disabled).toBe("Membership sudah berakhir.");
  });

  it("gates on the manage and cancel grants separately", () => {
    const rows = kelolaRows(base(), { manage: false, cancel: true });
    expect(rows.find((row) => row.type === "pause")?.disabled).toMatch(/izin kelola/);
    expect(rows.find((row) => row.type === "cancel")?.disabled).toBeNull();
  });

  it("knows a card was used from its counters or its ledger", () => {
    expect(hasUsage(base({ benefits: [unused], redemptions: [] }))).toBe(false);
    expect(hasUsage(base({ benefits: [unused], redemptions: [redemption()] }))).toBe(true);
  });
});
