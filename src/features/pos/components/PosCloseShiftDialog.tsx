"use client";

import { useEffect, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import { formatMoney } from "@/utils/decimal";
import type { PosShift, PosXReport } from "@/types/api";

/** Digits only — "500.000" is five hundred thousand in Indonesian, not 500. */
const WHOLE_RUPIAH = /^\d+$/;

/**
 * Tutup Kasir — the Z-Report (FR-9).
 *
 * THE CASHIER COUNTS FIRST, THEN SEES THE VARIANCE. The expected figure is
 * hidden until a count is typed, and that ordering is the entire control: shown
 * up front, it is a number to make the drawer agree with, and the count stops
 * being independent evidence of anything.
 *
 * A LARGE VARIANCE DOES NOT BLOCK CLOSING. FR-9 is explicit and the reason is
 * practical: a shop cannot stop trading tomorrow because money went missing
 * today, and a system that refused would be worked around by counting the drawer
 * to match. It asks for a note instead, which is what an investigation actually
 * needs.
 */
export function PosCloseShiftDialog({
  shift,
  open,
  onClosed,
  onOpenChange,
}: {
  shift: PosShift;
  open: boolean;
  onClosed: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [report, setReport] = useState<PosXReport | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;

    posService
      .xReport(shift._id)
      .then((result) => {
        if (active) setReport(result);
      })
      // The expected figure is a courtesy, not a precondition: a cashier can
      // still count the drawer and close the till without it.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [open, shift._id]);

  const trimmed = countedCash.trim();
  const valid = WHOLE_RUPIAH.test(trimmed);

  const expected = report?.totals.expectedCash ?? null;
  const difference =
    valid && expected !== null ? Number(trimmed) - Number(expected) : null;

  async function submit() {
    if (!valid) return;

    setSubmitting(true);
    setError(null);

    try {
      await posService.closeShift(shift._id, {
        countedCash: trimmed,
        closingNotes: notes.trim() || undefined,
      });
      onClosed();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? "Kasir gagal ditutup. Coba lagi.")
          : "Kasir gagal ditutup. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tutup kasir</DialogTitle>
          <DialogDescription>
            Hitung uang di laci, lalu masukkan jumlahnya.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="space-y-2">
          <Label htmlFor="counted-cash">Uang di laci</Label>
          <Input
            id="counted-cash"
            value={countedCash}
            onChange={(event) => setCountedCash(event.target.value)}
            inputMode="numeric"
            placeholder="500000"
            className="h-11 tabular-nums"
            autoFocus
          />
          {trimmed && !valid && (
            <p className="text-xs text-danger">
              Isi angka rupiah tanpa titik, misalnya 500000.
            </p>
          )}
        </div>

        {/* Revealed only after a count exists — see the header. */}
        {difference !== null && expected !== null && (
          <dl className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Kas seharusnya</dt>
              <dd className="tabular-nums text-foreground">
                {formatMoney(expected)}
              </dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt className="text-foreground">Selisih</dt>
              <dd
                className={
                  difference === 0
                    ? "tabular-nums text-success"
                    : "tabular-nums text-danger"
                }
              >
                {difference === 0
                  ? "Pas"
                  : `${difference > 0 ? "Lebih" : "Kurang"} ${formatMoney(
                      String(Math.abs(difference)),
                    )}`}
              </dd>
            </div>
          </dl>
        )}

        <div className="space-y-2">
          <Label htmlFor="closing-notes">Catatan</Label>
          <Input
            id="closing-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Kalau ada selisih, tulis alasannya di sini"
            className="h-11"
          />
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
            onClick={submit}
            disabled={submitting || !valid}
          >
            {submitting && <Spinner />}
            Tutup kasir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
