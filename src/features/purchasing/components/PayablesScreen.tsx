"use client";

import { useEffect, useState } from "react";

import { Alert, Pagination, Spinner } from "@/components";
import { usePermissions } from "@/features/permissions";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type { SupplierOutstandingSummary } from "@/types/api";

import { usePurchaseInvoices } from "../hooks/usePurchaseInvoices";
import { PurchasingModuleHeader } from "./PurchasingModuleHeader";
import { PayablesStatCards, type PayablesStatFigures } from "./PayablesStatCards";
import { PayablesTable } from "./PayablesTable";
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
 */
export function PayablesScreen() {
  const { can } = usePermissions();
  const { invoices, pagination, query, loading, error, setQuery } =
    usePurchaseInvoices();

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
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PurchasingModuleHeader />

      {/* The mockup's strip, over the search box below it. */}
      <PayablesStatCards
        figures={figures}
        loading={!summary && !summaryFailed}
        failed={summaryFailed}
        // Withheld once the list already shows the bucket — a control that
        // leads nowhere new is noise.
        onDueSoonClick={
          query.view !== "dueSoon" ? () => setQuery({ view: "dueSoon" }) : undefined
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

      <p className="text-xs text-muted">
        Faktur dan pembayaran tidak bisa diubah atau dihapus — setiap pembayaran
        memposting jurnal yang permanen. Koreksi dilakukan dengan jurnal
        pembalik.
      </p>
    </div>
  );
}
