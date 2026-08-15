"use client";

import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import type { StockWarehouse } from "@/types/inventory";

import type { BatchesQuery, Horizon } from "../hooks/useBatches";

/**
 * The batch list controls: batch-code search, warehouse, expiry horizon, and —
 * in audit mode only — a "show spent lots" toggle.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * the screen.
 *
 * TWO CONTROLS EXPLAIN THEMSELVES WHEN THEY GO QUIET, which is the whole reason
 * this is not four inputs in a row:
 *
 *   the horizon   — suspended while a search is active, because the alert
 *                   endpoint cannot filter by batch code and tracing one lot is
 *                   a question about its whole life, not about the next 30 days;
 *   "lot habis"   — hidden outside audit mode, because an exhausted lot cannot
 *                   expire into anything and the alert endpoint has no opinion
 *                   to offer about it.
 *
 * A disabled control with no explanation is worse than a missing one; a control
 * that silently does nothing is worse than both. The first case is FilterBar's
 * `hint`; the second is plain JSX, which is exactly why these controls compose
 * rather than being declared as data.
 */
const HORIZONS: FilterOption<Horizon>[] = [
  { value: "7", label: "Kritis — 7 hari" },
  { value: "30", label: "Perhatian — 30 hari" },
  { value: "90", label: "3 bulan" },
  { value: "all", label: "Semua lot" },
];

export function BatchesToolbar({
  query,
  warehouses,
  auditMode,
  total,
  onChange,
}: {
  query: BatchesQuery;
  warehouses: StockWarehouse[];
  /** True when the whole-collection endpoint is answering. */
  auditMode: boolean;
  total: number;
  onChange: (patch: Partial<BatchesQuery>) => void;
}) {
  const searching = query.search.trim() !== "";

  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari kode batch…"
          ariaLabel="Cari kode batch"
        />
      }
      meta={`${total} lot`}
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
      <FilterSelect
        label="Gudang"
        ariaLabel="Gudang"
        value={query.warehouseId}
        options={withAll(
          namedOptions(warehouses, (w) =>
            w.isActive ? w.name : `${w.name} (nonaktif)`,
          ),
          "Semua gudang",
        )}
        onChange={(warehouseId) => onChange({ warehouseId })}
      />
      <FilterSelect
        label="Kedaluwarsa"
        ariaLabel="Rentang kedaluwarsa"
        value={query.horizon}
        unsetValue="all"
        options={HORIZONS}
        disabled={searching}
        onChange={(horizon) => onChange({ horizon })}
      />

      {auditMode && (
        <FilterToggle
          label="Tampilkan lot yang sudah habis"
          checked={query.includeSpent}
          onChange={(includeSpent) => onChange({ includeSpent })}
        />
      )}
    </FilterBar>
  );
}
