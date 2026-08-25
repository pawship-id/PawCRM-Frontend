"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { posService } from "@/services/pos.service";
import { formatMoney } from "@/utils/decimal";
import type { PosXReport } from "@/types/api";

/**
 * The mid-shift read (FR-9).
 *
 * READ-ONLY AND REPEATABLE, which is the whole difference from the Z-Report: an
 * X-Report is a cashier checking their drawer against the system without
 * committing to anything. Nothing here writes, so it can be opened as often as
 * somebody is nervous.
 *
 * THE CASH LINE IS THE ONE THAT MATTERS and it is separated deliberately. A
 * transfer settles into a bank account and a QRIS into a clearing account —
 * counting either toward the drawer would make it look flush and the cashier
 * look short by exactly the amount nobody handed over.
 */
export function PosXReportDialog({
  shiftId,
  onOpenChange,
}: {
  shiftId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [report, setReport] = useState<PosXReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shiftId) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    posService
      .xReport(shiftId)
      .then((result) => {
        if (active) setReport(result);
      })
      .catch(() => {
        if (active) setError("Laporan gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shiftId]);

  return (
    <Dialog open={shiftId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>X-Report</DialogTitle>
          <DialogDescription>
            Ringkasan shift sampai saat ini. Tidak menutup kasir.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading || !report ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat…
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Transaksi</dt>
                <dd className="tabular-nums text-foreground">
                  {report.transactionCount}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total penjualan</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(report.totals.takings)}
                </dd>
              </div>
            </dl>

            <div>
              <span className="mb-1 block text-xs font-medium text-muted">
                Per metode bayar
              </span>
              <dl className="space-y-1 text-sm">
                {report.breakdown.length === 0 ? (
                  <p className="text-sm text-muted">Belum ada pembayaran.</p>
                ) : (
                  report.breakdown.map((row) => (
                    <div
                      key={row.channelId}
                      className="flex justify-between gap-2"
                    >
                      <dt className="truncate text-muted">{row.channelName}</dt>
                      <dd className="shrink-0 tabular-nums text-foreground">
                        {formatMoney(row.net)}
                      </dd>
                    </div>
                  ))
                )}
              </dl>
            </div>

            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Saldo awal</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(report.shift.openingCash)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Penjualan tunai</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(report.totals.cashTakings)}
                </dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt className="text-foreground">Kas seharusnya</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(report.totals.expectedCash)}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
