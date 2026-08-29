"use client";

import { useState } from "react";

import { TextareaField } from "@/components";
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
import type { CustomerInvoiceDetail } from "@/types/api";

/**
 * VOID A WHOLE INVOICE — PCR-031, and a bigger act than cancelling one payment.
 *
 * WHAT IT ACTUALLY DOES, said here rather than discovered afterwards: the goods
 * go back on the shelf and BOTH journal entries are reversed — the issuance and
 * the cost. The invoice is not deleted and its number is not reused, so it stays
 * in the list marked `void`. A user expecting the row to disappear and finding it
 * still there assumes the click failed and does it again.
 *
 * THE NUMBER IS SPELLED OUT IN THE CONFIRMATION, not a generic "this invoice".
 * Somebody with three tabs open is about to unwind a document that moved stock
 * and posted two entries; the one thing that stops them unwinding the wrong one
 * is seeing its number before they type.
 *
 * THE REASON IS REQUIRED and checked here before a round trip as well as on the
 * server. Six months later, a pair of reversals in the ledger with no sentence
 * attached is a correction nobody can account for.
 *
 * IT IS NOT OFFERED WHILE MONEY IS ON THE INVOICE. The server refuses it (409),
 * and so does the detail screen — but the reason is explained there rather than
 * here, because a dialog that opens only to say "you cannot do this" is a dialog
 * that should not have opened.
 *
 * REFUSALS ARE TOASTS, the same deliberate departure from `docs/ui-rules.md` §9
 * the rest of this module makes. Server refusals get 8 seconds; they carry an
 * instruction.
 */
export function VoidInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onVoided,
}: {
  invoice: CustomerInvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoided: (updated: CustomerInvoiceDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleVoid() {
    const trimmed = reason.trim();

    if (!trimmed) {
      swalToast("Alasan void wajib diisi.", "error");
      return;
    }

    setSaving(true);

    try {
      const updated = await customerInvoiceService.voidInvoice(
        invoice._id,
        trimmed,
      );

      // Released before the parent re-renders: a button locked forever is worse
      // than the error that locked it.
      setSaving(false);
      setReason("");
      onOpenChange(false);
      onVoided(updated);
      swalToast(`${invoice.invoiceNumber} sudah di-void.`);
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void {invoice.invoiceNumber}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Tagihan <strong>{formatMoney(invoice.total)}</strong> atas{" "}
                {invoice.customerName ?? "pelanggan terhapus"} akan dibatalkan.
              </p>
              {/* Said plainly, because none of it is guessable from the button */}
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>Barangnya kembali ke stok gudang.</li>
                <li>
                  Dua jurnal pembalik diposting — penerbitan dan HPP-nya.
                </li>
                <li>
                  Fakturnya <strong>tidak dihapus</strong>: tetap ada di daftar
                  bertanda void, dan nomornya tidak dipakai ulang.
                </li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <TextareaField
          label="Alasan void"
          name="voidReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="Wajib. Enam bulan lagi ini satu-satunya yang menjelaskan sepasang jurnal pembalik di buku besar."
          placeholder="mis. Salah pelanggan — sudah diterbitkan ulang di INV/CBS/2608/0007"
          disabled={saving}
          required
        />

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={handleVoid}
            disabled={saving || reason.trim() === ""}
          >
            {saving ? "Memproses…" : "Void faktur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
