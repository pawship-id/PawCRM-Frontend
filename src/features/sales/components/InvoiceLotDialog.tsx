"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LotSplitEditor,
  lotRowsValid,
  type LotRow,
} from "@/features/pos/components/LotSplitEditor";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import type { PosLots } from "@/types/api";

/** One lot a row takes from — `label` is only for the row's own summary. */
export interface InvoiceLotShare {
  batchId: string;
  qty: number;
  label: string;
}

/**
 * WHICH LOTS A FAKTUR BARU ROW IS TAKEN FROM (13 October 2026, on request) —
 * the till's batch picker, at the warehouse the invoice names.
 *
 * NO ROWS IS AUTOMATIC (FEFO), the default; "Tambah batch" starts from FEFO's
 * own split. Nothing is sent until Simpan, and Simpan is refused until the rows
 * add up to the line's quantity — the server refuses the same.
 */
export function InvoiceLotDialog({
  open,
  onOpenChange,
  productId,
  productName,
  warehouseId,
  qty,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  warehouseId: string;
  /** The row's quantity — what the lots must add up to. */
  qty: number;
  value: InvoiceLotShare[];
  /** An empty list puts the row back to automatic. */
  onSave: (lots: InvoiceLotShare[]) => void;
}) {
  const [rows, setRows] = useState<LotRow[]>([]);
  const [lots, setLots] = useState<PosLots | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Seed from the row each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setRows(value.map((lot) => ({ batchId: lot.batchId, qty: lot.qty })));
    setSubmitError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError(null);

    customerInvoiceService
      .lots(productId, warehouseId)
      .then((result) => {
        if (active) setLots(result);
      })
      .catch(() => {
        if (active) setLoadError("Batch gagal dimuat. Coba lagi.");
      });

    return () => {
      active = false;
    };
  }, [open, productId, warehouseId]);

  const lotList = lots?.lots ?? [];

  function save() {
    if (!lotRowsValid(rows, lotList, qty)) {
      setSubmitError(
        "Total keseluruhan batch number harus sama dengan jumlah produk yang dibeli",
      );
      return;
    }

    onSave(
      rows.map((row) => {
        const lot = lotList.find((one) => one._id === row.batchId);
        return {
          batchId: row.batchId,
          qty: row.qty,
          label: lot?.supplierBatchCode ?? lot?.batchCode ?? "",
        };
      }),
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden overflow-y-auto p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>Pilih batch</DialogTitle>
          <DialogDescription>
            {productName} · {qty} barang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadError && <Alert variant="error">{loadError}</Alert>}

          {lots && !lots.hasExpiry && (
            <p className="text-sm text-muted">
              Produk ini tidak memakai batch kedaluwarsa — stok keluar otomatis.
            </p>
          )}
          {lots?.hasExpiry && lotList.length === 0 && (
            <p className="text-sm text-muted">
              Tidak ada batch yang masih berlaku di gudang ini.
            </p>
          )}

          {rows.length === 0 && lotList.length > 0 && (
            <p className="text-sm text-muted">
              Otomatis (FEFO) — diambil dari batch yang paling dekat
              kedaluwarsa. Tambah batch untuk memilih sendiri.
            </p>
          )}

          <LotSplitEditor
            lots={lotList}
            qty={qty}
            rows={rows}
            available={lots?.hasExpiry === true}
            onRowsChange={(next) => {
              setRows(next);
              setSubmitError(null);
            }}
          />
        </div>

        {submitError && <Alert variant="error">{submitError}</Alert>}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" onClick={save} disabled={!lots}>
            Simpan batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
