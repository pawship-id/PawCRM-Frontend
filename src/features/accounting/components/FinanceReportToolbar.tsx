"use client";

import {
  FilterBar,
  FilterDateRange,
  FilterSelect,
  formatRangeShort,
  namedOptions,
  withAll,
  type AppliedFilter,
  type DatePreset,
} from "@/components";

import {
  SHARED_LINE_LABEL,
  SHARED_LINE_NONE,
  type FinanceQuery,
} from "../financeSummary";

/**
 * The named thing a filter picks from — all these controls read off a lookup.
 *
 * `{ _id, name }` RATHER THAN `Branch` AND `BusinessLine`, which is what this
 * asked for while the dashboard was its only caller. A `Branch` carries an
 * address, a location and three timestamps, none of which a dropdown looks at;
 * demanding the whole document means a caller with a shorter list — the report
 * screens' fixtures, a test — has to fabricate nine fields to fill a select.
 * Real API documents still satisfy this structurally.
 */
interface NamedOption {
  _id: string;
  name: string;
}

/**
 * Periode, cabang, lini bisnis — the controls every Keuangan report shares.
 *
 * THREE SCREENS, ONE BAR: the dashboard, Laba Rugi and Arus Kas. They are read
 * one after another by the same person in the same sitting, and a filter row
 * that moved or renamed itself between them would be three toolbars to learn.
 * This is also why it is one component rather than three copies — §14, and the
 * fifteen hand-rolled toolbars that rule exists because of.
 *
 * A BAR AND NOT A PANEL (§8): at most three fields, all single-select, each
 * applying on its own terms. The mockup had lini bisnis as a multi-select, which
 * would have forced a panel — but the API filters one line at a time, and an
 * unfiltered read already returns every line, so "compare the lines" is answered
 * by reading the result rather than by selecting several. On Laba Rugi that is
 * literal: unfiltered, every line is a column.
 *
 * THE PERIOD IS A CHIP LIKE ANY OTHER FILTER, which it did not use to be. The
 * old rule — a figure is always a figure *for a period*, so the range is what a
 * report means rather than a narrowing of it — held only while the screen opened
 * on a period it chose itself. These open on "Semua", so a range on the trigger
 * is a choice somebody made, and an uncounted choice is the one people forget is
 * on and then read the wrong numbers from. It clears with "Hapus semua" for the
 * same reason.
 *
 * The options come from `/branches` and `/business-lines`. Both may be empty
 * when the user cannot read them, and an empty list renders as a select holding
 * only "Semua" — which is honest: they are not filtering, because they cannot.
 */
export function FinanceReportToolbar({
  query,
  branches,
  businessLines,
  presets,
  disabled,
  onChange,
}: {
  query: FinanceQuery;
  branches: NamedOption[];
  /**
   * Omitted by a report with no business-line dimension — Arus Kas is the one,
   * because a rupiah in the bank belongs to the shop rather than to grooming or
   * retail. Absent rather than disabled: a control that cannot narrow anything
   * is worse than one that is not there, because somebody eventually reaches
   * for it.
   */
  businessLines?: NamedOption[];
  presets: DatePreset[];
  /** True while the figures are in flight — the controls stay readable, not live. */
  disabled?: boolean;
  onChange: (patch: Partial<FinanceQuery>) => void;
}) {
  const branchOptions = withAll(namedOptions(branches), "Semua cabang");

  const lineOptions = withAll(
    [
      ...namedOptions(businessLines ?? []),
      // The unattributed bucket is a real answer, not an absence: rent, gaji
      // kantor and listrik live there. It is filterable because "how much have
      // we not yet charged to a line" is a question somebody asks.
      { value: SHARED_LINE_NONE, label: SHARED_LINE_LABEL },
    ],
    "Semua lini bisnis",
  );

  const chips: AppliedFilter[] = [];

  if (query.dateFrom || query.dateTo) {
    chips.push({
      key: "period",
      // One chip for the range, not one per bound: an open-ended range is still
      // one question somebody asked, and `formatRangeShort` already says which
      // end is missing ("sejak 1 Ags").
      label: `Periode ${formatRangeShort(query.dateFrom, query.dateTo)}`,
      onRemove: () => onChange({ dateFrom: "", dateTo: "" }),
    });
  }

  if (query.branchId) {
    const branch = branches.find((item) => item._id === query.branchId);
    chips.push({
      key: `branch:${query.branchId}`,
      label: branch?.name ?? "Cabang terpilih",
      onRemove: () => onChange({ branchId: "" }),
    });
  }

  if (businessLines && query.businessLineId) {
    const line = businessLines.find((item) => item._id === query.businessLineId);
    chips.push({
      key: `line:${query.businessLineId}`,
      label:
        query.businessLineId === SHARED_LINE_NONE
          ? SHARED_LINE_LABEL
          : (line?.name ?? "Lini terpilih"),
      onRemove: () => onChange({ businessLineId: "" }),
    });
  }

  return (
    <FilterBar
      chips={chips}
      onClearAll={() =>
        onChange({
          dateFrom: "",
          dateTo: "",
          branchId: "",
          businessLineId: "",
        })
      }
    >
      <FilterDateRange
        label="Periode"
        from={query.dateFrom}
        to={query.dateTo}
        presets={presets}
        ariaLabel="Periode laporan"
        disabled={disabled}
        onApply={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
      />
      <FilterSelect
        label="Cabang"
        ariaLabel="Filter cabang"
        value={query.branchId}
        options={branchOptions}
        disabled={disabled}
        onChange={(branchId) => onChange({ branchId })}
      />
      {businessLines && (
        <FilterSelect
          label="Lini bisnis"
          ariaLabel="Filter lini bisnis"
          value={query.businessLineId}
          options={lineOptions}
          disabled={disabled}
          onChange={(businessLineId) => onChange({ businessLineId })}
        />
      )}
    </FilterBar>
  );
}
