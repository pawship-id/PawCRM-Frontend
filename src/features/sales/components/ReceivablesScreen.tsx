"use client";

import { useEffect, useState } from "react";

import { Alert, Pagination, Spinner } from "@/components";
import { PageHeading } from "@/features/purchasing";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type { CustomerOutstandingSummary } from "@/types/api";

import { INVOICES_CRUMBS } from "../crumbs";
import { useCustomerInvoices } from "../hooks/useCustomerInvoices";
import { ReceivablesTable } from "./ReceivablesTable";
import { ReceivablesToolbar } from "./ReceivablesToolbar";

/**
 * What customers owe the shop, and which of it is late.
 *
 * THE HEADLINE FIGURES ARE THE WHOLE BOOK, not this page, and all of them come
 * from `/customer-invoices/outstanding` in one request. That endpoint sums in the
 * database over everything still collectable; a client adding up the twenty rows
 * it was sent would show a total that grows as the user pages — worse than
 * showing nothing, because it looks authoritative.
 *
 * THE OVERDUE BANNER IS WHY THE SUMMARY ENDPOINT CARRIES OVERDUE AT ALL. The
 * count alone could be had from `?overdue=true` through `pagination.total`, but
 * the rupiah figure could not: it would mean paging the entire overdue book, and
 * any answer short of that is a confident wrong number. Both halves arrive from
 * one aggregation as of one instant, so the banner cannot claim more is late than
 * is owed.
 *
 * THE FIGURES ARE UNFILTERED ON PURPOSE. They answer "what are we owed, ever",
 * which is a different question from the one the toolbar is asking. Quietly
 * re-scoping them to the current filter would make the same number mean two
 * things depending on which pill is selected.
 *
 * NAMED FOR THE DOCUMENT, NOT FOR ITS BALANCE. Every row here is a receivable
 * today, but "Piutang Pelanggan" would be a title that contradicts its own Lunas
 * pill the moment a settled invoice appears — and after PCR-030 they will
 * accumulate. Piutang stays as the default LENS and as the headline FIGURE, which
 * is where it is true.
 *
 * WHERE THESE INVOICES COME FROM. Today, every one of them was raised by the
 * till: settling a sale with the Piutang method issues a receivable inside the
 * sale's own transaction. There is no create form yet — that is PCR-030 — which
 * is why this screen has no "Buat faktur" button and says so in its own words
 * rather than leaving a reader to wonder.
 */
export function ReceivablesScreen() {
  const { invoices, pagination, query, loading, error, setQuery } =
    useCustomerInvoices();

  const [summary, setSummary] = useState<CustomerOutstandingSummary | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    customerInvoiceService
      .outstanding()
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
        <PageHeading crumbs={INVOICES_CRUMBS} title="Faktur Penjualan">
          Faktur terbit otomatis saat kasir menyelesaikan penjualan dengan
          pembayaran Piutang. Penagihan boleh dicicil — DP, cicilan, dan
          pelunasan semuanya lewat satu tombol yang sama.
        </PageHeading>

        {/* Wide: a right-aligned figure beside the heading. Phone: the two have
            wrapped onto separate lines, and a shrink-to-fit box at the left edge
            of an empty row reads as a stray caption — so it takes the whole
            width and puts the label and the number at opposite ends of one line,
            which is how a total is read everywhere else. */}
        <div className="max-sm:w-full sm:text-right">
          <div className="flex items-baseline gap-3 max-sm:justify-between sm:block">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Total piutang berjalan
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {summary === null ? "—" : formatMoney(summary.totalOutstanding)}
            </p>
          </div>
          <p className="text-xs text-muted">
            {summary === null
              ? "seluruh pelanggan"
              : `${summary.totalInvoices} faktur belum lunas`}
          </p>
        </div>
      </div>

      {overdueCount > 0 && summary && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">
            {overdueCount} faktur sudah lewat jatuh tempo
          </b>{" "}
          — total {formatMoney(summary.totalOverdueOutstanding)}. Hubungi
          pelanggannya sebelum piutangnya menua lebih jauh.
        </div>
      )}

      {dueSoonCount > 0 && summary && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
          <span>
            <b>
              {dueSoonCount} faktur jatuh tempo dalam {summary.horizonDays} hari
            </b>{" "}
            — perkiraan masuk {formatMoney(summary.totalDueSoonOutstanding)}.
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

      <ReceivablesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && invoices.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar faktur…
        </div>
      ) : (
        <>
          <ReceivablesTable
            invoices={invoices}
            loading={loading}
            search={query.search}
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
