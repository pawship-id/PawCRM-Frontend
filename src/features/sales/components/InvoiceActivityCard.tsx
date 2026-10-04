"use client";

import { ChevronRight } from "lucide-react";

import { Spinner } from "@/components";
import { formatMoney } from "@/utils/decimal";
import type {
  CustomerInvoiceDetail,
  CustomerInvoicePayment,
  InvoiceActivityEntry,
} from "@/types/api";

import { useInvoiceActivity } from "../hooks/useInvoiceActivity";
import { paymentChannelLabel } from "../paymentLabels";

const ACTION_LABEL: Record<string, string> = {
  invoice_create: "Faktur dibuat",
  invoice_update: "Faktur diubah",
  invoice_payment_record: "Pembayaran dicatat",
  invoice_payment_void: "Pembayaran dibatalkan",
  invoice_void: "Faktur dibatalkan",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/**
 * The one line under an entry's title — what it changed, in figures.
 *
 * READ FROM WHAT THE TRAIL RECORDED at the time, never from the invoice as it is
 * now: "total Rp 300.000" on the row for a creation that has since been edited
 * down is the whole point of keeping a log.
 *
 * THE CHANNEL IS NAMED FROM THE PAYMENT, which the invoice already carries. The
 * trail stores its id; a log reading "channel 66f1c0…" names nothing.
 */
function describe(
  entry: InvoiceActivityEntry,
  payments: CustomerInvoicePayment[],
): string | null {
  const meta = entry.metadata ?? {};

  switch (entry.action) {
    case "invoice_create": {
      if (entry.fromDocument) {
        return meta.source === "pos_bridge"
          ? "Diterbitkan otomatis dari penjualan kasir"
          : "Diterbitkan";
      }
      const parts = [
        typeof meta.lineCount === "number" ? `${meta.lineCount} baris` : null,
        text(meta.total) ? `total ${formatMoney(text(meta.total))}` : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : null;
    }
    case "invoice_update": {
      const parts = [
        text(meta.previousTotal) && text(meta.total)
          ? `Total ${formatMoney(text(meta.previousTotal))} → ${formatMoney(text(meta.total))}`
          : null,
        typeof meta.lineCount === "number" ? `${meta.lineCount} baris` : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : null;
    }
    case "invoice_payment_record": {
      const payment = payments.find((row) => row.paymentId === meta.paymentId);
      return [
        text(meta.paymentNumber),
        text(meta.amount) ? formatMoney(text(meta.amount)) : null,
        payment ? paymentChannelLabel(payment) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "invoice_payment_void": {
      const headline = [
        text(meta.paymentNumber),
        text(meta.amount) ? formatMoney(text(meta.amount)) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const reason = text(meta.reason) ? `alasan: ${text(meta.reason)}` : null;
      return [headline || null, reason].filter(Boolean).join(" — ");
    }
    case "invoice_void":
      return text(meta.reason) ? `Alasan: ${text(meta.reason)}` : null;
    default:
      return null;
  }
}

/**
 * RIWAYAT AKTIVITAS — who did what to this invoice, and when.
 *
 * FOLDED BY DEFAULT, the mockup's `<details>`: the log answers "who changed
 * this" on the visit that asks it, and a list drawn open on every invoice would
 * put a stack of rows between the reader and the foot of the page.
 *
 * THE COUNT SITS ON THE FOLD, the mockup's badge. That is why the log is read
 * with the page rather than when it is opened: a number on a closed panel is
 * what tells somebody whether there is anything behind it — "1" on a fresh bill,
 * "6" on one that has been edited and paid twice — and it can only be shown once
 * the entries are known. One capped request per visit is the price.
 *
 * NO BADGE WHILE LOADING OR AFTER A FAILURE, rather than a "0": nought is a
 * claim that nothing happened, and neither state knows that. The failure is said
 * inside the panel.
 *
 * ONE ROW PER ACT, never per keystroke. An edit arrives as a single "Faktur
 * diubah" with the totals either side of it, because that is how the server
 * records it — the save is the act.
 *
 * A NATIVE `<details>`, so the fold is keyboard- and screen-reader-operable
 * without a line of script, and the card around it matches `<Card>`'s surface.
 */
export function InvoiceActivityCard({
  invoice,
  version,
}: {
  invoice: CustomerInvoiceDetail;
  /** Bumped by the screen after every write, so the log and its count refetch. */
  version: number;
}) {
  const { items, loading, error } = useInvoiceActivity(invoice._id, {
    enabled: true,
    version,
  });

  const counted = !loading && !error;

  return (
    <details className="group rounded-xl border border-border bg-surface shadow-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-6 py-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <h3 className="text-base font-bold">Riwayat aktivitas</h3>
          {counted && (
            <span className="rounded-full bg-tint-neutral px-2.5 py-0.5 text-xs font-semibold text-primary">
              <span className="tabular-nums">{items.length}</span>
              <span className="sr-only"> aktivitas</span>
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 text-muted transition group-open:rotate-90"
        />
      </summary>

      <div className="border-t border-border px-6 py-3">
        {loading && items.length === 0 ? (
          <p className="flex items-center gap-2 py-3 text-sm text-muted">
            <Spinner /> Memuat riwayat…
          </p>
        ) : error ? (
          <p className="py-3 text-sm text-danger-ink">{error}</p>
        ) : items.length === 0 ? (
          <p className="py-3 text-sm text-muted">
            Belum ada aktivitas yang tercatat.
          </p>
        ) : (
          <ol className="flex flex-col">
            {items.map((entry) => {
              const detail = describe(entry, invoice.payments ?? []);

              return (
                <li
                  key={entry._id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-border py-2.5 last:border-b-0"
                >
                  <span className="w-36 shrink-0 text-xs text-muted tabular-nums">
                    {formatWhen(entry.at)}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </p>
                    {detail && <p className="text-muted">{detail}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    {entry.actorName ??
                      (entry.fromDocument ? "Kasir" : "Pengguna terhapus")}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </details>
  );
}
