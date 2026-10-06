"use client";

import { useState } from "react";

import { Alert, TextField } from "@/components";
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
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import type {
  GoodsReceiptDetail,
  ReceiveGoodsReceiptInput,
} from "@/types/api";

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * CONFIRMING THE GOODS ARE ON THE SHELF — the one step that posts. Until this
 * runs a filed delivery has moved no stock, made no lot and created no debt.
 *
 * ASKS FOR WHAT WAS NOT KNOWN AT FILING: the day the goods arrived (the ledger is
 * dated by it) and, for a *beli putus* delivery, the vendor's faktur if it is in
 * hand. The lines are not asked again — what is received is exactly what was
 * filed. A faktur not yet in hand is filed later from the delivery's own page.
 */
export function ReceiveReceiptDialog({
  receipt,
  onClose,
  onReceived,
}: {
  receipt: GoodsReceiptDetail;
  onClose: () => void;
  onReceived: () => void;
}) {
  const consignment = receipt.purchaseType === "konsinyasi";

  const [receivedAt, setReceivedAt] = useState(todayLocal);
  const [fileInvoice, setFileInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayLocal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filingInvoice = !consignment && fileInvoice;
  const invalid =
    receivedAt === "" ||
    (filingInvoice && (invoiceNumber.trim() === "" || invoiceDate === ""));

  async function handleSubmit() {
    if (saving || invalid) return;

    const input: ReceiveGoodsReceiptInput = {
      receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
      ...(filingInvoice
        ? {
            invoice: {
              invoiceNumber: invoiceNumber.trim(),
              invoiceDate,
            },
          }
        : {}),
    };

    setSaving(true);
    setError(null);
    try {
      await goodsReceiptService.receive(receipt._id, input);
      swalToast(
        consignment
          ? `${receipt.receiptNumber} diterima — stok naik, utang muncul saat barang terjual.`
          : `${receipt.receiptNumber} diterima — stok, HPP, dan utang diperbarui.`,
      );
      onReceived();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Terima barang {receipt.receiptNumber}</DialogTitle>
          <DialogDescription>
            Barang sudah ada di gudang? Menerima akan menaikkan stok, membuat
            lot, dan menggeser HPP
            {consignment
              ? ", tanpa jurnal — utang ke supplier baru muncul saat barang terjual, sebesar harga setor."
              : ", serta mencatat utang ke supplier."} Setelah
            itu penerimaan tidak bisa dibatalkan — koreksinya lewat retur.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        <TextField
          label="Tanggal barang diterima"
          name="receivedAt"
          type="date"
          value={receivedAt}
          onChange={(event) => setReceivedAt(event.target.value)}
          disabled={saving}
          required
          hint="Jurnal dan stok dicatat pada tanggal ini."
        />

        {!consignment && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="receiveFileInvoice"
                checked={fileInvoice}
                onCheckedChange={(checked) => setFileInvoice(checked === true)}
                disabled={saving}
              />
              <div>
                <Label htmlFor="receiveFileInvoice">
                  Sekalian catat faktur supplier
                </Label>
                <p className="mt-1 text-xs text-muted">
                  Kosongkan kalau fakturnya belum datang — utang tetap tercatat,
                  fakturnya bisa dicatat nanti dari halaman penerimaan ini.
                </p>
              </div>
            </div>

            {fileInvoice && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="No. faktur supplier"
                  name="invoiceNumber"
                  value={invoiceNumber}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                  placeholder="mis. INV/2026/014"
                  maxLength={60}
                  disabled={saving}
                  required
                  hint="Nomor di faktur supplier, bukan nomor sistem."
                />
                <TextField
                  label="Tanggal faktur"
                  name="invoiceDate"
                  type="date"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                  disabled={saving}
                  required
                  hint="Jatuh tempo dihitung dari tanggal ini."
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={saving || invalid}>
            {saving ? "Memproses…" : "Terima barang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
