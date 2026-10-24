"use client";

import { useMemo } from "react";
import { Coins, LineChart, Percent, Wallet } from "lucide-react";

import { Alert, PendingStatTile, StatTile } from "@/components";
import {
  changePct,
  formatPercent,
  lineProfits,
  marginPct,
  profitLossHeadline,
} from "@/features/accounting/financeSummary";
import { LineRevenueChart } from "@/features/accounting/components/LineRevenueChart";
import { useCashBankAccounts } from "@/features/accounting/hooks/useCashBankAccounts";
import { useFinanceDashboard } from "@/features/accounting/hooks/useFinanceDashboard";
import { usePermissions } from "@/features/permissions";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { membershipService } from "@/services/membership.service";
import { reportService } from "@/services/report.service";
import {
  divideRound,
  formatMoney,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import { useBerandaScope } from "./BerandaShell";
import { BarList, Panel, TileGrid, deltaCaption } from "./parts";
import { useRemote } from "./useRemote";

/**
 * Beranda › Uang — whether the shop is making money in the period, where it
 * leaks, and where the cash stands.
 *
 * THE LEDGER IS KEUANGAN'S OWN READ (`useFinanceDashboard`), so every figure
 * here is the number Keuangan › Ringkasan shows for the same scope. Discounts
 * are the real contra accounts, not the mockup's flat 11%.
 *
 * WHAT THE MOCKUP DRAWS THAT NOTHING CAN ANSWER YET is badged "Segera": the
 * discount split by source (the ledger books one Diskon Penjualan account),
 * and a promo concept, which does not exist.
 */
export function BerandaUang() {
  const { now, today, branchIds, dateFrom, dateTo } = useBerandaScope();
  const { can } = usePermissions();
  const branchKey = branchIds.join(",");

  const query = useMemo(
    () => ({ dateFrom, dateTo, branchIds, businessLineIds: [] }),
    [dateFrom, dateTo, branchIds],
  );

  const data = useFinanceDashboard(query, {
    now,
    ledger: can("journalEntries", "read"),
    cashMovement: false,
    receivables: can("customerInvoices", "read"),
    payables: can("purchaseInvoices", "read"),
    fixedCosts: false,
  });

  const headline = useMemo(
    () => (data.profitLoss ? profitLossHeadline(data.profitLoss) : null),
    [data.profitLoss],
  );
  const before = useMemo(
    () =>
      data.previous?.profitLoss
        ? profitLossHeadline(data.previous.profitLoss)
        : null,
    [data.previous],
  );
  const lines = useMemo(
    () =>
      data.profitLoss ? lineProfits(data.profitLoss, data.businessLineNames) : [],
    [data.profitLoss, data.businessLineNames],
  );
  const lineOrder = useMemo(
    () => data.businessLines.map((line) => line._id),
    [data.businessLines],
  );

  const readsInvoices = can("customerInvoices", "read");
  const orders = useRemote(
    `orders|${branchKey}|${dateFrom}|${dateTo}`,
    () =>
      customerInvoiceService.summary({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        branchIds: branchIds.length ? branchIds : undefined,
      }),
    readsInvoices,
  );

  const membership = useRemote(
    `membership|${dateFrom}|${dateTo}`,
    () =>
      membershipService.report({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    can("petMemberships", "read"),
  );

  /* A position as of today, whatever the period — Kas & Bank's own read. */
  const readsCash = can("chartOfAccounts", "read");
  const cash = useCashBankAccounts(
    { dateFrom: today, dateTo: today, branchIds, includeInactive: false },
    { enabled: readsCash },
  );

  const readsCommissions = can("users", "read");
  const commissions = useRemote(
    `commissions|${branchKey}|${dateFrom}|${dateTo}`,
    () =>
      reportService.commissionRecords({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        branchIds: branchIds.length ? branchIds : undefined,
        limit: 1,
      }),
    readsCommissions,
  );

  const delta = (current?: string, previous?: string) =>
    current !== undefined && previous !== undefined
      ? deltaCaption(changePct(current, previous))
      : null;

  const count = orders.data?.revenue.invoiceCount ?? 0;
  const average =
    orders.data && count > 0
      ? toDecimalString(
          divideRound(toMinor(orders.data.revenue.amount) ?? 0n, BigInt(count)),
        )
      : null;

  if (data.error) {
    return (
      <Alert variant="error">
        Ringkasan uang gagal dimuat. {data.error}
      </Alert>
    );
  }

  const ledger = { loading: data.loading, error: false };

  return (
    <div className="flex flex-col gap-6">
      <Panel icon={Coins} tone="green" title="Pendapatan" tag="Cabang · Periode">
        <div className="flex flex-col gap-3">
          <TileGrid columns={2}>
            {/*
              NET, LIKE EVERY OTHER OMZET (BO, 18 Oktober 2026: "samain ama laba
              rugi … kalo net"). It was the gross figure, which put three
              different omzet on three screens for one month.
            */}
            <StatTile
              label="Omzet"
              value={formatMoney(headline?.netRevenue ?? "0")}
              caption={
                delta(headline?.netRevenue, before?.netRevenue) ??
                `Sebelum diskon & retur ${formatMoney(headline?.grossRevenue ?? "0")}`
              }
              hint="Penjualan barang dan jasa setelah diskon dan retur, sebelum PPN — sama dengan Total pendapatan di Laba Rugi dan Omzet periode di Penjualan › Ringkasan. Ongkir dan biaya lain tidak termasuk."
              {...ledger}
            />
            <StatTile
              label="Laba bersih"
              value={formatMoney(headline?.netProfit ?? "0")}
              caption={
                delta(headline?.netProfit, before?.netProfit) ??
                `Setelah HPP ${formatMoney(headline?.hpp ?? "0")} dan biaya ${formatMoney(headline?.operatingExpense ?? "0")}`
              }
              tone={headline?.netProfit.startsWith("-") ? "danger" : "plain"}
              {...ledger}
            />
          </TileGrid>
          <TileGrid columns={3}>
            {readsInvoices && (
              <StatTile
                label="Order selesai"
                value={count.toLocaleString("id-ID")}
                caption="faktur terbit di periode ini"
                loading={orders.loading}
                error={orders.failed}
              />
            )}
            {readsInvoices && (
              <StatTile
                label="Rata-rata per transaksi"
                value={average ? formatMoney(average) : "—"}
                caption="nilai faktur ÷ jumlah faktur"
                loading={orders.loading}
                error={orders.failed}
              />
            )}
            <StatTile
              label="Margin kotor"
              value={formatPercent(
                headline ? marginPct(headline.grossProfit, headline.netRevenue) : null,
              )}
              caption={`Laba kotor ${formatMoney(headline?.grossProfit ?? "0")}`}
              {...ledger}
            />
          </TileGrid>
          <BarList
            title="Per lini bisnis"
            empty="Belum ada pendapatan per lini bisnis di periode ini."
            rows={lines
              .filter((line) => !line.revenue.startsWith("-"))
              .map((line) => ({
                label: line.label,
                value: Number(line.revenue),
                display: formatMoney(line.revenue),
              }))
              .filter((row) => row.value > 0)
              .sort((a, b) => b.value - a.value)}
          />
        </div>
      </Panel>

      <Panel icon={Percent} tone="orange" title="Diskon & kebocoran" tag="Cabang · Periode">
        <TileGrid>
          {can("petMemberships", "read") && (
            <StatTile
              label="Benefit membership"
              value={formatMoney(membership.data?.summary.benefitValue ?? "0")}
              caption={`${membership.data?.summary.cards ?? 0} kartu terjual`}
              hint="Nilai benefit membership yang dipakai di periode ini, dihitung dengan harga katalog. Tidak mengikuti filter cabang."
              loading={membership.loading}
              error={membership.failed}
            />
          )}
          <PendingStatTile
            label="Diskon promo"
            blockedBy="Promo belum ada di sistem."
          />
          <PendingStatTile
            label="Diskon manual kasir"
            blockedBy="Diskon belum dipisah per sumber."
          />
          <StatTile
            label="Diskon terhadap omzet"
            value={formatPercent(
              headline
                ? marginPct(headline.deductions, headline.grossRevenue)
                : null,
            )}
            caption={`Diskon & retur ${formatMoney(headline?.deductions ?? "0")}`}
            hint="Total diskon dan retur penjualan dibagi omzet kotor, dari akun kontra pendapatan di laba rugi."
            {...ledger}
          />
        </TileGrid>
      </Panel>

      <Panel icon={LineChart} title="Tren 7 hari" tag="Pendapatan per lini bisnis">
        <LineRevenueChart
          days={data.trend}
          names={data.businessLineNames}
          lineOrder={lineOrder}
          loading={data.trendLoading}
          error={data.trendError}
          onRetry={data.refetch}
        />
        <p className="mt-3 text-xs text-muted">
          Pendapatan setelah diskon & retur, tujuh hari terakhir — tidak ikut
          filter periode, tapi ikut filter cabang.
        </p>
      </Panel>

      <Panel icon={Wallet} title="Posisi kas" tag="Per hari ini">
        <TileGrid>
          {readsCash && (
            <StatTile
              label="Saldo kas & bank"
              value={formatMoney(cash.totalSaldo)}
              caption={`${cash.rows.length} akun aktif`}
              loading={cash.loading}
              error={cash.error !== null}
            />
          )}
          {can("customerInvoices", "read") && (
            <StatTile
              label="Piutang belum lunas"
              value={formatMoney(data.receivables?.totalOutstanding ?? "0")}
              caption={`${data.receivables?.totalOverdueInvoices ?? 0} lewat jatuh tempo`}
              loading={data.loading && !data.receivables}
            />
          )}
          {can("purchaseInvoices", "read") && (
            <StatTile
              label="Utang belum lunas"
              value={formatMoney(data.payables?.totalOutstanding ?? "0")}
              caption={`${data.payables?.totalInvoices ?? 0} faktur pembelian`}
              hint="Semua cabang — utang supplier belum bisa dipisah per cabang."
              loading={data.loading && !data.payables}
            />
          )}
          {readsCommissions && (
            <StatTile
              label="Komisi belum dibayar"
              value={formatMoney(commissions.data?.cards.pending ?? "0")}
              caption="komisi periode ini yang belum dibayar"
              loading={commissions.loading}
              error={commissions.failed}
            />
          )}
        </TileGrid>
      </Panel>
    </div>
  );
}
