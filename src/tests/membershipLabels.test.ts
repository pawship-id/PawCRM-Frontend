import {
  EXPIRING_SOON_LABEL,
  KELOLA_REASON_OPTIONS,
  QUOTA_CHOICE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TONE_CLASS,
  benefitChip,
  formatPlanDuration,
  quotaText,
  remainingLabel,
} from "@/features/memberships/labels";
import { KELOLA_REASONS, type MembershipStatus } from "@/types/membership";

/** The module's vocabulary — the words every membership screen shares. */
describe("membership labels", () => {
  it("names every card status, the two V1 ones included", () => {
    const statuses: MembershipStatus[] = [
      "scheduled",
      "active",
      "paused",
      "awaiting_payment",
      "expired",
      "cancelled",
    ];
    for (const status of statuses) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(TONE_CLASS[STATUS_TONE[status]]).toBeTruthy();
    }
    expect(STATUS_LABEL.paused).toBe("Ditunda");
    expect(STATUS_LABEL.awaiting_payment).toBe("Belum lunas");
    expect(EXPIRING_SOON_LABEL).toBe("Segera berakhir");
  });

  it("tints badges with bg-tint-* and never opacity arithmetic (ui-rules §9)", () => {
    for (const classes of Object.values(TONE_CLASS)) {
      expect(classes).not.toMatch(/bg-[a-z-]+\/\d+/);
    }
    expect(TONE_CLASS.danger).toContain("bg-tint-danger");
    expect(TONE_CLASS.info).toContain("bg-tint-info");
  });

  it("offers the builder's four quota periods, worded as in the prototype", () => {
    expect(Object.values(QUOTA_CHOICE_LABEL)).toEqual([
      "× per minggu",
      "× per bulan",
      "× selama masa berlaku",
      "Tidak terbatas",
    ]);
  });

  it("states a quota in a few words", () => {
    expect(quotaText({ perPeriod: 1, period: "month", total: null })).toBe("1× per bulan");
    expect(quotaText({ perPeriod: 2, period: "week", total: 12 })).toBe("2× per minggu, maks. 12×");
    expect(quotaText({ perPeriod: null, period: null, total: 4 })).toBe("4× selama masa berlaku");
    expect(quotaText({ perPeriod: null, period: null, total: null })).toBe("tanpa batas");
  });

  it("keeps benefit chips short", () => {
    expect(benefitChip({ label: "Grooming", kind: "free_item", quota: { perPeriod: 1, period: "month", total: null } })).toBe(
      "Grooming 1×",
    );
    expect(benefitChip({ label: "Add-on 10%", kind: "discount_percent", quota: { perPeriod: null, period: null, total: null } })).toBe(
      "Add-on 10% ∞",
    );
    expect(benefitChip({ label: "Prioritas", kind: "perk" })).toBe("Prioritas");
  });

  it("carries the Kelola reasons as the exact strings the API stores", () => {
    expect(KELOLA_REASON_OPTIONS.map((option) => option.value)).toEqual([...KELOLA_REASONS]);
    expect(KELOLA_REASONS).toContain("Kompensasi: toko tutup atau groomer berhalangan");
  });

  it("reads months when the plan counts them, days for an old plan", () => {
    expect(formatPlanDuration({ durationMonths: 6, durationDays: 183 })).toBe("6 bulan");
    expect(formatPlanDuration({ durationMonths: null, durationDays: 90 })).toBe("3 bulan (90 hari)");
  });

  it("counts what is left against the corrected cap", () => {
    expect(
      remainingLabel({
        kind: "free_item",
        quota: { perPeriod: 1, period: "month", total: null },
        remainingThisPeriod: 2,
        remainingTotal: null,
        capThisPeriod: 2,
      }),
    ).toBe("2 dari 2 tersisa bulan ini");
  });
});
