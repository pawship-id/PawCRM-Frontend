"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Pagination, Spinner } from "@/components";
import { PageHeading } from "@/features/purchasing";
import { Can } from "@/features/permissions";
import { Button as UIButton } from "@/components/ui/button";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { CustomerOutstandingSummary } from "@/types/api";

import { INVOICES_CRUMBS } from "../crumbs";
import { useCustomerInvoices } from "../hooks/useCustomerInvoices";
import { ReceivablesTable } from "./ReceivablesTable";
import { ReceivablesToolbar } from "./ReceivablesToolbar";

/**
 * `2026-08-01T…` → `Agustus 2026`.
 *
 * FROM THE SERVER'S RANGE, not from the browser's clock. The month was cut in the
 * TENANT's timezone, which is a different month from the reader's for a few hours
 * either side of every boundary — and a card captioned with one month over a
 * figure computed for another is the kind of wrong nobody catches for weeks.
 */
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

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
          Faktur lahir dari dua tempat: terbit otomatis saat kasir menyelesaikan
          penjualan dengan pembayaran Piutang, atau dibuat sendiri di sini.
          Penagihan boleh dicicil — DP, cicilan, dan pelunasan semuanya lewat
          satu tombol yang sama.
        </PageHeading>

        {/*
          GATED SEPARATELY FROM THE PAGE. `read` is what opens this list; raising
          an invoice cuts stock and posts two journal entries, so a collections
          user sees every bill and no way to create one. The route behind it
          carries the same gate — a hidden button is a courtesy, never the
          control.
        */}
        <Can feature="customerInvoices" action="create">
          <UIButton asChild size="lg">
            <Link href="/dashboard/sales/new">Buat faktur</Link>
          </UIButton>
        </Can>
      </div>

      {/*
        THREE CARDS, AND THEY READ AS ONE SENTENCE: owed, late, collected. That is
        PCR-033's own list, and the order is the order the questions are asked in.

        ALWAYS VISIBLE, including at zero — unlike the two notices below them,
        which appear only when there is something to act on. A card that vanishes
        when its figure is zero teaches people that its absence means "not loaded".
      */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total piutang berjalan"
          value={summary && formatMoney(summary.totalOutstanding)}
          caption={
            summary === null
              ? "seluruh pelanggan"
              : `${summary.totalInvoices} faktur belum lunas`
          }
        />
        <StatCard
          label="Lewat jatuh tempo"
          value={summary && formatMoney(summary.totalOverdueOutstanding)}
          caption={
            summary === null
              ? "—"
              : `${summary.totalOverdueInvoices} faktur perlu ditagih`
          }
          tone={overdueCount > 0 ? "danger" : "plain"}
        />
        <StatCard
          label={
            summary === null
              ? "Tertagih bulan ini"
              : `Tertagih ${monthLabel(summary.collectedThisMonth.from)}`
          }
          value={summary && formatMoney(summary.collectedThisMonth.amount)}
          caption={
            summary === null
              ? "—"
              : `${summary.collectedThisMonth.paymentCount} pembayaran diterima`
          }
          tone={
            summary && summary.collectedThisMonth.paymentCount > 0
              ? "success"
              : "plain"
          }
        />
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

/**
 * One headline figure, always rendered — even at zero.
 *
 * `value` IS NULLABLE AND RENDERS AS AN EM DASH, which is not the same as "Rp 0".
 * Null means the summary request failed; zero means nobody owes anything. A card
 * that showed "Rp 0" for a read that never arrived would be a confident wrong
 * answer, and this screen's whole point is figures that can be trusted.
 *
 * THE TONE COLOURS THE NUMBER, never the card. A red panel in a row of three
 * turns a dashboard into an alarm; a red numeral says the same thing without
 * shouting, and the row stays scannable. `danger` is only used when there IS
 * overdue money — at zero it reads as plain, because zero overdue is good news.
 */
function StatCard({
  label,
  value,
  caption,
  tone = "plain",
}: {
  label: string;
  /** Null while the summary is loading or after it failed. */
  value: string | null;
  caption: string;
  tone?: "plain" | "danger" | "success";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-xl font-semibold tabular-nums",
          tone === "danger" && "text-danger-ink",
          tone === "success" && "text-success",
        )}
      >
        {value ?? "—"}
      </p>
      <p className="mt-1 text-xs text-muted">{caption}</p>
    </div>
  );
}
