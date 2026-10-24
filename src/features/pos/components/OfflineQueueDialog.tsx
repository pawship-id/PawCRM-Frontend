"use client";

import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ping, setForcedOffline } from "@/lib/connectivity";
import { formatMoney } from "@/utils/decimal";

import { listQueued, type QueuedSale } from "../offline/queue";
import type { OfflineTill } from "../offline/useOfflineTill";

const STATUS: Record<QueuedSale["status"], { label: string; tint: string }> = {
  pending: { label: "Menunggu dikirim", tint: "bg-tint-warning text-secondary-foreground" },
  waiting_cashier: { label: "Menunggu kasir ini login", tint: "bg-tint-warning text-secondary-foreground" },
  synced: { label: "Terkirim", tint: "bg-tint-success text-success" },
  needs_review: { label: "Perlu dicek admin", tint: "bg-tint-danger text-danger-ink" },
  rejected: { label: "Ditolak admin", tint: "bg-tint-neutral text-muted" },
  failed: { label: "Ditolak server", tint: "bg-tint-danger text-danger-ink" },
};

function timeOf(value: string): string {
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * THE SALES THIS DEVICE RANG UP OFFLINE, AND THE CONNECTION'S CONTROLS (POS
 * offline mode, 19 October 2026). One place for the cashier to see what is
 * still waiting, send it by hand, reprint a slip, and choose offline mode
 * outright when the connection is too slow to wait for.
 */
export function OfflineQueueDialog({
  open,
  till,
  onOpenChange,
  onReceipt,
}: {
  open: boolean;
  till: OfflineTill;
  onOpenChange: (open: boolean) => void;
  onReceipt: (saleId: string) => void;
}) {
  const [records, setRecords] = useState<QueuedSale[] | null>(null);
  const [checking, setChecking] = useState(false);
  const { state, connectivity } = till;

  useEffect(() => {
    if (!open) return;
    let active = true;
    void listQueued().then((rows) => {
      if (active) setRecords(rows);
    });
    return () => {
      active = false;
    };
    // Re-read after every sync, so statuses move while the dialog is open.
  }, [open, state.pendingCount, state.reviewCount, state.lastSyncAt]);

  async function checkNow() {
    setChecking(true);
    try {
      await ping();
      await ping();
      await till.syncNow();
    } finally {
      setChecking(false);
    }
  }

  const fetchedAt = state.snapshot.fetchedAt ? timeOf(state.snapshot.fetchedAt) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transaksi offline</DialogTitle>
          <DialogDescription>
            {connectivity.offline
              ? "Kasir sedang offline. Transaksi disimpan di perangkat ini dan dikirim otomatis saat koneksi kembali."
              : "Kasir online. Transaksi yang belum terkirim dikirim otomatis setiap 30 detik."}
          </DialogDescription>
        </DialogHeader>

        {till.unavailableReason && (
          <Alert variant="warning">Mode offline belum siap: {till.unavailableReason}.</Alert>
        )}
        {state.lastSyncError && !connectivity.offline && (
          <Alert variant="warning">{state.lastSyncError}</Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-hover p-3">
          <div className="flex items-center gap-2">
            <Switch
              id="force-offline"
              checked={connectivity.forced}
              onCheckedChange={(on) => setForcedOffline(on)}
              disabled={!till.available && !connectivity.forced}
            />
            <Label htmlFor="force-offline" className="text-sm">
              Pakai mode offline sekarang
            </Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void checkNow()}
              disabled={checking || state.syncing}
            >
              {checking || state.syncing ? <Spinner /> : <RefreshCw className="size-4" />}
              Cek koneksi &amp; kirim
            </Button>
          </div>
        </div>

        {fetchedAt && (
          <p className="text-sm text-muted">
            Data offline terakhir diperbarui {fetchedAt}.
          </p>
        )}

        {records === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Spinner /> Memuat…
          </div>
        ) : records.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Belum ada transaksi offline di perangkat ini.
          </p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
            {records.map((record) => {
              const status = STATUS[record.status] ?? STATUS.pending;
              const reasons = [...record.reasons, ...record.flags];
              return (
                <li key={record.clientTxnId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold tabular-nums">{record.sale.transactionNumber}</p>
                    <p className="text-sm text-muted tabular-nums">
                      {timeOf(record.sale.paidAt)} · {formatMoney(record.sale.totals.grandTotal)}
                      {record.priced.customer ? ` · ${record.priced.customer.name}` : ""}
                    </p>
                    {(record.message || reasons.length > 0) && (
                      <p className="text-sm text-muted">
                        {record.message ?? reasons.map((reason) => reason.message).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tint}`}>
                      {status.label}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onReceipt(record.clientTxnId)}
                    >
                      <Printer className="size-4" />
                      Struk
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
