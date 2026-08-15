"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import type { BatchSort, StockWarehouse } from "@/types/inventory";

import type { BatchesQuery, Horizon } from "../hooks/useBatches";

/**
 * The batch list controls: one row — batch-code search and one Filter button —
 * with the warehouse, the expiry horizon, the ordering and, in audit mode, the
 * "show spent lots" toggle inside a panel.
 *
 * Purely presentational — it renders the current query and reports changes up.
 *
 * THE SAME SHAPE AS THE CATALOGUE'S. There is no create button here — lots are
 * written by receiving goods, never typed in — so the row is search and Filter
 * and nothing else, which lets search take almost the whole width.
 *
 * TWO CONTROLS EXPLAIN THEMSELVES WHEN THEY GO QUIET, which is why they are
 * composed here rather than declared as data:
 *
 *   the horizon   — suspended while a search is active, because the alert
 *                   endpoint cannot filter by batch code and tracing one lot is
 *                   a question about its whole life, not about the next 30 days;
 *   "lot habis"   — absent outside audit mode, because an exhausted lot cannot
 *                   expire into anything and the alert endpoint has no opinion
 *                   to offer about it.
 *
 * A disabled control with no explanation is worse than a missing one; a control
 * that silently does nothing is worse than both. NOW THAT BOTH LIVE IN A PANEL,
 * the explanation has to be said twice over — once on the bar, where somebody
 * who never opens the panel can still see why their horizon stopped mattering,
 * and once beside the greyed field itself. They are not the same sentence: the
 * bar's explains the page, the field's explains the control.
 */
const HORIZONS: FilterOption<Horizon>[] = [
  { value: "7", label: "Kritis — 7 hari" },
  { value: "30", label: "Perhatian — 30 hari" },
  { value: "90", label: "3 bulan" },
  { value: "all", label: "Semua lot" },
];

/**
 * The orderings the API accepts — BATCH_SORTS in productBatch.model.js.
 *
 * NO "SISA QTY" HERE. `qtyRemaining` is a decimal string the API does not index
 * and the screen re-reads per warehouse; ordering by it would be a control that
 * quietly sorts something other than what the column shows.
 */
const SORTS: FilterOption<BatchSort>[] = [
  { value: "expirySoonest", label: "Paling cepat kedaluwarsa" },
  { value: "expiryLatest", label: "Paling lama kedaluwarsa" },
  { value: "newest", label: "Terbaru diterima" },
  { value: "oldest", label: "Terlama diterima" },
];

/** Everything the panel edits, as one draft. */
interface BatchFilters {
  warehouseId: string;
  horizon: Horizon;
  includeSpent: boolean;
  sort: BatchSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The horizon goes back to 30 days rather than to "Semua lot": this screen is
 * an expiry report, and its unfiltered state is the report, not the archive.
 * The ordering goes back to soonest-first for the same reason.
 */
const CLEARED: BatchFilters = {
  warehouseId: "",
  horizon: "30",
  includeSpent: false,
  sort: "expirySoonest",
};

export function BatchesToolbar({
  query,
  warehouses,
  auditMode,
  onChange,
}: {
  query: BatchesQuery;
  warehouses: StockWarehouse[];
  /** True when the whole-collection endpoint is answering. */
  auditMode: boolean;
  onChange: (patch: Partial<BatchesQuery>) => void;
}) {
  const searching = query.search.trim() !== "";

  const applied: BatchFilters = {
    warehouseId: query.warehouseId,
    horizon: query.horizon,
    includeSpent: query.includeSpent,
    sort: query.sort,
  };

  /**
   * Commits the draft, sending only what actually moved — the fetch effect keys
   * on the query object's identity, so posting every field back would re-query
   * the list after a Terapkan that changed nothing.
   */
  function apply(next: BatchFilters) {
    const patch: Partial<BatchesQuery> = {};
    if (next.warehouseId !== query.warehouseId)
      patch.warehouseId = next.warehouseId;
    if (next.horizon !== query.horizon) patch.horizon = next.horizon;
    if (next.includeSpent !== query.includeSpent)
      patch.includeSpent = next.includeSpent;
    if (next.sort !== query.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it. With no create
      // button here, "what is left" is nearly all of it — which suits a box
      // people paste a batch code into.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari kode batch…"
          ariaLabel="Cari kode batch"
          fill
        />
      }
      hint={
        searching && (
          <>
            Pencarian kode batch berlaku di <b>seluruh lot</b> — termasuk yang
            sudah habis dan yang tidak punya tanggal kedaluwarsa — jadi rentang
            kedaluwarsa dinonaktifkan selama kotak pencarian terisi.
          </>
        )
      }
    >
      <BatchFilterPanel
        applied={applied}
        warehouses={warehouses}
        auditMode={auditMode}
        searching={searching}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * The warehouse, the horizon, the ordering and the spent-lot toggle, behind one
 * button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once.
 */
function BatchFilterPanel({
  applied,
  warehouses,
  auditMode,
  searching,
  onApply,
}: {
  applied: BatchFilters;
  warehouses: StockWarehouse[];
  auditMode: boolean;
  searching: boolean;
  onApply: (next: BatchFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * NEITHER THE ORDERING NOR THE HORIZON IS COUNTED. Every list has an
   * ordering, and this screen always has a horizon — 30 days is its resting
   * state, not a filter somebody applied. Counting either would put a standing
   * number over an unnarrowed report and teach people to ignore it, which is
   * the one thing the badge cannot afford now that the controls are hidden.
   */
  const count = [
    applied.warehouseId !== "",
    applied.horizon !== CLEARED.horizon,
    applied.includeSpent,
  ].filter(Boolean).length;

  function patch(change: Partial<BatchFilters>) {
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
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="expirySoonest"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Gudang"
          value={draft.warehouseId}
          options={withAll(
            namedOptions(warehouses, (w) =>
              w.isActive ? w.name : `${w.name} (nonaktif)`,
            ),
            "Semua gudang",
          )}
          onChange={(warehouseId) => patch({ warehouseId })}
        />
        <FilterSelect
          layout="field"
          label="Kedaluwarsa"
          ariaLabel="Rentang kedaluwarsa"
          value={draft.horizon}
          unsetValue="all"
          options={HORIZONS}
          disabled={searching}
          disabledHint="Nonaktif selama kotak pencarian terisi — pencarian kode batch berlaku di seluruh lot."
          onChange={(horizon) => patch({ horizon })}
        />

        {auditMode && (
          <FilterToggle
            label="Tampilkan lot yang sudah habis"
            checked={draft.includeSpent}
            onChange={(includeSpent) => patch({ includeSpent })}
          />
        )}
      </FilterPanel>
    </>
  );
}
