"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { PurchaseInvoice, Supplier } from "@/types/purchasing";
import { daysUntil } from "@/utils/date";
import { formatMoney } from "@/utils/decimal";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";

import {
  dueWithinInvoices,
  outstandingTotal,
  overdueInvoices,
} from "../payables";

/** How far ahead the second list looks. A week is one payment run. */
const HORIZON_DAYS = 7;

/** Rows per list before the footer takes over — the same five Inventory shows. */
const PREVIEW_ROWS = 5;

const SECTIONS: Array<{
  href: string;
  title: string;
  description: string;
  /** Mirrors the sidebar's gate for the same screen — see features/dashboard/nav.ts. */
  feature: Feature;
  action: Action;
}> = [
  {
    href: "/dashboard/purchasing/suppliers",
    title: "Supplier",
    description:
      "Mitra beli putus dan konsinyasi, beserta termin pembayaran masing-masing.",
    feature: "suppliers",
    action: "read",
  },
  {
    href: "/dashboard/purchasing/receipts",
    title: "Penerimaan Barang",
    description:
      "Barang masuk: menaikkan stok, membuat lot, memperbarui harga rata-rata.",
    feature: "goodsReceipts",
    action: "read",
  },
  {
    href: "/dashboard/purchasing/payables",
    title: "Utang Supplier",
    description:
      "Faktur dari penerimaan beli putus, pembayaran, dan sisa yang belum lunas.",
    feature: "purchaseInvoices",
    action: "read",
  },
  {
    href: "/dashboard/purchasing/returns",
    title: "Retur ke Supplier",
    description:
      "Kembalikan barang rusak atau salah kirim — utang ikut berkurang.",
    feature: "purchaseReturns",
    action: "read",
  },
];

/**
 * The Purchasing landing screen: what has to be paid, and the way in to every
 * screen in the module.
 *
 * IT EXISTS FOR THE SECOND LIST. "Which invoices are already late" the payables
 * table answers well enough; "how much cash does this week need" it cannot,
 * because that is a date range nobody can filter to. A shop that only ever sees
 * the overdue list learns about a bill on the day it is already a problem, which
 * is the failure the module's payment terms exist to prevent.
 *
 * THE COUNTS ON THE SECTION CARDS ARE ROW COUNTS, never money. Purchasing still
 * runs on the in-memory demo store, so a rupiah total labelled "bulan ini" would
 * read as a report of the tenant's actual spend while being a property of the
 * fixtures. A count of documents makes the same "is there anything here" point
 * without claiming to be an account.
 *
 * EACH CARD IS GATED ON ITS OWN GRANT and the two lists on `purchaseInvoices`,
 * matching the sidebar exactly — a user whose menu has no Utang Supplier link
 * must not land on a page that opens with their supplier debt.
 */
export function PurchasingHub() {
  const { can } = usePermissions();
  const { invoices, suppliers, receipts, purchaseReturns } = useInventoryDemo();

  const mayReadInvoices = can("purchaseInvoices", "read");

  const sections = SECTIONS.filter((section) =>
    can(section.feature, section.action),
  );

  const overdue = overdueInvoices(invoices);
  const dueSoon = dueWithinInvoices(invoices, HORIZON_DAYS);

  const counts: Record<string, string> = {
    "/dashboard/purchasing/suppliers": `${suppliers.filter((supplier) => supplier.isActive).length} aktif`,
    "/dashboard/purchasing/receipts": `${receipts.length} penerimaan`,
    "/dashboard/purchasing/payables": `${invoices.filter((invoice) => invoice.status !== "paid").length} belum lunas`,
    "/dashboard/purchasing/returns": `${purchaseReturns.length} retur`,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Purchasing</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Termin tiap supplier yang menentukan kapan sebuah faktur jatuh tempo.
          Dua daftar di bawah adalah faktur yang tanggalnya sudah lewat, dan
          yang lewat minggu ini.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
          >
            <p className="font-semibold text-foreground group-hover:text-primary-hover">
              {section.title}
            </p>
            <p className="mt-1.5 text-sm text-muted">{section.description}</p>
            <p className="mt-3 font-mono text-xs tabular-nums text-muted">
              {counts[section.href]}
            </p>
          </Link>
        ))}
      </div>

      {mayReadInvoices && (
        <div className="grid gap-6 lg:grid-cols-2">
          <PayablePanel
            title="Lewat jatuh tempo"
            invoices={overdue}
            suppliers={suppliers}
            totalLabel="Total tertunggak"
            urgent
            empty="Tidak ada faktur yang lewat jatuh tempo."
            moreLabel="faktur lain juga sudah lewat tempo"
          />

          <PayablePanel
            title="Jatuh tempo minggu ini"
            caption={`${HORIZON_DAYS} hari ke depan`}
            invoices={dueSoon}
            suppliers={suppliers}
            totalLabel="Kas yang perlu disiapkan"
            empty={`Tidak ada faktur yang jatuh tempo dalam ${HORIZON_DAYS} hari.`}
            moreLabel="faktur lain juga jatuh tempo minggu ini"
          />
        </div>
      )}
    </div>
  );
}

