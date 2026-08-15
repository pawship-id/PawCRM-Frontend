"use client";

import { Download, RotateCw } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterSelect,
  withAll,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import type { MovementType } from "@/types/inventory";

import type { StockCardFilters as Filters } from "../hooks/useStockCard";

/**
 * The ledger's filters: movement type and a date range, plus reset, refresh and
 * export.
 *
 * Purely presentational — it renders the current filters and reports changes up
 * to the screen, which owns them.
 *
 * THE WAREHOUSE AND PRODUCT PICKERS ARE NOT HERE, deliberately. They live in
 * WarehouseProductPicker on the screen above, because they are required INPUTS
 * rather than filters — nothing loads until both are chosen, which is why every
 * control here takes `disabled` until they are.
 *
 * NO FILTER COSTS THE BALANCE COLUMN ANY MORE, and this component used to carry
 * a paragraph explaining that it did. Narrowing by movement type or setting an
 * end date hides rows newer than the ones on screen, which broke the balance
 * back when the frontend reconstructed it by walking backwards from the current
 * stock level. The server now sums over the rows it hides too
 * (PawCRM-Backend 0.20.0), so the warning is gone rather than reworded.
 *
 * EXPORT SITS WITH THE FILTERS BECAUSE IT OBEYS THEM. The downloaded file is
 * exactly the rows on screen — every page of them, not just this one — and
 * putting the button anywhere else would invite the assumption that it dumps
 * everything.
 */
const MOVEMENT_FILTERS: FilterOption<MovementType | "">[] = [
  { value: "receipt", label: "Penerimaan" },
  { value: "pos_sale", label: "Penjualan" },
  { value: "adjustment", label: "Penyesuaian" },
  { value: "opname_diff", label: "Selisih opname" },
  { value: "transfer_in", label: "Transfer masuk" },
  { value: "transfer_out", label: "Transfer keluar" },
  { value: "customer_return", label: "Retur customer" },
  { value: "purchase_return", label: "Retur supplier" },
  { value: "bundle_consume", label: "Bundle consume" },
];

const TYPES = withAll(MOVEMENT_FILTERS, "Semua tipe");

export function StockCardFilters({
  filters,
  disabled,
  refreshing,
  exporting,
  onChange,
  onRefresh,
  onExport,
}: {
  filters: Filters;
  disabled: boolean;
  refreshing: boolean;
  exporting: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onRefresh: () => void;
  onExport: () => void;
}) {
  const narrowed =
    filters.movementType !== "" || filters.from !== "" || filters.to !== "";

  return (
    <FilterBar
      hint={
        <>
          Export mengikuti filter di atas dan berisi <b>seluruh</b> pergerakan
          yang cocok — bukan hanya halaman yang sedang tampil.
        </>
      }
      actions={
        <>
          {narrowed && (
            <Button
              variant="ghost"
              onClick={() => onChange({ movementType: "", from: "", to: "" })}
              disabled={disabled}
            >
              Reset filter
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={disabled || refreshing}
          >
            <RotateCw className={refreshing ? "animate-spin" : undefined} />
            Muat ulang
          </Button>
          <Button onClick={onExport} disabled={disabled || exporting}>
            <Download />
            {exporting ? "Menyiapkan…" : "Export .xlsx"}
          </Button>
        </>
      }
    >
      <FilterSelect
        label="Tipe pergerakan"
        ariaLabel="Tipe pergerakan"
        value={filters.movementType}
        options={TYPES}
        disabled={disabled}
        onChange={(movementType) => onChange({ movementType })}
      />
      <FilterDateRange
        label="Tanggal"
        from={filters.from}
        to={filters.to}
        disabled={disabled}
        onApply={({ from, to }) => onChange({ from, to })}
      />
    </FilterBar>
  );
}
