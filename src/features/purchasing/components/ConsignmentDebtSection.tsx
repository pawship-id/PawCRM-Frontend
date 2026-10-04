"use client";

import { useState } from "react";

import { Alert, Card } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/features/permissions";
import { formatMoney, toMinor } from "@/utils/decimal";
import type { ConsignmentOutstandingRow } from "@/types/api";

import { useConsignmentOutstanding } from "../hooks/useConsignmentOutstanding";
import { ConsignmentSettleDialog } from "./ConsignmentSettleDialog";

/**
 * Pembelian › Ringkasan › "Utang konsinyasi" — what the shop owes consignors
 * for goods that have SOLD, per supplier, and the "Setor" that pays it.
 *
 * It replaced a note saying this list did not exist yet. The debt only appears
 * when a unit sells, at the harga setor typed on the receipt line, so an empty
 * list is the normal state of a shop whose consigned goods have not moved — the
 * empty state says that instead of looking broken.
 *
 * The parent gates it on `purchaseInvoices:read`; "Setor" additionally needs
 * `purchaseInvoices:pay` (the same separation of duties as paying an invoice).
 * The cabang is the tab's own, so this agrees with the cards above it.
 */
export function ConsignmentDebtSection({
  branchId,
  enabled,
}: {
  branchId: string;
  enabled: boolean;
}) {
  const { can } = usePermissions();
  const mayPay = can("purchaseInvoices", "pay");
  const { data, failed, loading, refetch } = useConsignmentOutstanding(
    enabled,
    branchId,
  );
  const [settling, setSettling] = useState<ConsignmentOutstandingRow | null>(
    null,
  );

  const rows = data?.items ?? [];

  return (
    <Card>
      <h2 className="text-base font-bold text-foreground">Utang konsinyasi</h2>

      {failed && !data ? (
        <Alert variant="error" className="mt-3">
          Utang konsinyasi gagal dimuat.{" "}
          <button type="button" className="underline" onClick={refetch}>
            Muat ulang
          </button>
        </Alert>
      ) : loading && !data ? (
        <p className="mt-2 text-sm text-muted">Memuat utang konsinyasi…</p>
      ) : rows.length === 0 ? (
        <div className="mt-2">
          <p className="text-sm font-medium text-foreground">
            Belum ada barang konsinyasi yang terjual.
          </p>
          <p className="mt-1 text-sm text-muted">
            Utang konsinyasi baru muncul saat barang terjual, sebesar harga
            setor.
          </p>
        </div>
      ) : (
        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Terjual</TableHead>
              <TableHead className="text-right">Sudah disetor</TableHead>
              <TableHead className="text-right">Sisa utang</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Aksi</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.supplierId}>
                <TableCell className="font-medium">
                  {row.supplierName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.sold)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.settled)}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {formatMoney(row.outstanding)}
                </TableCell>
                <TableCell className="text-right">
                  {mayPay && (toMinor(row.outstanding) ?? 0n) > 0n && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSettling(row)}
                    >
                      Setor
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {settling && (
        <ConsignmentSettleDialog
          row={settling}
          branchId={branchId}
          onClose={() => setSettling(null)}
          onSettled={() => {
            setSettling(null);
            refetch();
          }}
        />
      )}
    </Card>
  );
}
