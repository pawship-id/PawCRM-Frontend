"use client";

import { useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import { formatMoney } from "@/utils/decimal";
import type { PosTransaction } from "@/types/api";

/**
 * Cancelling a sale in full (FR-11).
 *
 * ONE FIELD, AND IT IS REQUIRED. There is nothing to choose here — a void is all
 * or nothing, so no item list and no amount. The only thing this form collects
 * that the sale does not already say is WHY, and that is the whole reason the
 * dialog exists rather than a button that just does it.
 *
 * IT SAYS WHAT WILL HAPPEN BEFORE IT HAPPENS. A void reverses money already
 * taken, puts stock back and writes two correcting entries; a cashier tapping
 * "Batalkan" should not be finding that out afterwards.
 *
 * THE SHIFT RULE IS NOT ENFORCED HERE. The server refuses a void once the sale's
 * shift is closed and says to use Retur instead — and that refusal is surfaced
 * as written, because it names the alternative. Guessing at it in the browser
 * would mean two rules to keep in step, and the browser's copy would be the one
 * that drifted.
 */
export function VoidTransactionDialog({
  sale,
  onVoided,
  onOpenChange,
}: {
  sale: PosTransaction | null;
  onVoided: (voided: PosTransaction) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!sale || !reason.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const voided = await posService.voidSale(sale._id, {
        reason: reason.trim(),
      });
      setReason("");
      onVoided(voided);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Pembatalan gagal. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={sale !== null}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Batalkan transaksi</DialogTitle>
          <DialogDescription>
            {sale?.transactionNumber} ·{" "}
            {formatMoney(sale?.totals?.grandTotal ?? "0")}
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {/*
          Said plainly and up front. A void is not an edit — it reverses money
          already taken and puts stock back, and the sale stays on the record
          marked cancelled rather than disappearing.
        */}
        <Alert variant="warning">
          Seluruh transaksi dibatalkan, uangnya dikembalikan di pembukuan, dan
          stoknya kembali. Transaksinya tetap tercatat, ditandai dibatalkan.
          Kalau cuma sebagian barang yang dikembalikan, pakai Retur.
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="void-reason">Alasan</Label>
          <textarea
            id="void-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Misalnya: salah ketik, produknya beda"
            className="w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted">
            Ikut tercatat di log, jadi bisa ditelusuri nanti.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void submit()}
            disabled={submitting || !reason.trim()}
          >
            {submitting && <Spinner />}
            Batalkan transaksi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
