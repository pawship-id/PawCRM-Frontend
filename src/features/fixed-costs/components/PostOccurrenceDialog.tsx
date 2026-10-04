"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { fixedCostService } from "@/services/fixedCost.service";
import type { FixedCost } from "@/types/accounting";
import { formatMoney } from "@/utils/decimal";

import { formatDate, KIND_LABEL } from "../labels";

/**
 * "Catat" — record the occurrence that is due.
 *
 * A CONFIRM, NOT A ONE-CLICK BUTTON, and that is the point of the file. This
 * writes a real, numbered cash transaction with its own journal entry: it is
 * the one act on this screen that moves money, it cannot be undone from here
 * (the transaction is cancelled in the tab next door, which posts a reversal),
 * and the figure is a month's rent. A dialog that states the amount and the
 * date before it happens costs one click and prevents the mistake that a
 * misplaced click on a table row otherwise makes permanent.
 *
 * IT DOES NOT ASK WHICH OCCURRENCE. The server always posts the next one
 * outstanding — letting a caller choose would let it skip one, and a skipped
 * occurrence is a hole nothing would ever show again.
 */
export function PostOccurrenceDialog({
  fixedCost,
  onClose,
  onPosted,
}: {
  /** The row being recorded, or null when the dialog is shut. */
  fixedCost: FixedCost | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!fixedCost) return;

    setSaving(true);
    setError(null);

    /*
      ONLY THE REQUEST IS INSIDE THE `try`. What follows runs because the money
      already moved — a numbered transaction with a journal entry behind it. If
      the toast or the redirect threw and this caught it, the screen would say
      "Gagal mencatat" for an occurrence that WAS recorded, and the obvious
      response to that message is to press the button again.
    */
    let transactionNumber: string | null = null;

    try {
      const { transaction } = await fixedCostService.post(fixedCost._id);
      transactionNumber = transaction.number;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Gagal mencatat biaya tetap. Coba lagi.",
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    swalToast(
      `Tersimpan. ${transactionNumber ?? "Transaksi"} sudah masuk daftar transaksi.`,
    );
    onPosted();
    onClose();
    // The list's own numbers move too — the cards above it are the server's.
    router.refresh();
  }

  return (
    <Dialog
      open={Boolean(fixedCost)}
      onOpenChange={(open) => {
        // Never shut mid-write: the request is already in flight and the row
        // behind this dialog would redraw from a state nobody had confirmed.
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent>
        {fixedCost && (
          <>
            <DialogHeader>
              <DialogTitle>Catat {fixedCost.name}?</DialogTitle>
              <DialogDescription>
                {KIND_LABEL[fixedCost.kind]}{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatMoney(fixedCost.amount)}
                </span>{" "}
                lewat {fixedCost.accountName ?? "akun kas"}, tertanggal{" "}
                <span className="tabular-nums">
                  {formatDate(fixedCost.nextDueAt)}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 text-sm">
              {/*
                THE BACKLOG, SAID PLAINLY. One press records ONE occurrence, and
                a shop three months behind should not be left thinking the
                button cleared all three.
              */}
              {fixedCost.dueCount > 1 && (
                <Alert variant="warning">
                  Ada {fixedCost.dueCount} jatuh tempo yang belum dicatat. Tombol
                  ini mencatat yang paling lama dulu — ulangi untuk sisanya.
                </Alert>
              )}

              <p className="text-muted">
                Transaksinya dapat nomor sendiri dan langsung masuk ke jurnal.
                Kalau keliru, batalkan lewat tab Transaksi.
              </p>

              {error && <Alert variant="error">{error}</Alert>}
            </div>

            <DialogFooter>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={saving}
              >
                Batal
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? "Menyimpan…" : "Catat sekarang"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
