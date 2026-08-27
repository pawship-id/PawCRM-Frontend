"use client";

import { useState } from "react";

import { Alert, TextareaField } from "@/components";
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
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type {
  CustomerInvoiceDetail,
  CustomerInvoicePayment,
} from "@/types/api";

/**
 * Cancel one payment — with the reason that will be the only record of why.
 *
 * WHAT IT ACTUALLY DOES, said in the dialog rather than discovered afterwards:
 * the payment is not deleted. It posts a REVERSING journal entry against the one
 * it made, and the row stays in the timeline struck through. A user who expects
 * a row to disappear and finds it still there assumes the click failed and does
 * it again.
 *
 * THE REASON IS REQUIRED, and it is checked here before a round trip as well as
 * on the server. Six months later a reversing entry in the ledger with no
 * sentence attached is a correction nobody can account for.
 *
 * THE SUBMIT LOCKS FOR THE WHOLE FLIGHT, like the payment form's. The endpoint
 * is guarded — a second cancellation of the same payment matches nothing and
 * comes back 409 — but a double-click would still show the user an error for
 * something that worked.
 */
export function VoidPaymentDialog({
  invoice,
  payment,
  onClose,
  onVoided,
}: {
  invoice: CustomerInvoiceDetail;
  /** The payment to cancel, or null when the dialog is closed. */
  payment: CustomerInvoicePayment | null;
  onClose: () => void;
  /** Handed the UPDATED invoice the write returned — no refetch needed. */
  onVoided: (updated: CustomerInvoiceDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function close() {
    setReason("");
    setError(null);
    onClose();
  }

  async function submit() {
    if (!payment) return;

    if (!reason.trim()) {
      setError("Isi alasannya — ini satu-satunya catatan kenapa dibatalkan.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updated = await customerInvoiceService.voidPayment(
        invoice._id,
        payment.paymentId,
        { reason: reason.trim() },
      );

      swalToast("Pembayaran dibatalkan — jurnal pembaliknya sudah diposting.");
      setReason("");
      setSaving(false);
      onVoided(updated);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal membatalkan pembayaran. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={payment !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan pembayaran</DialogTitle>
          <DialogDescription>
            {payment
              ? `${formatMoney(payment.amount)} pada faktur ${invoice.invoiceNumber}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
          <p>
            Pembayaran ini <b>tidak dihapus</b>. Sistem memposting{" "}
            <b>jurnal pembalik</b> dan barisnya tetap terlihat di riwayat dengan
            tanda dibatalkan — jadi kesalahan dan koreksinya sama-sama tercatat.
          </p>
          <p className="mt-2 text-muted">
            Sisa tagihan akan naik kembali sebesar jumlah ini, dan status faktur
            ikut menyesuaikan.
          </p>
        </div>

        <TextareaField
          label="Alasan"
          name="void-reason"
          value={reason}
          disabled={saving}
          onChange={(event) => setReason(event.target.value)}
          hint="mis. Salah faktur · Dobel input · Transfer ditarik kembali"
        />

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Membatalkan…" : "Batalkan pembayaran"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
