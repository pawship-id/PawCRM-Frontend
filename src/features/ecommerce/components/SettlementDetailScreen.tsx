"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, Breadcrumb, Card, DataTable, JournalLink, Spinner, StatTile, type DataTableColumn } from "@/components";
import { usePermissions } from "@/features/permissions";
import { marketplaceService } from "@/services/marketplace.service";
import type { MarketplaceSettlementDetail } from "@/types/marketplace";

import { ecommerceFailure } from "../errors";
import {
  ECOMMERCE_HREF,
  INVOICE_HREF,
  INVOICE_PAYMENT_HREF,
  channelLabel,
  formatCount,
  formatDate,
  formatRupiah,
  marketplaceProfile,
} from "../labels";

type Line = MarketplaceSettlementDetail["lines"][number];

/**
 * One PMT — what a marketplace payout paid. Read only: the invoices it settled
 * and what the marketplace kept. TikTok adds adjustment rows: no invoice, a
 * payment of their own against Selisih pencairan. Each invoice has its own payment and journal, opened from its
 * row; cancelling one there marks the row here (BO, 1 Nov 2026).
 */
export function SettlementDetailScreen({ id }: { id: string }) {
  const { can } = usePermissions();
  const [settlement, setSettlement] = useState<MarketplaceSettlementDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    marketplaceService
      .getSettlement(id)
      .then((next) => {
        if (active) setSettlement(next);
      })
      .catch((failure) => {
        if (active) setError(ecommerceFailure(failure, "Pencairan tidak bisa dimuat.").toast);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!settlement) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const { totals } = settlement;
  const profile = marketplaceProfile(settlement.marketplace);
  const isTikTok = settlement.marketplace === "tiktok";
  const settledCount = settlement.lines.filter((line) => !line.cancelled && line.invoiceId).length;
  const adjustmentCount = settlement.lines.filter((line) => !line.cancelled && line.result === "adjustment").length;
  const columns: DataTableColumn<Line>[] = [
    {
      id: "order",
      header: "No. pesanan",
      cell: (row) => (
        <div>
          <div className="font-semibold tabular-nums text-foreground">{row.orderNo}</div>
          <div className="text-sm tabular-nums text-muted">
            Dilepas {formatDate(row.releasedAt)}
            {channelLabel(row.channel) ? ` · ${channelLabel(row.channel)}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "invoice",
      header: "Faktur",
      cell: (row) =>
        row.invoiceId ? (
          <Link href={INVOICE_HREF(row.invoiceId)} className="whitespace-nowrap tabular-nums text-primary underline">
            {row.invoiceNumber ?? "Buka faktur"}
          </Link>
        ) : (
          <span className="text-sm text-muted">
            {[row.kindLabel ?? "Penyesuaian", row.relatedOrderNo ? `pesanan ${row.relatedOrderNo}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ),
    },
    {
      id: "payment",
      header: "Pembayaran",
      cell: (row) =>
        row.paymentId ? (
          <Link
            href={
              row.invoiceId
                ? INVOICE_PAYMENT_HREF(row.invoiceId, row.paymentId)
                : `/dashboard/finance/cash-bank/transactions/${row.paymentId}`
            }
            className="whitespace-nowrap tabular-nums text-primary underline"
          >
            {row.paymentNumber ?? "Buka pembayaran"}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "value",
      header: "Nilai faktur",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.invoiceValue)}</span>,
    },
    {
      id: "fees",
      header: "Potongan",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.fees)}</span>,
    },
    {
      id: "pph22",
      header: "PPh 22",
      align: "right",
      cell: (row) => <span className="tabular-nums">{formatRupiah(row.pph22)}</span>,
    },
    {
      id: "released",
      header: "Dana cair",
      align: "right",
      cell: (row) => <span className="font-semibold tabular-nums">{formatRupiah(row.netReleased)}</span>,
    },
    {
      id: "result",
      header: "Hasil",
      cell: (row) =>
        row.cancelled ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
            Dibatalkan
          </span>
        ) : row.result === "adjustment" ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-warning">
            Penyesuaian
          </span>
        ) : row.result === "variance" ? (
          <div>
            <span className="inline-flex whitespace-nowrap rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-warning">
              Selisih
            </span>
            <div className="mt-1 text-sm tabular-nums text-muted">{formatRupiah(row.variance)}</div>
          </div>
        ) : (
          <span className="inline-flex whitespace-nowrap rounded-full bg-tint-success px-2 py-0.5 text-xs font-medium text-success">
            Cocok
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumb
          items={[{ label: "E-commerce", href: ECOMMERCE_HREF }, { label: settlement.number }]}
        />
        <h1 className="text-2xl font-extrabold tabular-nums">{settlement.number}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Dana cair"
          value={formatRupiah(totals.released)}
          caption={`${formatCount(settledCount)} faktur lunas${
            adjustmentCount ? ` · ${formatCount(adjustmentCount)} penyesuaian` : ""
          }`}
        />
        <StatTile label="Nilai faktur" value={formatRupiah(totals.invoices)} />
        <StatTile
          label="Potongan marketplace"
          value={formatRupiah(
            totals.admin + totals.program + (totals.affiliate ?? 0) + (totals.ads ?? 0) + totals.shipping,
          )}
        />
        <StatTile label="PPh 22" value={formatRupiah(totals.pph22)} />
      </div>

      <Card>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ["Toko", `${profile.short} · ${settlement.storeName ?? "—"}`],
            ["Tanggal", formatDate(settlement.date)],
            ["Periode laporan", `${formatDate(settlement.periodFrom)} – ${formatDate(settlement.periodTo)}`],
            ...(isTikTok ? [] : [["Penjual", settlement.shopUsername ?? "—"]]),
            ...(totals.adjustment ? [["Penyesuaian", formatRupiah(totals.adjustment)]] : []),
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold text-foreground">{value}</dd>
            </div>
          ))}
          {settlement.journalEntryId ? (
            <div>
              <dt className="text-muted">Jurnal</dt>
              <dd className="font-semibold">
                <JournalLink
                  id={settlement.journalEntryId}
                  number={settlement.journalEntryNumber}
                  linked={can("journalEntries", "read")}
                />
              </dd>
            </div>
          ) : null}
          {totals.variance !== 0 ? (
            <div>
              <dt className="text-muted">Selisih</dt>
              <dd className="font-semibold tabular-nums text-foreground">{formatRupiah(totals.variance)}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground">
          {adjustmentCount ? "Faktur dilunasi & penyesuaian" : "Faktur dilunasi"}
        </h2>
        <DataTable columns={columns} rows={settlement.lines} rowKey={(row) => `${row.orderNo}-${row.releasedAt}`} />
      </section>
    </div>
  );
}
