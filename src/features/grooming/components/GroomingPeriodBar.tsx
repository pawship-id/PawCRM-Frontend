"use client";

import { useEffect, useState } from "react";

import {
  FilterDateRange,
  FilterPills,
  FilterSelect,
  withAll,
  type PillOption,
} from "@/components";
import { branchService } from "@/services/branch.service";
import type { Branch } from "@/types/api";

import { periodRange, type DateRange, type GroomingPeriod } from "../board";

/** The four pills — also the Layanan & Harga Filter panel's, so both say the same. */
export const PERIOD_OPTIONS: PillOption<GroomingPeriod>[] = [
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
  { value: "custom", label: "Custom" },
];

/**
 * The mockup's context bar — Cabang and Periode — above the cards.
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
  branchId,
  onBranchChange,
  period,
  customRange,
  onPeriodChange,
  onCustomRange,
}: {
  branchId: string;
  onBranchChange: (branchId: string) => void;
  period: GroomingPeriod;
  customRange: DateRange;
  onPeriodChange: (period: GroomingPeriod) => void;
  onCustomRange: (range: DateRange) => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch(() => {
        // Stays on "Semua cabang", which is the harmless answer.
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <FilterSelect
        label="Cabang"
        ariaLabel="Pilih cabang"
        value={branchId}
        options={withAll(
          branches.map((branch) => ({ value: branch._id, label: branch.name })),
          "Semua cabang",
        )}
        onChange={onBranchChange}
        disabled={failed}
      />
      <FilterPills
        ariaLabel="Periode"
        value={period}
        options={PERIOD_OPTIONS}
        onChange={(next) => {
          if (next !== "custom") {
            onPeriodChange(next);
          } else if (period !== "custom") {
            onCustomRange(periodRange(period));
          }
        }}
      />
      {period === "custom" && (
        <FilterDateRange
          label="Tanggal"
          ariaLabel="Pilih rentang tanggal booking"
          from={customRange.from}
          to={customRange.to}
          // NO PRESETS, on request: the pills beside it already are the presets,
          // and "Hari ini" twice on one bar is two controls for one choice.
          presets={[]}
          onApply={onCustomRange}
        />
      )}
    </div>
  );
}
