"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Card, Pagination, Spinner } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";
import { formatQty } from "@/utils/decimal";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";
import type { Product } from "@/types/inventory";

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
 * every location, so filtering by one warehouse would report a product as low
 * whenever it is merely stored somewhere else — the behaviour `useLowStockAlert`
 * documents having removed.
 */

const PAGE_SIZE = 50;

const EXPORT_COLUMNS: XlsxColumn<LowStockRow>[] = [
  { header: "SKU", value: (row) => row.sku },
  { header: "Produk", value: (row) => row.name },
  { header: "Satuan", value: (row) => row.unit },
  { header: "Stok saat ini", value: (row) => row.qtyOnHand, type: "number" },
  { header: "Batas minimum", value: (row) => row.minStock, type: "number" },
  {
    header: "Kurang",
    value: (row) => Number(row.minStock ?? 0) - Number(row.qtyOnHand),
    type: "number",
  },
];

export function LowStockScreen() {
  const [page, setPage] = useState(1);
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
      .lowStock({ page, limit: PAGE_SIZE })
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
  }, [page]);

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
        description="Diurutkan paling mendesak di atas — makin jauh di bawah batas, makin tinggi urutannya."
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

        <div className={cn("overflow-x-auto", loading && "opacity-60")}>
          {rows.length === 0 && !loading ? (
            <p className="text-sm text-muted">
              Tidak ada produk di bawah batas minimum. Produk yang batasnya masih
              nol tidak dihitung — atur <code>min_stock</code> di detail produk
              supaya ikut terpantau.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Batas</TableHead>
                  <TableHead className="text-right">Kurang</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell className="tabular-nums text-xs">
                      {row.sku}
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(row.qtyOnHand)} {row.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted">
                      {row.minStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {formatQty(
                        String(
                          Number(row.minStock ?? 0) - Number(row.qtyOnHand),
                        ),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

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
