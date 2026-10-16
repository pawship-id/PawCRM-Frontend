"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { PurchaseInvoiceReceiptRef } from "@/types/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Every goods receipt made against one supplier invoice, oldest first — one
 * per delivery, since a bill's goods may arrive over several days (16 October
 * 2026, BO). Each row opens the receipt's own page. Drawn exactly like
 * Riwayat aktivitas below it — a folding card, a count, a rule under the title.
 * No status per row: whether the goods are complete is the INVOICE's status
 * now, shown on the bill, not something each receipt answers on its own.
 */
export function InvoiceReceiptsCard({
  receipts,
}: {
  receipts: PurchaseInvoiceReceiptRef[];
}) {
  return (
    <details
      open
      className="group rounded-xl border border-border bg-surface shadow-sm"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-6 py-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <h3 className="text-base font-bold">Penerimaan barang</h3>
          <span className="rounded-full bg-tint-neutral px-2.5 py-0.5 text-xs font-semibold text-primary">
            <span className="tabular-nums">{receipts.length}</span>
            <span className="sr-only"> penerimaan</span>
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 text-muted transition group-open:rotate-90"
        />
      </summary>

      <div className="border-t border-border px-6 py-3">
        {receipts.length === 0 ? (
          <p className="py-3 text-sm text-muted">
            Belum ada penerimaan barang.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {receipts.map((receipt) => (
              <li
                key={receipt._id}
                className="border-b border-border last:border-b-0"
              >
                <Link
                  href={`/dashboard/purchasing/receipts/${receipt._id}`}
                  className="flex min-h-11 flex-wrap items-start gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="w-36 shrink-0 text-xs text-muted tabular-nums">
                    {receipt.receiptDate ? formatDate(receipt.receiptDate) : "—"}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold text-primary tabular-nums">
                      {receipt.receiptNumber}
                    </span>
                    {receipt.notes && (
                      <span className="block whitespace-pre-wrap text-muted">
                        {receipt.notes}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
