"use client";

import { Download, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MovementType } from "@/types/inventory";

import type { StockCardFilters as Filters } from "../hooks/useStockCard";

/**
 * The ledger's filters: movement type and a date range, plus reset, refresh and
 * export.
 *
 * Purely presentational — it renders the current filters and reports changes up
 * to the screen, which owns them. The `ALL` sentinel is the same one
 * ProductsToolbar uses, and for the same reason: Radix Select forbids an empty
 * item value.
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
const ALL = "all";

const MOVEMENT_FILTERS: Array<{ value: MovementType; label: string }> = [
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movementType" className="text-xs text-muted">
            Tipe pergerakan
          </Label>
          <Select
            value={filters.movementType === "" ? ALL : filters.movementType}
            onValueChange={(value) =>
              onChange({
                movementType: value === ALL ? "" : (value as MovementType),
              })
            }
            disabled={disabled}
          >
            <SelectTrigger
              id="movementType"
              className="w-48"
              aria-label="Tipe pergerakan"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua tipe</SelectItem>
              {MOVEMENT_FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from" className="text-xs text-muted">
            Dari tanggal
          </Label>
          <Input
            id="from"
            type="date"
            className="w-44"
            value={filters.from}
            max={filters.to || undefined}
            disabled={disabled}
            onChange={(event) => onChange({ from: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to" className="text-xs text-muted">
            Sampai tanggal
          </Label>
          <Input
            id="to"
            type="date"
            className="w-44"
            value={filters.to}
            // The API refuses a `to` that precedes `from` with a 400; bounding
            // the input means the user never sends one.
            min={filters.from || undefined}
            disabled={disabled}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
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
        </div>
      </div>

      <p className="text-xs text-muted">
        Export mengikuti filter di atas dan berisi <b>seluruh</b> pergerakan yang
        cocok — bukan hanya halaman yang sedang tampil.
      </p>
    </div>
  );
}
