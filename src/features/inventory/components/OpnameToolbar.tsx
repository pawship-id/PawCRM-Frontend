"use client";

import { useState } from "react";
import { Download, ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  Spinner,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import type { OpnameSort, StockWarehouse } from "@/types/inventory";

import type { OpnameFilters } from "../hooks/useOpnames";

/**
 * The opname list controls: one row — search, one Filter button and the export
 * — with status, warehouse and the date range inside a panel.
 *
 * Purely presentational — it renders the current filters and reports changes up
 * to the screen.
 *
 * THE SAME SHAPE AS THE CATALOGUE'S, with export standing where the create menu
 * stands there. Nothing is created from this screen — an opname sheet is opened
 * from its own page — so the one thing on the row that is not about reading the
 * list is the one that takes what is on it away.
 *
 * INACTIVE WAREHOUSES ARE INCLUDED, unlike the picker on the create page. This
 * is a READ: a warehouse closed last month still owns the counts taken there,
 * and a filter that could not reach them would make that history unreachable at
 * exactly the moment somebody is auditing it. The picker that OPENS a sheet
 * filters them out, because the API refuses a count at an inactive location —
 * offering one there would produce a rejection after the choice.
 *
 * `onChange` takes a PATCH, like every other toolbar in the codebase.
 */
const STATUSES = withAll<OpnameFilters["status"]>(
  [
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Final" },
  ],
  "Semua status",
);

/**
 * The orderings the API accepts — OPNAME_SORTS in stockOpname.model.js.
 *
 * BY SHEET DATE, NOT BY WHEN THE ROW WAS WRITTEN. `opnameDate` is the day the
 * shelves were actually walked, which is the date printed on the row and the
 * one somebody means by "the last count"; a sheet opened on Friday for
 * Thursday's count would sort wrongly under either of the other two.
 *
 * The number orderings are not a second date axis in disguise. They agree with
 * chronology most of the time — OPN-2026-0001 precedes OPN-2026-0002 — but they
 * are how you find one sheet in a sequence rather than one day in a year.
 */
const SORTS: FilterOption<OpnameSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "numberDesc", label: "Nomor Z–A" },
  { value: "numberAsc", label: "Nomor A–Z" },
];

/** Everything the panel edits, as one draft. */
interface PanelFilters {
  status: OpnameFilters["status"];
  warehouseId: string;
  dateFrom: string;
  dateTo: string;
  sort: OpnameSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to the API's default rather than clearing it to nothing.
 */
const CLEARED: PanelFilters = {
  status: "",
  warehouseId: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

export function OpnameToolbar({
  filters,
  warehouses,
  onChange,
  onExport,
  exporting = false,
  canExport = false,
}: {
  filters: OpnameFilters;
  warehouses: StockWarehouse[];
  onChange: (patch: Partial<OpnameFilters>) => void;
  /** Absent on a screen that offers no export — the button then does not render. */
  onExport?: () => void;
  exporting?: boolean;
  /** False while the list is empty or loading: an empty workbook helps nobody. */
  canExport?: boolean;
}) {
  const applied: PanelFilters = {
    status: filters.status,
    warehouseId: filters.warehouseId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sort: filters.sort,
  };

  /**
   * Commits the draft, sending only what actually moved — the list query is
   * keyed on the filter object, so posting every field back would re-fetch
   * after a Terapkan that changed nothing.
   */
  function apply(next: PanelFilters) {
    const patch: Partial<OpnameFilters> = {};
    if (next.status !== filters.status) patch.status = next.status;
    if (next.warehouseId !== filters.warehouseId)
      patch.warehouseId = next.warehouseId;
    if (next.dateFrom !== filters.dateFrom) patch.dateFrom = next.dateFrom;
    if (next.dateTo !== filters.dateTo) patch.dateTo = next.dateTo;
    if (next.sort !== filters.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the filters
      // behind one button there is nothing else on the line that grows.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      // Below sm the row cannot hold all three, so the export takes a line of
      // its own — and takes all of it.
      actionsClassName="max-sm:w-full"
      search={
        <FilterSearch
          value={filters.search}
          onChange={(search) => onChange({ search })}
          placeholder="Nomor opname atau catatan…"
          ariaLabel="Cari opname"
          fill
        />
      }
      actions={
        onExport && (
          // The NAVY variant, not the outlined one, because on this screen it
          // is the primary action rather than a secondary one: nothing is
          // created here, so taking the list away is the only thing the row
          // offers that is not about reading it. Same weight as the create menu
          // carries on the catalogue, in the same place.
          <Button
            onClick={onExport}
            disabled={exporting || !canExport}
            className="w-full"
          >
            {exporting ? <Spinner /> : <Download className="size-4" />}
            Export halaman ini (.xlsx)
          </Button>
        )
      }
    >
      <OpnameFilterPanel
        applied={applied}
        warehouses={warehouses}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * Status, warehouse and the date range, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8), and it is why the
 * date range renders as a field here rather than as its own popover: two pairs
 * of Reset/Terapkan for one decision is a second commit that appears to do
 * nothing.
 */
function OpnameFilterPanel({
  applied,
  warehouses,
  onApply,
}: {
  applied: PanelFilters;
  warehouses: StockWarehouse[];
  onApply: (next: PanelFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list. The range counts once, not twice,
   * and THE ORDERING IS NOT COUNTED AT ALL — every list has one, so a badge
   * reading `Filter (1)` over an unnarrowed screen would teach people to ignore
   * the number.
   */
  const count = [
    applied.status !== "",
    applied.warehouseId !== "",
    applied.dateFrom !== "" || applied.dateTo !== "",
  ].filter(Boolean).length;

  function patch(change: Partial<PanelFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(applied);
    setOpen(next);
  }

  return (
    <>
      <FilterTrigger
        label={count === 0 ? "Filter" : `Filter (${count})`}
        active={count > 0}
        icon={<ListFilter className="size-4" />}
        aria-label="Filter"
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          onApply(CLEARED);
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        {/* Sort leads: it is the one field here that is always set, and the
            only one that changes what the top of the list is rather than what
            is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="newest"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status opname"
          value={draft.status}
          options={STATUSES}
          onChange={(status) => patch({ status })}
        />
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Filter gudang"
          value={draft.warehouseId}
          options={withAll(
            namedOptions(warehouses, (w) =>
              w.isActive ? w.name : `${w.name} (nonaktif)`,
            ),
            "Semua gudang",
          )}
          onChange={(warehouseId) => patch({ warehouseId })}
        />
        <FilterDateRange
          layout="field"
          label="Tanggal opname"
          from={draft.dateFrom}
          to={draft.dateTo}
          onApply={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
        />
      </FilterPanel>
    </>
  );
}
