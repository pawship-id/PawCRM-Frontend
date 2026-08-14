"use client";

import { useEffect, useState } from "react";

import { Alert, Button, Card, Spinner } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ApiError } from "@/services/api-error";
import { productBatchService } from "@/services/productBatch.service";
import { formatMoney, formatQty } from "@/utils/decimal";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";
import type { SupplierConsignmentRow } from "@/types/api";

/**
 * Konsinyasi Outstanding — whose goods are still on our shelves.
 *
 * The supplier detail screen already shows one vendor's figure; this is the same
 * endpoint with no `supplierId`, which is the cross-supplier view nothing had.
 *
 * THE ONE THING THIS SCREEN MUST NOT LET A READER DO is add these numbers to the
 * payables. Consigned goods belong to the supplier until they sell, so nothing
 * here is owed — it is the other half of a vendor's position, not more of the
 * same half. The banner says so, and it is not decoration: an owner reading two
 * totals on two screens will otherwise sum them.
 */

const EXPORT_COLUMNS: XlsxColumn<SupplierConsignmentRow>[] = [
  { header: "Supplier", value: (row) => row.supplierName ?? "(dihapus)" },
  { header: "Jumlah lot", value: (row) => row.lotCount, type: "number" },
  { header: "Jumlah produk", value: (row) => row.productCount, type: "number" },
  { header: "Qty tersisa", value: (row) => row.qtyRemaining, type: "number" },
  { header: "Nilai titipan", value: (row) => row.value, type: "number" },
];

export function ConsignmentScreen() {
  const [rows, setRows] = useState<SupplierConsignmentRow[]>([]);
  const [totalValue, setTotalValue] = useState("0");
  const [totalLots, setTotalLots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    productBatchService
      .consignmentSummary()
      .then((result) => {
        if (!active) return;
        setRows(result.items);
        setTotalValue(result.totalValue);
        setTotalLots(result.totalLots);
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
  }, []);

  const exportRows = async () => {
    setExporting(true);
    try {
      await exportToXlsx(EXPORT_COLUMNS, rows, "konsinyasi-outstanding.xlsx", {
        sheetName: "Konsinyasi",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}

      <Alert variant="info">
        <p>
          Angka di sini <strong>bukan utang</strong>. Barang konsinyasi masih
          milik supplier sampai laku, jadi belum ada yang perlu dibayar — utang
          baru muncul saat barangnya terjual. Untuk yang benar-benar terutang,
          lihat{" "}
          <Link
            href="/dashboard/purchasing/payables"
            className="underline underline-offset-2"
          >
            Utang Supplier
          </Link>
          . Jangan dijumlahkan dengan halaman itu.
        </p>
      </Alert>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Supplier" value={String(rows.length)} />
        <Tile label="Lot di gudang" value={String(totalLots)} />
        <Tile label="Nilai titipan" value={formatMoney(totalValue)} />
      </div>

      <Card title="Per supplier">
        <div className="mb-4 flex justify-end">
          <Button
            variant="secondary"
            onClick={exportRows}
            disabled={exporting || loading || rows.length === 0}
          >
            {exporting ? <Spinner /> : null}
            Export .xlsx
          </Button>
        </div>

        <div className={cn("overflow-x-auto", loading && "opacity-60")}>
          {rows.length === 0 && !loading ? (
            <p className="text-sm text-muted">
              Tidak ada barang konsinyasi di gudang saat ini.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Lot</TableHead>
                  <TableHead className="text-right">Produk</TableHead>
                  <TableHead className="text-right">Qty tersisa</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.supplierId}>
                    <TableCell>
                      {/*
                        A vendor soft-deleted since. The goods are still on the
                        shelf either way, so the row stays and only the label is
                        missing — hiding it would lose the stock.
                      */}
                      {row.supplierName ? (
                        <Link
                          href={`/dashboard/purchasing/suppliers/${row.supplierId}`}
                          className="hover:underline"
                        >
                          {row.supplierName}
                        </Link>
                      ) : (
                        <span className="text-muted">
                          Supplier sudah dihapus
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.lotCount}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.productCount}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatQty(row.qtyRemaining)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(row.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
