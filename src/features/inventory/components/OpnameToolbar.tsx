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

import type { OpnameFilters } from "../hooks/useOpnames";

/**
 * The count-sheet list's controls: status, warehouse, a date range and a search
 * over the sheet number.
 *
 * Purely presentational — it renders the current filters and reports changes up
 * to the screen. The `ALL` sentinel is the same one every other toolbar here
 * uses: Radix Select forbids an empty item value.
 *
 * INACTIVE WAREHOUSES ARE INCLUDED, unlike the picker on the create page. This
 * is a READ: a warehouse closed last month still owns the counts taken there,
 * and a filter that could not reach them would make that history unreachable at
 * exactly the moment somebody is auditing it. The picker that OPENS a sheet
 * filters them out, because the API refuses a count at an inactive location —
 * offering one there would produce a rejection after the choice.
 */
const ALL = "all";

export function OpnameToolbar({
  filters,
  warehouses,
  onChange,
}: {
  filters: OpnameFilters;
  warehouses: StockWarehouse[];
  onChange: (next: OpnameFilters) => void;
}) {
  const set = <K extends keyof OpnameFilters>(
    key: K,
    value: OpnameFilters[K],
  ) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="min-w-52 flex-1">
        <label
          htmlFor="opname-search"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Cari
        </label>
        <Input
          id="opname-search"
          value={filters.search}
          onChange={(event) => set("search", event.target.value)}
          placeholder="Nomor opname atau catatan…"
        />
      </div>

      <div>
        <label
          htmlFor="opname-status"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Status
        </label>
        <Select
          value={filters.status || ALL}
          onValueChange={(value) =>
            set("status", value === ALL ? "" : (value as "draft" | "submitted"))
          }
        >
          <SelectTrigger id="opname-status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Final</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          htmlFor="opname-warehouse"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Gudang
        </label>
        <Select
          value={filters.warehouseId || ALL}
          onValueChange={(value) =>
            set("warehouseId", value === ALL ? "" : value)
          }
        >
          <SelectTrigger id="opname-warehouse" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua gudang</SelectItem>
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse._id} value={warehouse._id}>
                {warehouse.name}
                {!warehouse.isActive && " (nonaktif)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          htmlFor="opname-from"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Dari tanggal
        </label>
        <Input
          id="opname-from"
          type="date"
          value={filters.dateFrom}
          onChange={(event) => set("dateFrom", event.target.value)}
          className="w-40"
        />
      </div>

      <div>
        <label
          htmlFor="opname-to"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Sampai
        </label>
        <Input
          id="opname-to"
          type="date"
          value={filters.dateTo}
          /* The API refuses a `dateTo` before `dateFrom`; stopping it here means
             the user learns about it from the picker rather than from a 400. */
          min={filters.dateFrom || undefined}
          onChange={(event) => set("dateTo", event.target.value)}
          className="w-40"
        />
      </div>
    </div>
  );
}
