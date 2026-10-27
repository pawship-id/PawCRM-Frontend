"use client";

import { useState, type ReactNode } from "react";
import { Layers } from "lucide-react";

import type { DatePreset } from "./filters/FilterDateRange";
import { FilterMultiSelect } from "./filters/FilterMultiSelect";
import { namedOptions } from "./filters/codecs";
import {
  ScopeFilterCard,
  scopeSummary,
  type ScopeBranchOption,
} from "./ScopeFilterCard";
import { ScopeField } from "./ScopePeriodCard";

/** The chips, by value. "Semua" sends no dates; the three in between are presets. */
type FinancePeriod = "all" | "today" | "week" | "month" | "custom";

/**
 * The preset each named chip applies — BY ITS LABEL in the screen's own
 * `presets`, so a chip and the preset of the same name can never drift into
 * two different weeks.
 */
const PRESET_OF: Record<"today" | "week" | "month", string> = {
  today: "Hari ini",
  week: "Minggu ini",
  month: "Bulan ini",
};

const CHIPS: { value: FinancePeriod; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
  { value: "custom", label: "Pilih tanggal" },
];

/** A business line as the card offers it. */
export interface FinanceLineOption {
  _id: string;
  name: string;
}

export interface FinanceScopeCardProps {
  branches: ScopeBranchOption[];
  branchIds: string[];
  onBranchIdsChange: (branchIds: string[]) => void;
  /**
   * Omit to draw no Lini bisnis field — a screen whose figures are not split
   * by line (Kas & Bank, Jurnal).
   */
  businessLines?: FinanceLineOption[];
  businessLineIds?: string[];
  onBusinessLineIdsChange?: (businessLineIds: string[]) => void;
  /**
   * The "no line" bucket, offered last — rent and salaries live there, so it
   * is a real answer somebody filters by. Its `value` is the screen's sentinel.
   */
  sharedLine?: { value: string; label: string };
  /**
   * The screen's date presets; the chips apply the ones named above. OMIT IT
   * (with the dates) to draw no Periode chips — Laba Rugi steps through months
   * with its own control instead, passed in `extraFields`.
   */
  presets?: DatePreset[];
  /** `yyyy-mm-dd`; both empty = every date. */
  dateFrom?: string;
  dateTo?: string;
  onDateRangeChange?: (range: { from: string; to: string }) => void;
  /** More `ScopeField`s, drawn after Lini bisnis — Laba Rugi's month stepper. */
  extraFields?: ReactNode;
  /** What the dates bound, read aloud on the custom inputs. */
  dateLabel?: string;
  /** Drawn at the row's right end — the screen's "Reset filter (n)". */
  trailing?: ReactNode;
}

/**
 * THE KEUANGAN SCOPE ROW — Cabang, Lini bisnis and Periode, built on the same
 * `ScopeFilterCard` Penjualan, Pembelian, Inventori and Layanan wear (12
 * October 2026, on request). It replaced `FinanceReportToolbar` on Ringkasan,
 * Kas & Bank, Komisi and Jurnal.
 *
 * EVERY DROPDOWN TAKES SEVERAL, like the rest of the app's scope rows.
 *
 * THE PERIOD IS DATES, NOT A NAME. Keuangan's queries carry `dateFrom` /
 * `dateTo`, so a chip applies its preset's two dates and the lit chip is read
 * back off them; a range that matches no chip is Custom.
 *
 * PRESSING CUSTOM APPLIES NOTHING. It opens the two dates, seeded with the
 * range in force; the figures move on Terapkan, not on a half-made range.
 */
export function FinanceScopeCard({
  branches,
  branchIds,
  onBranchIdsChange,
  businessLines,
  businessLineIds = [],
  onBusinessLineIdsChange,
  sharedLine,
  presets,
  dateFrom = "",
  dateTo = "",
  onDateRangeChange,
  dateLabel = "Periode khusus",
  extraFields,
  trailing,
}: FinanceScopeCardProps) {
  const [customOpen, setCustomOpen] = useState(false);

  const presetFor = (chip: "today" | "week" | "month") =>
    presets?.find((preset) => preset.label === PRESET_OF[chip]);
  const matched = (["today", "week", "month"] as const).find((chip) => {
    const preset = presetFor(chip);
    return preset && preset.from === dateFrom && preset.to === dateTo;
  });
  /*
    "" IS SEMUA, AND A RANGE THAT MATCHES NO CHIP IS CUSTOM — never "Semua",
    which would announce an unfiltered screen over filtered figures.
  */
  const value: FinancePeriod = customOpen
    ? "custom"
    : !dateFrom && !dateTo
      ? "all"
      : (matched ?? "custom");

  const lines = [
    ...(businessLines ?? []),
    ...(sharedLine ? [{ _id: sharedLine.value, name: sharedLine.label }] : []),
  ];

  return (
    <ScopeFilterCard<FinancePeriod>
      branches={branches}
      branchIds={branchIds}
      onScopeChange={(next) => onBranchIdsChange(next.branchIds)}
      extraFields={
        <>
          {businessLines && onBusinessLineIdsChange ? (
            <ScopeField
              icon={<Layers className="size-4" />}
              label="Lini bisnis"
            >
              <FilterMultiSelect
                label="Lini bisnis"
                layout="bar"
                ariaLabel="Lini bisnis"
                values={businessLineIds}
                options={namedOptions(lines)}
                formatValue={(ids) =>
                  scopeSummary(ids, lines, "Semua lini bisnis", "lini")
                }
                onApply={onBusinessLineIdsChange}
                onReset={() => onBusinessLineIdsChange([])}
              />
            </ScopeField>
          ) : null}
          {extraFields}
        </>
      }
      period={
        presets && onDateRangeChange
          ? {
              value,
              options: CHIPS,
              onChange: (next) => {
                if (next === "custom") {
                  setCustomOpen(true);
                  return;
                }
                setCustomOpen(false);
                const preset = next === "all" ? undefined : presetFor(next);
                onDateRangeChange(
                  preset
                    ? { from: preset.from, to: preset.to }
                    : { from: "", to: "" },
                );
              },
              dateFrom,
              dateTo,
              onDateRangeChange: (range) => {
                /* Terapkan applies the range; the range's own Reset (two empty
             ends) is "Semua", and closes the inputs with it. */
                setCustomOpen(false);
                onDateRangeChange(range);
              },
              dateLabel,
            }
          : undefined
      }
      trailing={trailing}
    />
  );
}
