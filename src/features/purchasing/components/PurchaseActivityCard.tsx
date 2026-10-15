"use client";

import { ChevronRight } from "lucide-react";

import { Spinner } from "@/components";
import { formatMoney, formatQty } from "@/utils/decimal";
import type { PurchaseActivityEntry } from "@/types/api";

import { usePurchaseActivity } from "../hooks/usePurchaseActivity";

/**
 * "Riwayat aktivitas" for a goods receipt or a supplier invoice — ONE timeline
 * for both documents, because they are one purchase: the invoice page shows the
 * deliveries that made it payable, the receipt page shows the bill and its
 * payments. The server merges them (GET …/:id/activity).
 *
 * Same shape as Penjualan's `InvoiceActivityCard` — a collapsible card, one row
 * per event: when, what, the detail, who.
 */
const ACTION_LABEL: Record<string, string> = {
  goods_receipt_create: "Penerimaan dibuat",
  goods_receipt_receive: "Barang diterima",
  goods_receipt_correct: "Qty diterima dikoreksi",
  goods_receipt_close: "Penerimaan ditutup",
  purchase_invoice_create: "Faktur dicatat",
  purchase_invoice_update: "Faktur diubah",
  purchase_invoice_delete: "Faktur dihapus",
  purchase_invoice_payment: "Pembayaran dicatat",
  purchase_invoice_payment_void: "Pembayaran dibatalkan",
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

interface LineChange {
  name?: string;
  from?: string;
  to?: string;
  cancelled?: string;
}

function lines(meta: Record<string, unknown>): LineChange[] {
  return Array.isArray(meta.lines) ? (meta.lines as LineChange[]) : [];
}

function describe(entry: PurchaseActivityEntry): string | null {
  const meta = entry.metadata ?? {};

  switch (entry.action) {
    case "goods_receipt_create": {
      const parts = [
        text(meta.receiptNumber),
        meta.origin === "invoice"
          ? `dari faktur ${text(meta.invoiceNumber) ?? ""}`.trim()
          : null,
        typeof meta.itemCount === "number" ? `${meta.itemCount} item` : null,
        meta.origin !== "invoice" && text(meta.invoiceNumber)
          ? `sekalian faktur ${text(meta.invoiceNumber)}`
          : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : null;
    }
    case "goods_receipt_receive":
    case "goods_receipt_correct": {
      const changes = lines(meta)
        .map(
          (line) =>
            `${line.name ?? "Item"}: ${formatQty(line.from ?? "0")} → ${formatQty(line.to ?? "0")}`,
        )
        .join("; ");
      const note = text(meta.notes) ? `catatan: ${text(meta.notes)}` : null;
      return [changes || null, note].filter(Boolean).join(" — ") || null;
    }
    case "goods_receipt_close": {
      const changes = lines(meta)
        .map(
          (line) =>
            `${line.name ?? "Item"} dibatalkan ${formatQty(line.cancelled ?? "0")}`,
        )
        .join("; ");
      const total = text(meta.invoiceTotal)
        ? `tagihan faktur jadi ${formatMoney(text(meta.invoiceTotal))}`
        : null;
      const note = text(meta.notes) ? `catatan: ${text(meta.notes)}` : null;
      return [changes || null, total, note].filter(Boolean).join(" — ") || null;
    }
    case "purchase_invoice_create": {
      const parts = [
        text(meta.invoiceNumber),
        meta.origin === "manual" ? "faktur manual" : null,
        typeof meta.itemCount === "number" && meta.itemCount > 0
          ? `${meta.itemCount} item`
          : null,
        text(meta.total) ? `total ${formatMoney(text(meta.total))}` : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : null;
    }
    case "purchase_invoice_update":
      return text(meta.previousTotal) && text(meta.total)
        ? `Total ${formatMoney(text(meta.previousTotal))} → ${formatMoney(text(meta.total))}`
        : null;
    case "purchase_invoice_payment":
    case "purchase_invoice_payment_void":
      return [
        text(meta.paymentNumber),
        text(meta.amount) ? formatMoney(text(meta.amount)) : null,
      ]
        .filter(Boolean)
        .join(" · ") || null;
    default:
      return null;
  }
}

export function PurchaseActivityCard({
  kind,
  id,
  version = 0,
}: {
  kind: "receipt" | "invoice";
  id: string;
  version?: number;
}) {
  const { items, loading, error } = usePurchaseActivity(kind, id, version);
  const counted = !loading && !error;

  return (
    <details
      open
      className="group rounded-xl border border-border bg-surface shadow-sm"
    >
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
              const detail = describe(entry);

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
                    {entry.actorName ?? "Pengguna terhapus"}
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
