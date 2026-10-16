"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Pagination, Spinner } from "@/components";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type {
  PurchaseInvoiceDetail,
  PurchaseInvoiceListRow,
  SupplierOutstandingSummary,
} from "@/types/api";

import { usePurchaseInvoices } from "../hooks/usePurchaseInvoices";
import { PurchasingModuleHeader } from "./PurchasingModuleHeader";
import {
  PayablesStatCards,
  type PayablesStatFigures,
} from "./PayablesStatCards";
import { PayablesTable } from "./PayablesTable";
import { PayInvoiceDialog } from "./PayInvoiceDialog";
import { PayablesToolbar } from "./PayablesToolbar";

/**
 * What the tenant owes its suppliers, and which of it is late.
 *
 * THE FOUR-CARD STRIP IS `PayablesStatCards` (1 October 2026, promoted to a
 * shared component 2 October 2026 when Ringkasan was asked for the same row —
 * see that component's own doc for what each card is and isn't). This screen's
 * job is only to adapt `SupplierOutstandingSummary` — the whole book, unscoped
 * — into the shape that component takes.
 *
 * THE OVERDUE BANNER SURVIVES, because it answers a question the cards do not:
 * what is ALREADY late. "Jatuh tempo ≤N hari" is deliberately the NOT-YET-LATE
 * bucket, so dropping the banner would leave the one number this shop acts on
 * first with no home. It also still carries the one call to action on this
 * screen: the overdue bucket is a view of the list right below it.
 *
 * THE FIGURES ARE UNFILTERED ON PURPOSE. They answer "what do we owe, ever", a
 * different question from the one the toolbar beneath the cards is asking.
 * Quietly re-scoping them to the current filter would make the same number mean
 * two things depending on which chip is selected.
 *
 * BAYAR OPENS THE SAME DIALOG THE DETAIL PAGE USES (16 October 2026), as on
 * Faktur Penjualan. The row is read first so the dialog's ceiling is the bill's
 * `payableAmount` as of now, not as of the page load; a payment then refetches
 * the rows AND the figures — both move.
 */
export function PayablesScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const { invoices, pagination, query, loading, error, setQuery, refetch } =
    usePurchaseInvoices();

  const [paying, setPaying] = useState<PurchaseInvoiceDetail | null>(null);
  // A double click on Bayar must not open two reads racing to one dialog.
  const opening = useRef(false);
  // Bumped after a payment so the summary figures are read again.
  const [summaryNonce, setSummaryNonce] = useState(0);

  async function openPay(row: PurchaseInvoiceListRow) {
    if (opening.current) return;
    opening.current = true;

    try {
      setPaying(await purchaseInvoiceService.getById(row._id));
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? err.message
          : `${row.invoiceNumber} tidak bisa dibuka. Coba lagi.`,
        "error",
        6000,
      );
    } finally {
      opening.current = false;
    }
  }

  const [summary, setSummary] = useState<SupplierOutstandingSummary | null>(
    null,
  );
  const [summaryFailed, setSummaryFailed] = useState(false);

  useEffect(() => {
    let active = true;

    purchaseInvoiceService
      .outstandingSummary()
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch(() => {
        if (active) setSummaryFailed(true);
      });

    return () => {
      active = false;
    };
  }, [summaryNonce]);

  // The whole book, like the figures beside it. Its own request: a failure here
  // blanks one card, never the strip.
  const [pendingReceipts, setPendingReceipts] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    goodsReceiptService
      .pendingCount()
      .then((result) => {
        if (active) setPendingReceipts(result?.count ?? null);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const overdueCount = summary?.totalOverdueInvoices ?? 0;

  const figures: PayablesStatFigures | null = summary
    ? {
        outstanding: {
          amount: summary.totalOutstanding,
          invoiceCount: summary.totalInvoices,
        },
        dueSoon: {
          amount: summary.totalDueSoonOutstanding,
          invoiceCount: summary.totalDueSoonInvoices,
          horizonDays: summary.horizonDays,
        },
        pendingReceipts,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PurchasingModuleHeader />

      {/* The mockup's strip, over the search box below it. */}
      <PayablesStatCards
        onPendingReceiptsClick={() =>
          router.push("/dashboard/purchasing/receipts?status=open")
        }
        figures={figures}
        loading={!summary && !summaryFailed}
        failed={summaryFailed}
        // Withheld once the list already shows the bucket — a control that
        // leads nowhere new is noise.
        onDueSoonClick={
          query.view !== "dueSoon"
            ? () => setQuery({ view: "dueSoon" })
            : undefined
        }
      />

      {overdueCount > 0 && summary && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">
            {overdueCount} faktur sudah lewat jatuh tempo
          </b>{" "}
          — total {formatMoney(summary.totalOverdueOutstanding)}. Prioritaskan
          pembayaran supaya pasokan tidak terganggu.
          {query.view !== "overdue" && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setQuery({ view: "overdue" })}
                className="font-medium text-primary hover:text-primary-hover"
              >
                Lihat daftarnya →
              </button>
            </>
          )}
        </div>
      )}

      <PayablesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && invoices.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat data faktur pembelian…
        </div>
      ) : (
        <>
          <PayablesTable
            invoices={invoices}
            loading={loading}
            search={query.search}
            canPay={can("purchaseInvoices", "pay")}
            canReceive={can("goodsReceipts", "create")}
            onPay={openPay}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="faktur"
            unitPlural="faktur"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}

      {paying && (
        <PayInvoiceDialog
          invoice={paying}
          open
          onOpenChange={(open) => {
            if (!open) setPaying(null);
          }}
          onPaid={() => {
            refetch();
            setSummaryNonce((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
