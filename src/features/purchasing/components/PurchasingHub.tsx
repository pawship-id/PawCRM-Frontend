"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney } from "@/utils/decimal";

import { useHubCounts } from "../hooks/useHubCounts";
import {
  usePayablesPanels,
  type PayablePanelData,
} from "../hooks/usePayablesPanels";

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
 * NEITHER LIST IS ASSEMBLED HERE. Both are a server-side filter (`?overdue=` and
 * `?dueSoon=`) beside a server-side aggregation, so this screen renders what it
 * was handed — no row is dropped in the browser and no rupiah figure is added up
 * in one. See usePayablesPanels for what that replaced.
 *
 * THE COUNTS ON THE SECTION CARDS ARE ROW COUNTS, never money. A count of
 * documents makes the "is there anything here" point without claiming to be an
 * account.
 *
 * EVERY FIGURE ON THIS SCREEN COMES FROM THE API — the section counts from
 * useHubCounts, the two panels and the payables count from the outstanding
 * summary. That is why every count can be null: each one is waiting on a request,
 * and null renders as "—" rather than as zero.
 *
 * THE COUNTS COME FROM THE PAGINATION, NOT FROM THE ROWS. Asking for one row and
 * reading `pagination.total` costs one small request and is right; asking for a
 * page and calling `.length` on it would silently cap at the page size and report
 * "20 retur" forever.
 *
 * EACH CARD IS GATED ON ITS OWN GRANT and the two lists on `purchaseInvoices`,
 * matching the sidebar exactly — a user whose menu has no Utang Supplier link
 * must not land on a page that opens with their supplier debt. Both hooks are
 * handed those same answers so a denied role issues no requests at all.
 */
export function PurchasingHub() {
  const { can } = usePermissions();

  const mayReadInvoices = can("purchaseInvoices", "read");
  const { overdue, dueSoon, outstandingCount, horizonDays } =
    usePayablesPanels(mayReadInvoices);

  const { activeSuppliers, receipts, returns } = useHubCounts({
    suppliers: can("suppliers", "read"),
    receipts: can("goodsReceipts", "read"),
    returns: can("purchaseReturns", "read"),
  });

  const sections = SECTIONS.filter((section) =>
    can(section.feature, section.action),
  );

  const counts: Record<string, string> = {
    "/dashboard/purchasing/suppliers":
      activeSuppliers === null ? "—" : `${activeSuppliers} aktif`,
    "/dashboard/purchasing/receipts":
      receipts === null ? "—" : `${receipts} penerimaan`,
    "/dashboard/purchasing/payables":
      outstandingCount === null
        ? "—"
        : `${outstandingCount} belum lunas`,
    "/dashboard/purchasing/returns":
      returns === null ? "—" : `${returns} retur`,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Purchasing</h1>
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
            <p className="mt-3 tabular-nums text-xs text-muted">
              {counts[section.href]}
            </p>
          </Link>
        ))}
      </div>

      {mayReadInvoices && (
        <div className="grid gap-6 lg:grid-cols-2">
          <PayablePanel
            title="Lewat jatuh tempo"
            data={overdue}
            totalLabel="Total tertunggak"
            urgent
            empty="Tidak ada faktur yang lewat jatuh tempo."
            moreLabel="faktur lain juga sudah lewat tempo"
          />

          {/* The window is the server's and arrives with the figures, so the
              caption states the days the numbers beside it were computed with.
              Until it does, the panel says nothing about a window rather than
              naming one it is guessing at. */}
          <PayablePanel
            title="Jatuh tempo minggu ini"
            caption={
              horizonDays === null ? undefined : `${horizonDays} hari ke depan`
            }
            data={dueSoon}
            totalLabel="Kas yang perlu disiapkan"
            empty={
              horizonDays === null
                ? "Tidak ada faktur yang jatuh tempo dalam waktu dekat."
                : `Tidak ada faktur yang jatuh tempo dalam ${horizonDays} hari.`
            }
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
 * THE BADGE AND THE TOTAL COVER THE WHOLE BUCKET, not the five rows shown. A
 * panel that said "3" beside three rows out of eleven would tell somebody the job
 * was nearly done — the same reason the Inventory alerts report the server's
 * count rather than `children.length`. Both figures come from the hook, which
 * gets them from the server's own aggregation; nothing here adds anything up.
 *
 * A NULL TOTAL RENDERS AS AN ABSENCE, never as zero. It now means only that the
 * summary request failed — both totals are exact when it arrives — and "Rp 0"
 * over eleven unpaid bills is a number somebody would act on.
 */
function PayablePanel({
  title,
  caption,
  data,
  totalLabel,
  urgent = false,
  empty,
  moreLabel,
}: {
  title: string;
  caption?: string;
  data: PayablePanelData;
  totalLabel: string;
  /** Colours the count and the amounts — reserved for money already late. */
  urgent?: boolean;
  empty: string;
  /** Copy for the "+N more" line under a truncated list. */
  moreLabel: string;
}) {
  const { rows, count, total } = data;
  const remaining = count - rows.length;

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface">
      <header className="flex items-baseline gap-2 border-b border-border px-5 py-3">
        <h2 className="font-bold">{title}</h2>
        {caption && <span className="text-xs text-muted">{caption}</span>}
        <Badge
          variant="outline"
          className={cn(
            "ml-auto tabular-nums",
            urgent && count > 0 && "border-danger text-danger",
          )}
        >
          {count}
        </Badge>
      </header>

      {count === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          {total !== null && (
            <div className="flex items-baseline gap-3 border-b border-border bg-accent px-5 py-2.5">
              <span className="text-xs text-muted">{totalLabel}</span>
              <span
                className={cn(
                  "ml-auto tabular-nums text-[15px] font-semibold",
                  urgent && "text-danger",
                )}
              >
                {formatMoney(total)}
              </span>
            </div>
          )}

          <ul className="divide-y divide-border/60">
            {rows.map((invoice) => (
              <li
                key={invoice._id}
                className="flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/purchasing/payables/${invoice._id}`}
                    className="block truncate text-sm font-medium hover:text-primary-hover"
                  >
                    {/* A supplier deleted since still has invoices, and those
                        invoices are still owed — so the row renders with a
                        placeholder rather than being dropped. */}
                    {invoice.supplierName ?? "—"}
                  </Link>
                  <p className="truncate tabular-nums text-xs text-muted">
                    {invoice.invoiceNumber}
                  </p>
                </div>
                <span
                  className={cn(
                    "tabular-nums text-sm font-semibold",
                    urgent && "text-danger",
                  )}
                >
                  {formatMoney(invoice.outstandingAmount)}
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
