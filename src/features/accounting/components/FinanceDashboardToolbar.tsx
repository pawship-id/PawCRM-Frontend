"use client";

import {
  FilterBar,
  FilterDateRange,
  FilterMultiSelect,
  FilterSelect,
  withAll,
  type AppliedFilter,
  type DatePreset,
  type FilterOption,
} from "@/components";

import { formatMonth } from "../labels";
import {
  lineLabel,
  monthRange,
  type FinanceQuery,
  type Period,
} from "../financeSummary";

/**
 * The dashboard's controls: period, branch, business lines — one quick bar.
 *
 * WHY A BAR AND NOT A PANEL (§8). Three fields is quick-bar territory, and the
 * clause that would push a multi-select behind a `Filter (n)` button has no
 * component to land in: `FilterMultiSelect` has no `layout="field"`, because a
 * popover carrying its own Terapkan inside a panel carrying its own Terapkan is
 * two pairs of verbs for one decision. So each control applies on its own terms,
 * which is what a bar is for.
 *
 * THE PERIOD IS NEVER A CHIP AND NEVER COUNTED. Every figure on this page is a
 * figure *for a period*; the range is not narrowing the dashboard, it is what
 * the dashboard means. Marking it as an applied filter would put a standing
 * chip over an unfiltered page — the same reason `Urutkan` is uncounted on the
 * list screens. Branch and business line genuinely narrow, so both get chips and
 * both are what "Hapus semua" clears.
 */
export function FinanceDashboardToolbar({
  query,
  branches,
  businessLines,
  presets,
  onChange,
}: {
  query: FinanceQuery;
  /** Branch names present in the ledger — the filter offers nothing empty. */
  branches: string[];
  /** Normalised business lines; `""` is the shared bucket. */
  businessLines: string[];
  presets: DatePreset[];
  onChange: (patch: Partial<FinanceQuery>) => void;
}) {
  const branchOptions = withAll(
    branches.map((name) => ({ value: name, label: name })),
    "Semua cabang",
  );

  const lineOptions: FilterOption<string>[] = businessLines.map((line) => ({
    value: line,
    label: lineLabel(line),
  }));

  const chips: AppliedFilter[] = [];

  if (query.branchName) {
    chips.push({
      key: `branch:${query.branchName}`,
      label: query.branchName,
      onRemove: () => onChange({ branchName: "" }),
    });
  }

  for (const line of query.businessLines) {
    chips.push({
      key: `line:${line || "shared"}`,
      label: lineLabel(line),
      onRemove: () =>
        onChange({
          businessLines: query.businessLines.filter((item) => item !== line),
        }),
    });
  }

  return (
    <FilterBar
      chips={chips}
      onClearAll={() => onChange({ branchName: "", businessLines: [] })}
    >
      <FilterDateRange
        label="Periode"
        from={query.from}
        to={query.to}
        presets={presets}
        ariaLabel="Periode laporan"
        onApply={({ from, to }) => onChange({ from, to })}
      />
      <FilterSelect
        label="Cabang"
        ariaLabel="Filter cabang"
        value={query.branchName}
        options={branchOptions}
        onChange={(branchName) => onChange({ branchName })}
      />
      <FilterMultiSelect
        label="Lini bisnis"
        ariaLabel="Filter lini bisnis"
        values={query.businessLines}
        options={lineOptions}
        onApply={(lines) => onChange({ businessLines: lines })}
        onReset={() => onChange({ businessLines: [] })}
        formatValue={(values) =>
          values.length === 1
            ? lineLabel(values[0])
            : `${values.length} lini`
        }
      />
    </FilterBar>
  );
}

/**
 * The period presets, built from the ledger rather than from the clock.
 *
 * The two most recent months it has entries in, then everything — which is the
 * shape of the question somebody asks on a dashboard: this month, last month,
 * all of it. A preset for a month with no entries would be a control that always
 * empties the page.
 */
export function periodPresets(months: string[], everything: Period): DatePreset[] {
  const monthly = months.slice(0, 2).map((month) => ({
    label: formatMonth(`${month}-01`),
    ...monthRange(month),
  }));

  return everything.from
    ? [...monthly, { label: "Semua periode", ...everything }]
    : monthly;
}
