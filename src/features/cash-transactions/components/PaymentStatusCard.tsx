"use client";

import type { ReactNode } from "react";

import { Card } from "@/components";
import { formatMoney, toMinor } from "@/utils/decimal";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * "STATUS PEMBAYARAN" — the three figures of a bill on a dark panel, a paid bar,
 * and the action under them. ONE CARD FOR BOTH SIDES (15 October 2026, on
 * request): a sales invoice and a supplier invoice read the same, the way their
 * payment dialog already does (see RecordPaymentDialog).
 *
 * The dark panel is the one block on the page read from across a desk; the
 * contrast is what makes the balance findable without hunting.
 *
 * THE PERCENTAGE counts what was paid against the total, clamped at 100 and
 * guarded against a zero total — which would otherwise render `NaN%` and paint
 * the bar full.
 *
 * `children` is the action area (the "Catat pembayaran" button, a permission
 * note); `extra` sits under the bar for what one side alone needs to say.
 */
export function PaymentStatusCard({
  total,
  paid,
  outstanding,
  dueDate,
  settled,
  voided = false,
  voidedNote,
  extra,
  children,
}: {
  total: string;
  paid: string;
  outstanding: string;
  dueDate: string | null;
  settled: boolean;
  voided?: boolean;
  /** Said in place of the bar when the bill was voided. */
  voidedNote?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const paidMinor = toMinor(paid) ?? 0n;
  const totalMinor = toMinor(total) ?? 0n;
  const paidPercent =
    totalMinor === 0n
      ? 0
      : Math.min(100, Math.round(Number((paidMinor * 100n) / totalMinor)));

  return (
    <Card title="Status pembayaran">
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-primary px-4 py-3.5 text-primary-foreground">
          <div className="flex justify-between gap-3 text-sm opacity-80">
            <span>Total tagihan</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-3 text-sm opacity-80">
            <span>Terbayar</span>
            <span className="tabular-nums">{formatMoney(paid)}</span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-3 text-lg font-bold">
            <span>{voided ? "Dibatalkan" : "Sisa"}</span>
            <span className="tabular-nums">
              {voided ? "—" : formatMoney(outstanding)}
            </span>
          </div>
        </div>

        {!voided && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
              <div
                className="h-full rounded-full bg-success-fill"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted tabular-nums">
              {paidPercent}% terbayar
              {dueDate && <> · jatuh tempo {formatDate(dueDate)}</>}
            </p>
          </>
        )}

        {voided && voidedNote}

        {extra}

        {!voided && settled && (
          <p className="rounded-lg bg-tint-success px-3 py-2 text-sm font-medium text-success">
            Faktur ini sudah lunas.
          </p>
        )}

        {children}
      </div>
    </Card>
  );
}
