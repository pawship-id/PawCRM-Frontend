"use client";

import { useState } from "react";

import { Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { GoodsReceiptListRow } from "@/types/api";

/** What a row needs — a list row, or the receipt the page was opened from. */
export type ReceiptChoice = Pick<
  GoodsReceiptListRow,
  | "_id"
  | "receiptNumber"
  | "receiptDate"
  | "branchId"
  | "branchName"
  | "warehouseId"
  | "warehouseName"
  | "grandTotal"
>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Why a row cannot join the ones already ticked — null when it can. */
function lockReason(row: ReceiptChoice, anchor: ReceiptChoice | undefined) {
  if (!anchor || anchor._id === row._id) return null;
  const otherBranch = row.branchId !== anchor.branchId;
  const otherWarehouse = row.warehouseId !== anchor.warehouseId;
  if (otherBranch && otherWarehouse) return "Beda cabang dan gudang";
  if (otherBranch) return "Beda cabang";
  if (otherWarehouse) return "Beda gudang";
  return null;
}

/**
 * "PENERIMAAN YANG BELUM ADA FAKTURNYA" — opened when the picked supplier has
 * deliveries still waiting for a bill (16 October 2026, BO). Tick one or more
 * to bill them on ONE invoice, or go on with a manual one.
 *
 * ONE CABANG AND ONE GUDANG PER INVOICE: the server refuses a mix, so after the
 * first tick every row from elsewhere is disabled and says why — offering a
 * combination that can only fail is worse than not offering it. The first row
 * ticked (in list order) is the anchor; untick it and the lock moves.
 */
export function UninvoicedReceiptsDialog({
  receipts,
  initialSelected,
  loading,
  truncated,
  onManual,
  onConfirm,
  onClose,
}: {
  receipts: ReceiptChoice[];
  initialSelected: string[];
  loading: boolean;
  truncated: boolean;
  onManual: () => void;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [ticked, setTicked] = useState<string[]>(initialSelected);
  const anchor = receipts.find((row) => ticked.includes(row._id));

  function toggle(id: string, on: boolean) {
    setTicked((current) =>
      on ? [...current, id] : current.filter((one) => one !== id),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Penerimaan yang belum ada fakturnya</DialogTitle>
          <DialogDescription>
            Centang penerimaan yang ditagih faktur ini — boleh beberapa, asal
            dari cabang dan gudang yang sama. Barangnya digabung per produk.
            Atau catat faktur manual kalau barangnya belum datang.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted">
            <Spinner /> Memuat penerimaan…
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Pilih</span>
                  </TableHead>
                  <TableHead>No. GR</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((row) => {
                  const checked = ticked.includes(row._id);
                  const reason = checked ? null : lockReason(row, anchor);
                  return (
                    <TableRow
                      key={row._id}
                      className={cn(
                        checked && "bg-navy-100",
                        reason && "text-muted",
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          aria-label={`Pilih ${row.receiptNumber}`}
                          checked={checked}
                          disabled={Boolean(reason)}
                          onCheckedChange={(value) =>
                            toggle(row._id, value === true)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {row.receiptNumber}
                        {reason && (
                          <span className="block text-xs">{reason}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDate(row.receiptDate)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.branchName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.warehouseName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatMoney(row.grandTotal)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {truncated && (
          <p className="text-sm text-muted">
            Hanya {receipts.length} penerimaan pertama yang ditampilkan.
          </p>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onManual}>
            Buat faktur manual
          </Button>
          <Button
            onClick={() => onConfirm(ticked)}
            disabled={ticked.length === 0}
          >
            Buat dari penerimaan ({ticked.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
