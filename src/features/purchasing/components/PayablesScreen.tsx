"use client";

import { useState } from "react";
import Link from "next/link";

import { Breadcrumb } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney, toMinor } from "@/utils/decimal";
import type { InvoiceStatus } from "@/types/purchasing";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";

import { PURCHASING_CRUMBS } from "../crumbs";
import { isOverdue, outstandingTotal } from "../payables";

type Filter = InvoiceStatus | "all" | "overdue";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "unpaid", label: "Belum dibayar" },
  { value: "partial", label: "Sebagian" },
  { value: "paid", label: "Lunas" },
  { value: "overdue", label: "Jatuh tempo" },
];

const STATUS_TONE: Record<InvoiceStatus, string> = {
  unpaid: "bg-danger/10 text-danger",
  partial: "bg-secondary/25 text-secondary-foreground",
  paid: "bg-success/12 text-success",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  unpaid: "belum dibayar",
  partial: "sebagian",
  paid: "lunas",
};

/**
 * What the tenant owes its suppliers, and which of it is late.
 *
 * OVERDUE IS ITS OWN FILTER RATHER THAN A SORT, because it is a different
 * question. "Which invoices are unpaid" is planning; "which are already late" is
 * triage, and the answer changes who gets called this morning. The banner above
 * the table exists so the second question does not have to be asked at all on a
 * day when nothing is late.
 *
 * Every figure is derived — outstanding is total minus paid, and the totals are
 * summed through the decimal helper. Nothing here is stored, so the payables
 * screen cannot drift away from the invoices it reads.
 */
export function PayablesScreen() {
  const { invoices, suppliers } = useInventoryDemo();
  const [filter, setFilter] = useState<Filter>("all");

  // `isOverdue` is shared with the purchasing hub so the banner here and the
  // count there cannot drift apart — see features/purchasing/payables.ts.
  const overdue = invoices.filter(isOverdue);

  const rows = invoices.filter((invoice) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(invoice);
    return invoice.status === filter;
  });

  const totalOutstanding = outstandingTotal(invoices);
  const overdueTotal = outstandingTotal(overdue);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[PURCHASING_CRUMBS.hub, { label: "Utang Supplier" }]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Utang Supplier
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Faktur pembelian terbentuk otomatis dari penerimaan beli putus.
          Pembayaran boleh dicicil beberapa kali sampai lunas.
        </p>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">
            {overdue.length} faktur sudah lewat jatuh tempo
          </b>{" "}
          — total {formatMoney(overdueTotal)}. Prioritaskan pembayaran supaya
          pasokan tidak terganggu.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-accent p-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                filter === option.value
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[10px] font-medium uppercase tracking-widest text-muted">
          Total sisa utang{" "}
          <b className="ml-1 font-mono text-sm normal-case tracking-normal text-foreground">
            {formatMoney(totalOutstanding)}
          </b>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Faktur</th>
              <th className="px-4 py-2.5 text-left font-medium">Supplier</th>
              <th className="px-4 py-2.5 text-left font-medium">Jatuh tempo</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Dibayar</th>
              <th className="px-4 py-2.5 text-right font-medium">Sisa</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Tidak ada faktur di filter ini
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {invoices.length === 0
                      ? "Faktur muncul setelah ada penerimaan beli putus."
                      : "Coba pilih filter lain."}
                  </p>
                </td>
              </tr>
            )}

            {rows.map((invoice) => {
              const late = isOverdue(invoice);
              const outstanding = demo.outstandingOf(invoice);

              return (
                <tr
                  key={invoice._id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    late && "bg-danger/5",
                  )}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium">
                    {suppliers.find((s) => s._id === invoice.supplierId)
                      ?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={cn(late && "font-semibold text-danger")}>
                      {new Date(invoice.dueDate).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {late && (
                      <span className="ml-1 text-danger">
                        · telat {Math.abs(daysUntil(invoice.dueDate))} hari
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {formatMoney(invoice.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
                    {formatMoney(invoice.paidAmount)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums",
                      (toMinor(outstanding) ?? 0n) > 0n && "text-danger",
                    )}
                  >
                    {formatMoney(outstanding)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        STATUS_TONE[invoice.status],
                      )}
                    >
                      {STATUS_LABEL[invoice.status]}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/dashboard/purchasing/payables/${invoice._id}`}
                      >
                        {invoice.status === "paid" ? "Lihat" : "Bayar"}
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
