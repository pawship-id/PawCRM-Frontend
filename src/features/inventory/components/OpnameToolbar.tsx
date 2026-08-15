"use client";

import { Download } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterSearch,
  FilterSelect,
  Spinner,
  namedOptions,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import type { StockWarehouse } from "@/types/inventory";

import type { OpnameFilters } from "../hooks/useOpnames";

/**
 * The opname list controls: free-text search, status, warehouse, a date range,
 * and the export button.
 *
 * Purely presentational — it renders the current filters and reports changes up
 * to the screen.
 *
 * INACTIVE WAREHOUSES ARE INCLUDED, unlike the picker on the create page. This
 * is a READ: a warehouse closed last month still owns the counts taken there,
 * and a filter that could not reach them would make that history unreachable at
 * exactly the moment somebody is auditing it. The picker that OPENS a sheet
 * filters them out, because the API refuses a count at an inactive location —
 * offering one there would produce a rejection after the choice.
 *
 * `onChange` takes a PATCH, like every other toolbar in the codebase. It used to
 * take the whole object and rebuild it through a local `set()` closure, which
 * made this the one file that could not be read by analogy with its neighbours.
 */
const STATUSES = withAll<OpnameFilters["status"]>(
  [
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Final" },
  ],
  "Semua status",
);

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
  return (
    <FilterBar
      search={
        <FilterSearch
          value={filters.search}
          onChange={(search) => onChange({ search })}
          placeholder="Nomor opname atau catatan…"
          ariaLabel="Cari opname"
        />
      }
      actions={
        onExport && (
          <Button
            variant="secondary"
            onClick={onExport}
            disabled={exporting || !canExport}
          >
            {exporting ? <Spinner /> : <Download className="size-4" />}
            Export halaman ini (.xlsx)
          </Button>
        )
      }
    >
      <FilterSelect
        label="Status"
        ariaLabel="Filter status opname"
        value={filters.status}
        options={STATUSES}
        onChange={(status) => onChange({ status })}
      />
      <FilterSelect
        label="Gudang"
        ariaLabel="Filter gudang"
        value={filters.warehouseId}
        options={withAll(
          namedOptions(warehouses, (w) =>
            w.isActive ? w.name : `${w.name} (nonaktif)`,
          ),
          "Semua gudang",
        )}
        onChange={(warehouseId) => onChange({ warehouseId })}
      />
      <FilterDateRange
        label="Tanggal opname"
        from={filters.dateFrom}
        to={filters.dateTo}
        onApply={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
      />
    </FilterBar>
  );
}
