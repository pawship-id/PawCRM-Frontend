"use client";

import { useEffect, useState } from "react";

import { Alert, Pagination, Spinner } from "@/components";
import { usePermissions } from "@/features/permissions";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type { SupplierOutstandingSummary } from "@/types/api";

import { PURCHASING_CRUMBS } from "../crumbs";
import { usePurchaseInvoices } from "../hooks/usePurchaseInvoices";
import { PageHeading } from "./PageHeading";
import { PayablesTable } from "./PayablesTable";
import { PayablesToolbar } from "./PayablesToolbar";

/**
 * What the tenant owes its suppliers, and which of it is late.
 *
 * THE TWO HEADLINE FIGURES ARE THE WHOLE BOOK, not this page, and both come from
 * `/purchase-invoices/outstanding` in one request. That endpoint sums in the
 * database over everything unsettled; a client adding up the twenty rows it was
 * sent would show a total that grows as the user pages — worse than showing
 * nothing, because it looks authoritative.
 *
 * THE OVERDUE BANNER IS WHY THE SUMMARY ENDPOINT CARRIES OVERDUE AT ALL. The
 * count alone could be had from `?overdue=true` through `pagination.total`, but
 * the rupiah figure could not: it would mean paging the entire overdue book, and
 * any answer short of that is a confident wrong number. Both halves now arrive
 * from one aggregation as of one instant, so the banner cannot claim more is
 * late than is owed.
 *
 * THE DUE-SOON NOTE IS THE SAME BARGAIN, one step earlier: money that still has
 * time. It is deliberately quieter than the overdue banner — nothing here is a
 * problem yet — and it is the one figure on this screen that comes with a way to
 * act on it, because the set it describes is a view of the list underneath it.
 * The window it names is the server's `horizonDays`, not a constant here.
 *
 * THE FIGURES ARE UNFILTERED ON PURPOSE. They answer "what do we owe, ever",
 * which is a different question from the one the toolbar is asking. Quietly
 * re-scoping them to the current filter would make the same number mean two
 * things depending on which chip is selected.
 */
export function PayablesScreen() {
  const { can } = usePermissions();
  const { invoices, pagination, query, loading, error, setQuery } =
    usePurchaseInvoices();

  const [summary, setSummary] = useState<SupplierOutstandingSummary | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    purchaseInvoiceService
      .outstandingSummary()
      .then((result) => {
        if (active) setSummary(result);
      })
      // The list is the screen; a missing headline figure is not worth an error
      // banner over data that loaded fine.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const overdueCount = summary?.totalOverdueInvoices ?? 0;
  const dueSoonCount = summary?.totalDueSoonInvoices ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          crumbs={[PURCHASING_CRUMBS.hub, { label: "Utang Supplier" }]}
          title="Utang Supplier"
        >
          Utang tercatat otomatis saat penerimaan beli putus diposting. Faktur
          dari supplier dicatat terpisah — itu yang membawa nomor tagihan dan
          tanggal jatuh temponya. Pembayaran boleh dicicil sampai lunas.
        </PageHeading>

        <div className="text-right">
          <p className="text-[10px] font-medium tracking-widest text-muted uppercase">
            Total sisa utang
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums">
            {summary === null ? "—" : formatMoney(summary.totalOutstanding)}
          </p>
          <p className="text-[10px] text-muted">
            {summary === null
              ? "seluruh supplier"
              : `${summary.totalInvoices} faktur belum lunas`}
          </p>
        </div>
      </div>

      {overdueCount > 0 && summary && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">
            {overdueCount} faktur sudah lewat jatuh tempo
          </b>{" "}
          — total {formatMoney(summary.totalOverdueOutstanding)}. Prioritaskan
          pembayaran supaya pasokan tidak terganggu.
        </div>
      )}

      {dueSoonCount > 0 && summary && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border bg-accent px-4 py-3 text-sm">
          <span>
            <b>
              {dueSoonCount} faktur jatuh tempo dalam {summary.horizonDays} hari
            </b>{" "}
            — siapkan {formatMoney(summary.totalDueSoonOutstanding)}.
          </span>
          {/* The one headline here that can be acted on: the same bucket the
              figures describe is a view of the list below, asked of the server
              with the same definition. */}
          {query.view !== "dueSoon" && (
            <button
              type="button"
              onClick={() => setQuery({ view: "dueSoon" })}
              className="font-medium text-primary hover:text-primary-hover"
            >
              Lihat daftarnya →
            </button>
          )}
        </div>
      )}

      <PayablesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && invoices.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat data utang supplier…
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
