"use client";

import { useEffect, useState } from "react";

import {
  Alert,
  Pagination,
  PendingStatTile,
  Spinner,
  StatTile,
} from "@/components";
import { usePermissions } from "@/features/permissions";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type { SupplierOutstandingSummary } from "@/types/api";

import { usePurchaseInvoices } from "../hooks/usePurchaseInvoices";
import { PurchasingModuleHeader } from "./PurchasingModuleHeader";
import { PayablesTable } from "./PayablesTable";
import { PayablesToolbar } from "./PayablesToolbar";

/** The default, before the real summary (and its own `horizonDays`) has loaded. */
const DEFAULT_HORIZON_DAYS = 7;

/**
 * What the tenant owes its suppliers, and which of it is late — now carrying the
 * BO mockup's own four-card strip (`buloo-navigation-v3`, Pembelian tab),
 * added 1 October 2026 on request, ABOVE THE SEARCH BOX THE MOCKUP DRAWS IT
 * OVER.
 *
 * TWO OF THE FOUR CARDS ARE REAL. "Utang belum lunas" and "Jatuh tempo ≤N hari"
 * are the same two aggregates the old header figure and due-soon banner already
 * read — see `SupplierOutstandingSummary` below — just promoted into the strip
 * the mockup draws, so this screen stopped saying the same number in two places.
 *
 * TWO OF THE FOUR ARE `PendingStatTile`, NOT INVENTED. "Pembelian periode" would
 * need a sum of invoice VALUE by issue date, which no endpoint computes today —
 * `/purchase-invoices/summary`'s `paid` is payments made, not invoices raised.
 * "Barang belum diterima" has no backing concept at all: a purchase invoice's
 * `goodsReceiptId` is required and one-to-one (see the backend model), so every
 * invoice in this schema is already created FROM a completed receipt — there is
 * no partial or pending receiving state to count. Badging both "Segera" says so
 * rather than quietly dropping them or faking a number.
 *
 * THE OVERDUE BANNER SURVIVES, because it answers a question neither new card
 * does: what is ALREADY late. "Jatuh tempo ≤N hari" is deliberately the
 * NOT-YET-LATE bucket (see `SupplierOutstandingSummary.totalDueSoonInvoices`),
 * so dropping the banner would leave the one number this shop acts on first with
 * no home. It also still carries the one call to action on this screen: the
 * overdue bucket is a view of the list right below it.
 *
 * THE FIGURES ARE UNFILTERED ON PURPOSE, same as before. They answer "what do we
 * owe, ever", a different question from the one the toolbar beneath the cards is
 * asking. Quietly re-scoping them to the current filter would make the same
 * number mean two things depending on which chip is selected.
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
  const dueSoonCount = summary?.totalDueSoonInvoices ?? 0;
  const horizonDays = summary?.horizonDays ?? DEFAULT_HORIZON_DAYS;

  return (
    <div className="flex flex-col gap-6">
      <PurchasingModuleHeader />

      {/* The mockup's strip, over the search box below it. */}
      <section
        aria-label="Ringkasan faktur pembelian"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <PendingStatTile
          label="Pembelian periode"
          blockedBy="Total nilai faktur yang diterbitkan periode ini belum dihitung di ringkasan ini."
        />
        <StatTile
          label="Utang belum lunas"
          value={summary ? formatMoney(summary.totalOutstanding) : "—"}
          caption={summary ? `${summary.totalInvoices} faktur` : undefined}
          loading={!summary && !summaryFailed}
          error={summaryFailed}
        />
        <StatTile
          label={`Jatuh tempo ≤ ${horizonDays} hari`}
          value={summary ? `${dueSoonCount} faktur` : "—"}
          caption={
            summary ? formatMoney(summary.totalDueSoonOutstanding) : undefined
          }
          loading={!summary && !summaryFailed}
          error={summaryFailed}
          // Drills into the same bucket, when there is one to drill into — see
          // ui-rules on the mockup's `.mcard.click` and `StatTile`'s own doc.
          onClick={
            dueSoonCount > 0 && query.view !== "dueSoon"
              ? () => setQuery({ view: "dueSoon" })
              : undefined
          }
        />
        <PendingStatTile
          label="Barang belum diterima"
          blockedBy="Setiap faktur pembelian dibuat dari penerimaan yang sudah lengkap — belum ada status barang belum diterima."
        />
      </section>

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
