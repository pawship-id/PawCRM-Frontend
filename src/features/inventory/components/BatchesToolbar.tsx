"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StockWarehouse } from "@/types/inventory";

import type { BatchesQuery, Horizon } from "../hooks/useBatches";

/**
 * The lot report's controls: warehouse, horizon, a batch-code search, and the
 * toggle for lots that have sold out.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * the screen. The `ALL` sentinel is the same one ProductsToolbar uses: Radix
 * Select forbids an empty item value.
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
 * that silently does nothing is worse than both.
 */
const ALL = "all";

const HORIZONS: Array<{ value: Horizon; label: string }> = [
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Cari kode batch…"
          value={query.search}
          onChange={(event) => onChange({ search: event.target.value })}
          className="max-w-xs"
          aria-label="Cari kode batch"
        />

        <Select
          value={query.warehouseId === "" ? ALL : query.warehouseId}
          onValueChange={(value) =>
            onChange({ warehouseId: value === ALL ? "" : value })
          }
        >
          <SelectTrigger className="w-56" aria-label="Gudang">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua gudang</SelectItem>
            {/* Inactive warehouses are listed: a closed location still holds the
                lots it held, and forgotten stock is exactly what an expiry
                report exists to surface. */}
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse._id} value={warehouse._id}>
                {warehouse.name}
                {!warehouse.isActive && " (nonaktif)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.horizon}
          onValueChange={(value) => onChange({ horizon: value as Horizon })}
          disabled={searching}
        >
          <SelectTrigger className="w-48" aria-label="Rentang kedaluwarsa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HORIZONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {auditMode && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={query.includeSpent}
              onChange={(event) =>
                onChange({ includeSpent: event.target.checked })
              }
              className="size-4 accent-primary"
            />
            Tampilkan lot yang sudah habis
          </label>
        )}

        <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
          {total} lot
        </span>
      </div>

      {searching && (
        <p className="text-xs text-muted">
          Pencarian kode batch berlaku di <b>seluruh lot</b> — termasuk yang
          sudah habis dan yang tidak punya tanggal kedaluwarsa — jadi rentang
          kedaluwarsa dinonaktifkan selama kotak pencarian terisi.
        </p>
      )}
    </div>
  );
}
