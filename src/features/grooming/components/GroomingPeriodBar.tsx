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

import type { DateRange, GroomingPeriod } from "../board";

const PERIODS: PillOption<GroomingPeriod>[] = [
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
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
 * A PICKED RANGE REPLACES THE PILLS rather than adding a fourth "Custom" pill:
 * the trigger reads the dates themselves, and "custom" is never shown as a word.
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
        options={PERIODS}
        onChange={onPeriodChange}
      />
      <FilterDateRange
        label="Tanggal"
        ariaLabel="Pilih rentang tanggal booking"
        from={period === "custom" ? customRange.from : ""}
        to={period === "custom" ? customRange.to : ""}
        onApply={onCustomRange}
      />
    </div>
  );
}
