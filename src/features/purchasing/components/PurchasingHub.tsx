"use client";

import Link from "next/link";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney } from "@/utils/decimal";
import type { PurchaseInvoiceListRow } from "@/types/api";

import {
  usePayablesSummary,
  type PayablesWorklist,
} from "../hooks/usePayablesSummary";
import { PayablesScopeCard } from "./PayablesScopeCard";
import { PayablesStatCards, type PayablesStatFigures } from "./PayablesStatCards";
import { PurchasingModuleHeader } from "./PurchasingModuleHeader";

/**
 * The Pembelian › Ringkasan tab — what is owed, and what has to be paid next.
 *
 * THE MOCKUP'S OWN SHAPE (`buloo-navigation-v3`, pembelian › Ringkasan): a
 * card row, then the two worklists, then the note about consignment. Every
 * part of it is a decision worth recording:
 *
 *   THE CARD ROW IS `PayablesStatCards` NOW (2 October 2026, on request) — the
 *   same four-card strip the Faktur tab carries, promoted here when this screen
 *   was asked for it instead of keeping its own three. ONE FIGURE WAS DROPPED
 *   IN THE SWAP: "Hutang terbayar periode ini", the only FLOW among the old
 *   three (money that actually left inside the period) and the one figure with
 *   no equivalent among the new four. It is still fetched — `summary.paid`,
 *   below — just no longer drawn anywhere on this tab. Nobody has asked for it
 *   back yet; if it returns, say so here. ONE CONSEQUENCE FOLLOWS: the period
 *   half of `PayablesScopeCard` narrowed only that figure, so it currently
 *   narrows nothing visible on this tab — only the cabang half still does,
 *   scoping both cards and both worklists.
 *
 *   THE SECTION-CARD GRID IS GONE. This screen used to open with five links —
 *   Supplier, Kategori Supplier, Penerimaan, Faktur, Retur — above the
 *   worklists. The module's own tab row reaches all five, one click, always
 *   visible; the cards were a second navigation of the same five screens, and
 *   the mockup draws none. What they carried that the tabs do not — a row count
 *   each — was never what somebody opens this tab to find out.
 *
 *   THE WORKLIST OF CONSIGNMENT DEBT IS NOT BUILT, and the closing note says so
 *   rather than leaving a gap. Consignment exists here as a supplier TYPE and
 *   nothing more: no goods are billed on sale, so a panel claiming to list that
 *   debt would list nothing and mean nothing.
 *
 * NOTHING ON THIS PAGE IS ADDED UP IN THE BROWSER. Every count and every rupiah
 * figure is the server's aggregation over the whole book; the five rows under
 * each heading are a preview of a total computed elsewhere. See
 * `usePayablesSummary`.
 *
 * GATED ON `purchaseInvoices:read` — what a shop owes, and to whom, is the
 * commercially sensitive half of this module. A role without it sees the tab row
 * and a line saying where to look instead, and issues no requests at all.
 */
