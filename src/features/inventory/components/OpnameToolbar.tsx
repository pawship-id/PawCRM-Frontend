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
} from "@/components";
import { Button } from "@/components/ui/button";
import type { Branch } from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";

import { ownerBranchOf, warehousesUnder } from "../hooks/useBranchScope";
import type { OpnameFilters } from "../hooks/useOpnames";

/**
 * The opname list controls: one row — search, one Filter button and the export
 * — with status, branch, warehouse and the date range inside a panel.
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
 * BOTH SCOPES ARE OFFERED, and they interlock the way Penyesuaian Stok's pair
 * does — the same two lookups, the same two-way fill, so a reader moving between
 * the two screens does not relearn the panel. Branch and warehouse are not 1:1: a
 * central warehouse can serve three branches, and a branch can hold two
 * warehouses, so neither narrows to the other.
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
 * Everything the panel edits, as one draft. The ordering is NOT here: it lives
 * on the table's column headers (BO, 19 October 2026), and a Reset inside a
 * filter panel must not silently re-sort a table somebody ordered from the
 * headers it can see (docs/ui-rules.md §8).
 */
interface PanelFilters {
  status: OpnameFilters["status"];
  branchId: string;
  warehouseId: string;
  dateFrom: string;
  dateTo: string;
}

/** What Reset returns to — the query's own defaults, not "empty". */
const CLEARED: PanelFilters = {
  status: "",
  branchId: "",
  warehouseId: "",
  dateFrom: "",
  dateTo: "",
};

export function OpnameToolbar({
  filters,
  branches,
  warehouses,
  onChange,
  onExport,
  exporting = false,
  canExport = false,
}: {
  filters: OpnameFilters;
  /** Empty when the read was refused — the field then offers only "Semua cabang". */
  branches: Branch[];
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
    branchId: filters.branchId,
    warehouseId: filters.warehouseId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };

  /**
   * Commits the draft, sending only what actually moved — the list query is
   * keyed on the filter object, so posting every field back would re-fetch
   * after a Terapkan that changed nothing.
   */
  function apply(next: PanelFilters) {
    const patch: Partial<OpnameFilters> = {};
    if (next.status !== filters.status) patch.status = next.status;
    if (next.branchId !== filters.branchId) patch.branchId = next.branchId;
    if (next.warehouseId !== filters.warehouseId)
      patch.warehouseId = next.warehouseId;
    if (next.dateFrom !== filters.dateFrom) patch.dateFrom = next.dateFrom;
    if (next.dateTo !== filters.dateTo) patch.dateTo = next.dateTo;

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
        branches={branches}
        warehouses={warehouses}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * Status, branch, warehouse and the date range, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8), and it is why the
 * date range renders as a field here rather than as its own popover: two pairs
 * of Reset/Terapkan for one decision is a second commit that appears to do
 * nothing.
 *
 * THE TWO SCOPES INTERLOCK BOTH WAYS, exactly as they do on Penyesuaian Stok —
 * see `pickBranch` and `pickWarehouse` below. Five fields is still one panel:
 * §8 puts anything with interdependent fields here regardless of the count.
 */
function OpnameFilterPanel({
  applied,
  branches,
  warehouses,
  onApply,
}: {
  applied: PanelFilters;
  branches: Branch[];
  warehouses: StockWarehouse[];
  onApply: (next: PanelFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list. The range counts once, not twice.
   * The ordering is not in the panel at all — it is on the column headers.
   */
  const count = [
    applied.status !== "",
    applied.branchId !== "",
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

  const scoped = warehousesUnder(draft.branchId, warehouses);

  /**
   * A branch narrows the field below it, so the warehouse already chosen has to
   * be re-checked against the new list — a value the picker no longer offers
   * would sit on the trigger as a raw id and send a pair no sheet matches. Kept
   * when it survives, because the central warehouse serves every branch and
   * losing it on each branch change would be a choice undone for nothing.
   */
  function pickBranch(branchId: string) {
    setDraft((prev) => ({
      ...prev,
      branchId,
      warehouseId: warehousesUnder(branchId, warehouses).some(
        (warehouse) => warehouse._id === prev.warehouseId,
      )
        ? prev.warehouseId
        : "",
    }));
  }

  /**
   * THE OTHER DIRECTION, and it is not symmetrical.
   *
   * A warehouse pinned to one branch ANSWERS the branch question — "counts at
   * Gudang Timur" and "counts at Gudang Timur under any branch" are the same set
   * — so the field above fills itself in rather than sitting on "Semua cabang"
   * while the reader wonders whether it is still open.
   *
   * THE SHARED WAREHOUSE CHANGES NOTHING, and neither does "Semua gudang":
   * neither names a single owner, so there is no branch to volunteer. The branch
   * stays where the user left it until the user moves it.
   */
  function pickWarehouse(warehouseId: string) {
    const owner = ownerBranchOf(warehouseId, warehouses);

    setDraft((prev) => ({
      ...prev,
      warehouseId,
      branchId: owner ?? prev.branchId,
    }));
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
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status opname"
          value={draft.status}
          options={STATUSES}
          onChange={(status) => patch({ status })}
        />
        {/* CABANG ABOVE GUDANG — location first, then the shelf, the order every
            stock screen in this module asks its two scoping questions in. */}
        <FilterSelect
          layout="field"
          label="Cabang"
          ariaLabel="Filter cabang"
          value={draft.branchId}
          options={withAll(namedOptions(branches), "Semua cabang")}
          onChange={pickBranch}
        />
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Filter gudang"
          value={draft.warehouseId}
          options={withAll(
            namedOptions(scoped, (w) =>
              w.isActive ? w.name : `${w.name} (nonaktif)`,
            ),
            "Semua gudang",
          )}
          onChange={pickWarehouse}
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
