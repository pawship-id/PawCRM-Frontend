"use client";

import { useState } from "react";

import { Alert, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { consignmentSettlementService } from "@/services/consignmentSettlement.service";
import { formatMoney, isDecimal, toMinor } from "@/utils/decimal";
import type { ConsignmentOutstandingRow, PaymentMethod } from "@/types/api";

import { PaymentAccountFields } from "./PaymentAccountFields";

/** `yyyy-mm-dd` for today, as a date input holds it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Setor" — pay a consignor what the shop owes them for goods that have sold.
 *
 * DEFAULTS TO THE WHOLE `outstanding` because settling in full is the ordinary
 * case; typing less is a partial setor. THE CAP IS A COURTESY, NOT THE
 * AUTHORITY: the server answers 400 above what it sees outstanding, and that
 * reason is shown here verbatim.
 *
 * NOT IDEMPOTENT — `POST /consignment-settlements` has no key, so a double click
 * would pay the consignor twice. `saving` locks every control for the flight and
 * is released on failure only; success closes the dialog.
 *
 * THE PAYMENT-ACCOUNT FIELDS ARE `RecordPaymentForm`'s (`PaymentAccountFields`):
 * the money leaves the shop the same way a supplier invoice is paid.
 */
export function ConsignmentSettleDialog({
  row,
  branchId,
  onClose,
  onSettled,
}: {
  row: ConsignmentOutstandingRow;
  /** The cabang the Ringkasan tab is scoped to; "" = none chosen. */
  branchId: string;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [amount, setAmount] = useState(row.outstanding);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [channelId, setChannelId] = useState("");
  const [at, setAt] = useState(today);
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstandingMinor = toMinor(row.outstanding) ?? 0n;
  const amountMinor = isDecimal(amount) ? (toMinor(amount) ?? 0n) : 0n;
  const overCap = amountMinor > outstandingMinor;
  const invalid = amountMinor <= 0n || overCap || channelId === "" || at === "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || invalid) return;

    setSaving(true);
    setError(null);
    try {
      await consignmentSettlementService.create({
        supplierId: row.supplierId,
        ...(branchId ? { branchId } : {}),
        amount: amount.trim(),
        at,
        method,
        channelId,
        // Empty means "none", which the API models as absent.
        ...(ref.trim() ? { ref: ref.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      swalToast(
        `Setor ${formatMoney(amount.trim())} ke ${row.supplierName} tercatat.`,
      );
      onSettled();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal menyimpan setoran. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Setor ke {row.supplierName}</DialogTitle>
            <DialogDescription>
              Sisa utang konsinyasi {formatMoney(row.outstanding)}. Setoran
              langsung memposting jurnal dan tidak bisa dibatalkan dari sini.
            </DialogDescription>
          </DialogHeader>

          {error && <Alert variant="error">{error}</Alert>}

          <TextField
            label="Nominal setor"
            name="amount"
            inputMode="decimal"
            value={amount}
            disabled={saving}
            onChange={(event) => setAmount(event.target.value)}
            error={
              overCap
                ? `Melebihi sisa utang ${formatMoney(row.outstanding)}.`
                : undefined
            }
            hint={`Maksimal ${formatMoney(row.outstanding)}`}
          />

          <PaymentAccountFields
            method={method}
            channelId={channelId}
            onMethodChange={setMethod}
            onChannelChange={setChannelId}
            disabled={saving}
            idPrefix="setor"
          />

          <TextField
            label="Tanggal setor"
            name="at"
            type="date"
            value={at}
            disabled={saving}
            onChange={(event) => setAt(event.target.value)}
            hint="Tanggal uang benar-benar keluar — ini yang dipakai jurnalnya."
          />

          <TextField
            label="Nomor referensi"
            name="ref"
            value={ref}
            disabled={saving}
            onChange={(event) => setRef(event.target.value)}
            placeholder="opsional"
            hint="Nomor transfer atau bukti setor."
          />

          <TextField
            label="Catatan"
            name="notes"
            value={notes}
            disabled={saving}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="opsional"
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving || invalid}>
              {saving ? "Menyimpan…" : "Simpan setoran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