export function PurchasingHub() {
  const { can } = usePermissions();
  const mayReadInvoices = can("purchaseInvoices", "read");

  const { query, setQuery, summary, summaryFailed, overdue, dueSoon, loading } =
    usePayablesSummary(mayReadInvoices);
  const { branches } = useBranchOptions(mayReadInvoices);

  if (!mayReadInvoices) {
    return (
      <div className="flex flex-col gap-6">
        <PurchasingModuleHeader />
        <p className="max-w-2xl text-sm text-muted">
          Ringkasan utang supplier hanya untuk peran yang boleh membaca faktur
          pembelian. Tab lain di atas tetap bisa dibuka sesuai izinmu.
        </p>
      </div>
    );
  }

  const figures: PayablesStatFigures | null = summary
    ? {
        outstanding: {
          amount: summary.outstanding.amount,
          invoiceCount: summary.outstanding.invoiceCount,
        },
        dueSoon: {
          amount: summary.dueSoon.amount,
          invoiceCount: summary.dueSoon.invoiceCount,
          horizonDays: summary.dueSoon.horizonDays,
        },
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      <PurchasingModuleHeader />

      {/* What every figure below is ABOUT — and the two controls that set it.
          No Filter button: see PayablesScopeCard for why the panel went. */}
      <PayablesScopeCard
        query={query}
        branches={branches}
        onChange={setQuery}
      />

      {/* No onDueSoonClick: this tab has no invoice table of its own to drill
          into, unlike Faktur's — see PayablesStatCards' own doc. */}
      <PayablesStatCards
        figures={figures}
        loading={loading && !summary}
        failed={summaryFailed}
      />

      <Worklist
        title="Hutang lewat jatuh tempo"
        data={overdue}
        tone="danger"
        totalLabel="Total tertunggak"
        empty="Tidak ada hutang yang lewat jatuh tempo."
        moreLabel="faktur lain juga sudah lewat tempo"
      />

      {/* The window is the server's and arrives with the figures, so the caption
          states the days the numbers beside it were computed with rather than
          naming one this screen keeps a constant for. */}
      <Worklist
        title="Hutang jatuh tempo minggu ini"
        caption={
          summary ? `${summary.dueSoon.horizonDays} hari ke depan` : undefined
        }
        data={dueSoon}
        tone="warning"
        totalLabel="Kas yang perlu disiapkan"
        empty={
          summary
            ? `Tidak ada hutang yang jatuh tempo dalam ${summary.dueSoon.horizonDays} hari.`
            : "Tidak ada hutang yang jatuh tempo dalam waktu dekat."
        }
        moreLabel="faktur lain juga jatuh tempo minggu ini"
      />

      <Card>
        <p className="text-base font-bold text-foreground">
          Belum termasuk konsinyasi
        </p>
        <p className="mt-1 text-sm text-muted">
          Utang konsinyasi per supplier belum ada di sini. Konsinyasi baru
          berupa <b>tipe supplier</b> di master — barang yang terjual belum
          otomatis menerbitkan tagihan ke pemiliknya, jadi daftarnya akan kosong
          dan menyesatkan. Menyusul begitu fiturnya sendiri ada. Tipe tiap
          supplier bisa dilihat di{" "}
          <Link
            href="/dashboard/purchasing/suppliers"
            className="text-primary underline-offset-2 hover:underline"
          >
            tab Supplier
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

/**
 * One list of bills that need money — the mockup's `.na` panel.
 *
 * THE BADGE AND THE TOTAL COVER THE WHOLE BUCKET, not the five rows shown. A
 * panel reading "3" beside three rows out of eleven would tell somebody the job
 * was nearly done. Both figures come from the server's own aggregation; nothing
 * here adds anything up.
 *
 * A NULL TOTAL RENDERS AS AN ABSENCE, never as zero — "Rp 0" over eleven unpaid
 * bills is a number somebody would act on.
 *
 * THE TONE IS A FILL WITH ORDINARY INK (ui-rules §4), and the count says in a
 * number what the colour says at a glance, so nothing here depends on seeing the
 * colour at all.
 */
function Worklist({
  title,
  caption,
  data,
  tone,
  totalLabel,
  empty,
  moreLabel,
}: {
  title: string;
  caption?: string;
  data: PayablesWorklist;
  /** "danger" is money already late; "warning" is money that still has time. */
  tone: "danger" | "warning";
  totalLabel: string;
  empty: string;
  /** Copy for the "+N more" line under a truncated list. */
  moreLabel: string;
}) {
  const { rows, count, total } = data;
  const remaining = count - rows.length;

  return (
    <section
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "danger"
          ? "border-danger/40 bg-danger/5"
          : "border-secondary/40 bg-secondary/10",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {caption && <span className="text-xs text-muted">{caption}</span>}
        <Badge
          variant="outline"
          className={cn(
            "ml-auto bg-surface tabular-nums",
            tone === "danger" && count > 0 && "border-danger text-danger-ink",
          )}
        >
          {count}
        </Badge>
      </div>

      {count === 0 ? (
        <p className="py-3 text-sm text-muted">{empty}</p>
      ) : (
        <>
          {total !== null && (
            <p className="mt-1 flex items-baseline gap-2 text-xs text-muted">
              {totalLabel}
              <span
                className={cn(
                  "text-sm font-bold tabular-nums text-foreground",
                  tone === "danger" && "text-danger-ink",
                )}
              >
                {formatMoney(total)}
              </span>
            </p>
          )}

          <ul className="mt-2">
            {rows.map((invoice) => (
              <WorkRow key={invoice._id} invoice={invoice} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-2.5 text-xs text-muted">
            {remaining > 0 && (
              <span>
                +{remaining} {moreLabel}
              </span>
            )}
            <Link
              href="/dashboard/purchasing/payables"
              className="ml-auto font-bold text-primary underline-offset-2 hover:underline"
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
 * One bill: who it is owed to, when it was due, how much is left, and the one
 * action worth taking on it.
 *
 * "Bayar" OPENS THE INVOICE rather than a dialog. Recording a payment needs the
 * bill's own screen — which account it leaves, the method, what is still
 * outstanding as of now — and a summary tab is not where that decision is made.
 * The link is gated by the invoice screen itself, which holds the `pay` grant
 * that this tab's `read` does not imply.
 */
function WorkRow({ invoice }: { invoice: PurchaseInvoiceListRow }) {
  const remaining = daysUntil(invoice.dueDate);
  const due = new Date(invoice.dueDate).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const when =
    remaining < 0
      ? `telat ${Math.abs(remaining)} hari`
      : remaining === 0
        ? "jatuh tempo hari ini"
        : remaining === 1
          ? "besok"
          : `${remaining} hari lagi`;

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-border/70 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">
          <span className="tabular-nums">{invoice.invoiceNumber}</span>
          {" · "}
          {/* A supplier deleted since still has invoices, and those invoices are
              still owed — so the row renders with a placeholder rather than
              being dropped. */}
          {invoice.supplierName ?? "—"}
        </p>
        <p className="truncate text-xs text-muted tabular-nums">
          Jatuh tempo {due} · {when} ·{" "}
          {formatMoney(invoice.outstandingAmount)}
        </p>
      </div>
      <Link
        href={`/dashboard/purchasing/payables/${invoice._id}`}
        className="flex-none text-xs font-bold text-warning underline-offset-2 hover:underline"
      >
        Bayar
      </Link>
    </li>
  );
}
