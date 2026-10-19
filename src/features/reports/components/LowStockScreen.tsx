"use client";

import { SkuText } from "@/components/SkuText";
import { useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  DataTable,
  Pagination,
  Spinner,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";
import { formatQty } from "@/utils/decimal";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";
import type { LowStockSort, Product } from "@/types/inventory";

/** A catalogue row plus the quantity that put it below its threshold. */
type LowStockRow = Product & { qtyOnHand: string };

/**
 * Stok Minim — what to reorder.
 *
 * The same endpoint the inventory hub's alert card uses, given a full page: the
 * hub answers "is there anything to do today", this answers "what, exactly".
 * There is no second API and no second idea of what "low" means.
 *
 * THE THRESHOLD IS PER PRODUCT, NOT PER WAREHOUSE, so this screen has no
 * warehouse filter. `minStock` lives on the catalogue row and `qtyOnHand` sums
 * every location, so filtering by one warehouse compares a single shelf against
 * the whole product's minimum and reads a product as low whenever it is merely
 * stored somewhere else.
 *
 * The API does accept `warehouseId`, and the inventory hub offers it — a person
 * standing in one shop is entitled to ask what THAT shop should pull in, and the
 * hub says on screen which comparison the numbers are then making. This is the
 * reorder REPORT: a page somebody exports and orders from, where the unqualified
 * figure is the one the threshold actually describes.
 *
 * THE HEADERS SORT, ON THE SERVER (BO, 19 October 2026) — `sort` on
 * `/products/low-stock`. It opens on `stockAsc`, the API's default: the emptiest
 * shelf first. Kurang is computed there too (batas − stok), so ordering by it
 * walks every page, not this one.
 */

const PAGE_SIZE = 50;

const DEFAULT_SORT: LowStockSort = "stockAsc";

const SORT_OPTIONS: SortOptions<LowStockSort> = {
  sku: { asc: "skuAsc", desc: "skuDesc" },
  name: { asc: "nameAsc", desc: "nameDesc" },
  stock: { asc: "stockAsc", desc: "stockDesc" },
  minStock: { asc: "minStockAsc", desc: "minStockDesc", first: "desc" },
  shortage: { asc: "shortageAsc", desc: "shortageDesc", first: "desc" },
};

/** Batas − stok, as the export and the Kurang column both read it. */
function shortageOf(row: LowStockRow) {
  return Number(row.minStock ?? 0) - Number(row.qtyOnHand);
}

const COLUMNS: DataTableColumn<LowStockRow>[] = [
  {
    id: "sku",
    header: "SKU",
    cellClassName: "tabular-nums text-xs",
    cell: (row) => <SkuText value={row.sku} />,
  },
  { id: "name", header: "Produk", cell: (row) => row.name },
  {
    id: "stock",
    header: "Stok",
    align: "right",
    cell: (row) => `${formatQty(row.qtyOnHand)} ${row.unit}`,
  },
  {
    id: "minStock",
    header: "Batas",
    align: "right",
    cellClassName: "text-muted",
    cell: (row) => row.minStock,
  },
  {
    id: "shortage",
    header: "Kurang",
    align: "right",
    cellClassName: "text-danger",
    cell: (row) => formatQty(String(shortageOf(row))),
  },
];

/** What the Card says the order is — the truth for each header's orderings. */
const SORT_DESCRIPTIONS: Record<LowStockSort, string> = {
  stockAsc: "Diurutkan dari stok paling sedikit.",
  stockDesc: "Diurutkan dari stok paling banyak.",
  skuAsc: "Diurutkan menurut SKU, A–Z.",
  skuDesc: "Diurutkan menurut SKU, Z–A.",
  nameAsc: "Diurutkan menurut nama produk, A–Z.",
  nameDesc: "Diurutkan menurut nama produk, Z–A.",
  minStockAsc: "Diurutkan dari batas minimum paling kecil.",
  minStockDesc: "Diurutkan dari batas minimum paling besar.",
  shortageAsc: "Diurutkan dari kekurangan paling sedikit.",
  shortageDesc: "Diurutkan dari kekurangan paling banyak.",
};

const EXPORT_COLUMNS: XlsxColumn<LowStockRow>[] = [
  { header: "SKU", value: (row) => row.sku },
  { header: "Produk", value: (row) => row.name },
  { header: "Satuan", value: (row) => row.unit },
  { header: "Stok saat ini", value: (row) => row.qtyOnHand, type: "number" },
  { header: "Batas minimum", value: (row) => row.minStock, type: "number" },
  {
    header: "Kurang",
    value: shortageOf,
    type: "number",
  },
];

export function LowStockScreen() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<LowStockSort>(DEFAULT_SORT);
  const [rows, setRows] = useState<LowStockRow[]>([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productService
      .lowStock({ page, limit: PAGE_SIZE, sort })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
        setPagination({
          total: result.pagination.total,
          totalPages: result.pagination.totalPages,
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Laporan gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, sort]);

  /**
   * Exports THIS PAGE, and says so on the button.
   *
   * The endpoint has no CSV stream, and the list is bounded by design — a
   * restock list with hundreds of pages means the thresholds are wrong, not that
   * the export is. Walking every page here would be a loop that mostly runs when
   * something else is already broken.
   */
  const exportPage = async () => {
    setExporting(true);
    try {
      await exportToXlsx(EXPORT_COLUMNS, rows, "stok-minim.xlsx", {
        sheetName: "Stok Minim",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}

      <Card
        title={`${pagination.total} produk perlu restock`}
        description={`${SORT_DESCRIPTIONS[sort]} Klik judul kolom untuk mengubah urutan.`}
      >
        <div className="mb-4 flex justify-end">
          <Button
            variant="secondary"
            onClick={exportPage}
            disabled={exporting || loading || rows.length === 0}
          >
            {exporting ? <Spinner /> : null}
            Export halaman ini (.xlsx)
          </Button>
        </div>

        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row._id}
          sort={{
            value: sort,
            options: SORT_OPTIONS,
            // A new order is a new walk: back to its first page.
            onChange: (next) => {
              setSort(next);
              setPage(1);
            },
          }}
          loading={loading}
          bare
          empty={
            <p className="text-sm text-muted">
              Tidak ada produk di bawah batas minimum. Produk yang batasnya
              masih nol tidak dihitung — atur <code>min_stock</code> di detail
              produk supaya ikut terpantau.
            </p>
          }
        />

        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="produk"
            unitPlural="produk"
            onPageChange={setPage}
          />
        </div>
      </Card>
    </div>
  );
}
