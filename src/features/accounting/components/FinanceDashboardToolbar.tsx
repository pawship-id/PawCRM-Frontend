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
import type { BusinessLine } from "@/services/businessLine.service";
import type { Branch } from "@/types/api";

import { SHARED_LINE_LABEL, type FinanceQuery } from "../financeSummary";

/**
 * The value that means "the lines with no business line on them".
 *
 * `""` already means "not filtering", so the shared bucket needs a token of its
 * own — and it cannot be a real id, because there is no document behind it. The
 * screen translates it before the query leaves for the API; nothing below this
 * layer ever sees it.
 */
export const SHARED_LINE_NONE = "__none__";

/**
 * The dashboard's controls: periode, cabang, lini bisnis — one quick bar.
 *
 * A BAR AND NOT A PANEL (§8): three fields, all single-select, and every one of
 * them applies on its own terms. The mockup had lini bisnis as a multi-select,
 * which would have forced a panel — but the API filters one line at a time, and
 * the unfiltered call already returns the per-line split, so "compare the lines"
 * is answered by reading the chips rather than by selecting several.
 *
 * THE PERIOD IS A CHIP LIKE ANY OTHER FILTER, which it did not use to be. The
 * old rule — a figure is always a figure *for a period*, so the range is what
 * the dashboard means rather than a narrowing of it — held only while the screen
 * opened on a period it chose itself. It opens on "Semua" now, so a range on the
 * trigger is a choice somebody made, and an uncounted choice is the one people
 * forget is on and then read the wrong numbers from. It clears with
 * "Hapus semua" for the same reason.
 *
 * The options come from `/branches` and `/business-lines`. Both may be empty
 * when the user cannot read them, and an empty list renders as a select holding
 * only "Semua" — which is honest: they are not filtering, because they cannot.
 */
export function FinanceDashboardToolbar({
  query,
  branches,
  businessLines,
  presets,
  disabled,
  onChange,
}: {
  query: FinanceQuery;
  branches: Branch[];
  businessLines: BusinessLine[];
  presets: DatePreset[];
  /** True while the ledger is in flight — the controls stay readable, not live. */
  disabled?: boolean;
  onChange: (patch: Partial<FinanceQuery>) => void;
}) {
  const branchOptions = withAll(namedOptions(branches), "Semua cabang");

  const lineOptions = withAll(
    [
      ...namedOptions(businessLines),
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

  if (query.businessLineId) {
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
        onApply={({ from, to }) =>
          onChange({ dateFrom: from, dateTo: to })
        }
      />
      <FilterSelect
        label="Cabang"
        ariaLabel="Filter cabang"
        value={query.branchId}
        options={branchOptions}
        disabled={disabled}
        onChange={(branchId) => onChange({ branchId })}
      />
      <FilterSelect
        label="Lini bisnis"
        ariaLabel="Filter lini bisnis"
        value={query.businessLineId}
        options={lineOptions}
        disabled={disabled}
        onChange={(businessLineId) => onChange({ businessLineId })}
      />
    </FilterBar>
  );
}
