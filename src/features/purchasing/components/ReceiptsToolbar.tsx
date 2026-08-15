"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterSearch,
  FilterSelect,
  namedOptions,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { PurchaseType } from "@/types/api";

import { useReceiptFilterOptions } from "../hooks/useReceiptFilterOptions";
import type { GoodsReceiptsQuery } from "../hooks/useGoodsReceipts";

/**
 * The goods-receipt list controls: free-text search, supplier, warehouse,
 * purchase type, a date range, and the way to the create screen.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useGoodsReceipts. Mirrors SuppliersToolbar.
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
const TYPES = withAll<PurchaseType | "">(
  [
    { value: "beli_putus", label: "Beli putus" },
    { value: "konsinyasi", label: "Konsinyasi" },
  ],
  "Semua jenis",
);

export function ReceiptsToolbar({
  query,
  onChange,
}: {
  query: GoodsReceiptsQuery;
  onChange: (patch: Partial<GoodsReceiptsQuery>) => void;
}) {
  const { suppliers, warehouses } = useReceiptFilterOptions();

  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          // Names exactly the two fields the API searches — a placeholder
          // promising a field the server does not match is a bug report
          // waiting to be filed.
          placeholder="Cari nomor penerimaan atau catatan"
          ariaLabel="Cari penerimaan"
        />
      }
      actions={
        <Can feature="goodsReceipts" action="create">
          <Button asChild>
            <Link href="/dashboard/purchasing/receipts/new">
              <Plus className="size-4" />
              Terima barang
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Supplier"
        ariaLabel="Filter supplier"
        value={query.supplierId}
        options={withAll(namedOptions(suppliers), "Semua supplier")}
        onChange={(supplierId) => onChange({ supplierId })}
      />
      <FilterSelect
        label="Gudang"
        ariaLabel="Filter gudang"
        value={query.warehouseId}
        options={withAll(namedOptions(warehouses), "Semua gudang")}
        onChange={(warehouseId) => onChange({ warehouseId })}
      />
      <FilterSelect
        label="Jenis"
        ariaLabel="Filter jenis pembelian"
        value={query.purchaseType}
        options={TYPES}
        onChange={(purchaseType) => onChange({ purchaseType })}
      />
      <FilterDateRange
        label="Tanggal terima"
        from={query.dateFrom}
        to={query.dateTo}
        onApply={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
      />
    </FilterBar>
  );
}
