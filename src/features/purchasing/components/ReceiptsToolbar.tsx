"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";

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
import { Can } from "@/features/permissions";
import type { PurchaseType } from "@/types/api";

import { useReceiptFilterOptions } from "../hooks/useReceiptFilterOptions";
import type { GoodsReceiptsQuery } from "../hooks/useGoodsReceipts";

/**
 * The goods-receipt list controls: free-text search, supplier, warehouse,
 * purchase type, a date range, and the way to the create screen.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useGoodsReceipts. Mirrors SuppliersToolbar, including the "all" sentinel, which
 * exists because Radix Select forbids an empty item value.
 *
 * NO "TAMPILKAN TERHAPUS" TOGGLE, unlike the supplier toolbar. There is no
 * `DELETE /goods-receipts/:id` — a posted receipt is immutable — so no receipt
 * is ever in a deleted state to reveal. A toggle that can never change a result
 * is worse than no toggle: it reads as a promise the data cannot keep.
 *
 * THE DATE RANGE BOUNDS `receiptDate`, the day the goods arrived — never the day
 * the row was keyed in. A delivery unloaded last night and entered this morning
 * belongs to last night, and that is the date somebody reconciling a supplier
 * statement is searching by.
 */
const ALL = "all";

const TYPES: Array<{ value: PurchaseType; label: string }> = [
  { value: "beli_putus", label: "Beli putus" },
  { value: "konsinyasi", label: "Konsinyasi" },
];

export function ReceiptsToolbar({
  query,
  onChange,
}: {
  query: GoodsReceiptsQuery;
  onChange: (patch: Partial<GoodsReceiptsQuery>) => void;
}) {
  const { suppliers, warehouses } = useReceiptFilterOptions();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query.search}
              onChange={(event) => onChange({ search: event.target.value })}
              // Names exactly the two fields the API searches — a placeholder
              // promising a field the server does not match is a bug report
              // waiting to be filed.
              placeholder="Cari nomor penerimaan atau catatan"
              aria-label="Cari penerimaan"
              className="pl-9"
            />
          </div>

          <Select
            value={query.supplierId || ALL}
            onValueChange={(value) =>
              onChange({ supplierId: value === ALL ? "" : value })
            }
          >
            <SelectTrigger aria-label="Filter supplier" className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua supplier</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier._id} value={supplier._id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={query.warehouseId || ALL}
            onValueChange={(value) =>
              onChange({ warehouseId: value === ALL ? "" : value })
            }
          >
            <SelectTrigger aria-label="Filter gudang" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua gudang</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse._id} value={warehouse._id}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={query.purchaseType === "" ? ALL : query.purchaseType}
            onValueChange={(value) =>
              onChange({
                purchaseType: value === ALL ? "" : (value as PurchaseType),
              })
            }
          >
            <SelectTrigger aria-label="Filter jenis pembelian" className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua jenis</SelectItem>
              {TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Can feature="goodsReceipts" action="create">
          <Button asChild>
            <Link href="/dashboard/purchasing/receipts/new">
              <Plus className="size-4" />
              Terima barang
            </Link>
          </Button>
        </Can>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="receipt-date-from" className="text-xs font-normal text-muted">
          Tanggal terima
        </Label>
        <Input
          id="receipt-date-from"
          type="date"
          value={query.dateFrom}
          onChange={(event) => onChange({ dateFrom: event.target.value })}
          aria-label="Tanggal terima dari"
          className="w-40"
        />
        <span className="text-xs text-muted">s/d</span>
        <Input
          type="date"
          value={query.dateTo}
          onChange={(event) => onChange({ dateTo: event.target.value })}
          aria-label="Tanggal terima sampai"
          className="w-40"
        />
        {(query.dateFrom || query.dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ dateFrom: "", dateTo: "" })}
          >
            Reset tanggal
          </Button>
        )}
      </div>
    </div>
  );
}
