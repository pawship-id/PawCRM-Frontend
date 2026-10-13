"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ScopeFilterCard, type PillOption } from "@/components";
import { branchService } from "@/services/branch.service";
import type { Branch } from "@/types/api";

import { customSeed, type DateRange, type GroomingPeriod } from "../board";

/** The four pills — also the Layanan & Harga Filter panel's, so both say the same. */
export const PERIOD_OPTIONS: PillOption<GroomingPeriod>[] = [
  // "Semua" leads, as on every other scope row; the screens open on Bulan ini.
  { value: "all", label: "Semua" },
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
  { value: "custom", label: "Custom" },
];

/**
 * The mockup's context bar — Cabang and Periode — above the cards.
 *
 * THE SHARED `ScopeFilterCard` SINCE 12 OCTOBER 2026 (on request), the row
 * Penjualan, Pembelian and Inventori wear: Cabang takes several, and the dates
 * open in the card under Custom rather than in a popover beside the pills.
 *
 * OUTSIDE THE FILTER PANEL, and it is §8's two exceptions at once. Both change
 * the NUMBERS on the cards rather than only which rows are listed (Kartu
 * Stok's Gudang sits by its heading for the same reason), and Periode is the
 * lens this screen is opened to use, so it is a pill row that applies on click.
 * Neither counts towards `Filter (n)`, and the panel's Reset leaves both alone.
 *
 * ─── A "Custom" PILL, AND THE DATES ONLY BEHIND IT ─────────────────────────
 *
 * Decided 13 September 2026, on request, reversing the first build — which had
 * no fourth pill and kept the date trigger on the bar at all times. The mockup
 * draws "Custom" beside "Bulan ini", and a date control sitting next to three
 * pills that already answer "which dates" was two ways to say one thing.
 *
 * CUSTOM STARTS FROM THE PERIOD IN FORCE. Pressing it hands the current dates
 * over as the custom range, so the numbers do not move until somebody changes a
 * date — an empty range here would mean "all time" on one tab and a board that
 * loads every booking the shop ever took on the other.
 */
export function GroomingPeriodBar({
  branchIds,
  onBranchesChange,
  period,
  customRange,
  onPeriodChange,
  onCustomRange,
  trailing,
}: {
  /** Empty = every cabang. Several since 12 October 2026. */
  branchIds: string[];
  onBranchesChange: (branchIds: string[]) => void;
  period: GroomingPeriod;
  customRange: DateRange;
  onPeriodChange: (period: GroomingPeriod) => void;
  onCustomRange: (range: DateRange) => void;
  /** Drawn at the row's right end — the screen's "Reset filter (n)". */
  trailing?: ReactNode;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch(() => {
        // Stays on "Semua cabang" with nothing to pick, the harmless answer.
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <ScopeFilterCard<GroomingPeriod>
      branches={branches}
      branchIds={branchIds}
      onScopeChange={(next) => onBranchesChange(next.branchIds)}
      period={{
        value: period,
        options: PERIOD_OPTIONS,
        onChange: (next) => {
          if (next !== "custom") {
            onPeriodChange(next);
          } else if (period !== "custom") {
            onCustomRange(customSeed(period));
          }
        },
        dateFrom: customRange.from,
        dateTo: customRange.to,
        onDateRangeChange: onCustomRange,
        dateLabel: "Tanggal booking",
      }}
      trailing={trailing}
    />
  );
}