/**
 * One list of invoices that need money, and every state it can be in.
 *
 * THE BADGE AND THE TOTAL COVER THE WHOLE LIST, not the five rows shown. A panel
 * that said "3" beside three rows out of eleven would tell somebody the job was
 * nearly done — the same reason the Inventory alerts report the server's count
 * rather than `children.length`.
 */
function PayablePanel({
  title,
  caption,
  invoices,
  suppliers,
  totalLabel,
  urgent = false,
  empty,
  moreLabel,
}: {
  title: string;
  caption?: string;
  invoices: PurchaseInvoice[];
  suppliers: Supplier[];
  totalLabel: string;
  /** Colours the count and the amounts — reserved for money already late. */
  urgent?: boolean;
  empty: string;
  /** Copy for the "+N more" line under a truncated list. */
  moreLabel: string;
}) {
  const shown = invoices.slice(0, PREVIEW_ROWS);
  const remaining = invoices.length - shown.length;
  const total = outstandingTotal(invoices);

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface">
      <header className="flex items-baseline gap-2 border-b border-border px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        {caption && <span className="text-xs text-muted">{caption}</span>}
        <Badge
          variant="outline"
          className={cn(
            "ml-auto tabular-nums",
            urgent && invoices.length > 0 && "border-danger text-danger",
          )}
        >
          {invoices.length}
        </Badge>
      </header>

      {invoices.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3 border-b border-border bg-accent px-5 py-2.5">
            <span className="text-xs text-muted">{totalLabel}</span>
            <span
              className={cn(
                "ml-auto font-mono text-[15px] font-semibold tabular-nums",
                urgent && "text-danger",
              )}
            >
              {formatMoney(total)}
            </span>
          </div>

          <ul className="divide-y divide-border/60">
            {shown.map((invoice) => (
              <li
                key={invoice._id}
                className="flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/purchasing/payables/${invoice._id}`}
                    className="block truncate text-sm font-medium hover:text-primary-hover"
                  >
                    {supplierNameOf(suppliers, invoice.supplierId)}
                  </Link>
                  <p className="truncate font-mono text-xs text-muted">
                    {invoice.invoiceNumber}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    urgent && "text-danger",
                  )}
                >
                  {formatMoney(demo.outstandingOf(invoice))}
                </span>
                <DueChip dueDate={invoice.dueDate} />
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3 border-t border-border px-5 py-2.5 text-xs text-muted">
            {remaining > 0 && (
              <span>
                +{remaining} {moreLabel}
              </span>
            )}
            <Link
              href="/dashboard/purchasing/payables"
              className="ml-auto font-medium text-primary hover:text-primary-hover"
            >
              Lihat semua utang →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * How long until this one is due, or how long it has been late.
 *
 * "besok" and "hari ini" are spelled out rather than rendered as "1 hari" and
 * "0 hari": those are the two rows somebody acts on before closing the tab, and
 * a countdown is slower to read than the word.
 */
function DueChip({ dueDate }: { dueDate: string }) {
  const remaining = daysUntil(dueDate);

  if (remaining < 0) {
    return (
      <span className="whitespace-nowrap rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] text-danger">
        telat {Math.abs(remaining)} hari
      </span>
    );
  }

  const label =
    remaining === 0
      ? "hari ini"
      : remaining === 1
        ? "besok"
        : `${remaining} hari`;

  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]",
        remaining <= 1
          ? "border-secondary/45 bg-secondary/20 text-secondary-foreground"
          : "border-border text-muted",
      )}
    >
      {label}
    </span>
  );
}

/**
 * A supplier that has been deleted still has invoices, and those invoices are
 * still owed — so the row renders with a placeholder rather than being dropped.
 */
function supplierNameOf(suppliers: Supplier[], supplierId: string): string {
  return suppliers.find((supplier) => supplier._id === supplierId)?.name ?? "—";
}
