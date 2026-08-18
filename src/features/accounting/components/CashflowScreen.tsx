"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Alert, Breadcrumb } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { absDecimal, formatMoney } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { formatPercent, reportPresets, type FinanceQuery } from "../financeSummary";
import {
  cashflowReport,
  FIXTURE_BRANCHES,
  FIXTURE_PERIOD_LABEL,
} from "../reportSummary";
import { FinanceReportToolbar } from "./FinanceReportToolbar";

/**
 * Arus kas — where the money started, what moved through it, where it ended.
 *
 * A POSITION AND A MOVEMENT ON ONE SCREEN, which is the whole reason this is not
 * part of the laba rugi page. A P&L says whether the shop earned; this says
 * whether it has any money, and the two answer differently all the time — a shop
 * can post a profitable month and still not make payroll, because the profit is
 * sitting in piutang. Saldo Akhir is the number somebody actually acts on.
 *
 * NO LINI BISNIS FILTER, deliberately, and the toolbar drops the control rather
 * than disabling it: a rupiah in the bank belongs to the shop, not to grooming or
 * retail. The dashboard's cash card already states the same thing, and offering a
 * filter that cannot narrow anything is how somebody ends up believing it did.
 *
 * THE FIGURES ARE CONTOH. `/journal-entries/balances` gives a position as of a
 * date — it has no lower bound, on purpose, because a balance is cumulative — so
 * Saldo Akhir could be real today but Saldo Awal, Inflow and Outflow could not:
 * those are movement over a period, and no endpoint returns them per account.
 * See ../data/reportFixtures.ts for what replaces what.
 */
export function CashflowScreen({ now }: { now: string }) {
  const today = useMemo(() => new Date(now), [now]);

  const [query, setQuery] = useState<FinanceQuery>(() => ({
    dateFrom: "",
    dateTo: "",
    branchId: "",
    businessLineId: "",
  }));

  const presets = useMemo(() => reportPresets(today), [today]);
  const report = useMemo(() => cashflowReport(query.branchId), [query.branchId]);

  const branchLabel = query.branchId
    ? (FIXTURE_BRANCHES.find((branch) => branch._id === query.branchId)?.name ??
      "Cabang terpilih")
    : "Semua cabang";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[ACCOUNTING_CRUMBS.hub, { label: "Arus Kas" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Arus Kas
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Pergerakan kas dan bank sepanjang periode, per akun. Berbeda dari laba
          rugi: penjualan yang belum dibayar sudah masuk laba, tapi belum masuk
          ke sini.
        </p>
      </div>

      <Alert variant="info">
        <p className="font-semibold">Angka di halaman ini masih contoh.</p>
        <p className="mt-0.5">
          Belum terhubung ke jurnal umum. Filter cabang sudah bekerja di data
          contoh ini; filter periode belum, karena datanya baru satu periode (
          {FIXTURE_PERIOD_LABEL}).
        </p>
      </Alert>

      <FinanceReportToolbar
        query={query}
        branches={FIXTURE_BRANCHES}
        presets={presets}
        onChange={(patch) => setQuery((prev) => ({ ...prev, ...patch }))}
      />

      {/* The identity is printed, not merely obeyed: four figures that do not
          visibly add up are four figures somebody has to reverse-engineer. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-hover px-4 py-3">
          <h2 className="text-base font-bold">Ringkasan Arus Kas</h2>
          <span className="text-xs text-muted">
            Saldo Akhir = Saldo Awal + Masuk − Keluar
          </span>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <FlowCell
            icon={Wallet}
            label="Saldo Awal"
            value={report.totals.saldoAwal}
            hint={`${branchLabel} · awal periode`}
          />
          <FlowCell
            icon={ArrowDownLeft}
            label="Uang Masuk"
            value={report.totals.inflow}
            tone="success"
            hint="Penerimaan sepanjang periode"
          />
          <FlowCell
            icon={ArrowUpRight}
            label="Uang Keluar"
            value={report.totals.outflow}
            tone="danger"
            hint="Pembayaran sepanjang periode"
          />
          <FlowCell
            icon={Landmark}
            label="Saldo Akhir"
            value={report.totals.saldoAkhir}
            emphasis
            hint={`Arus kas bersih ${signed(report.totals.netFlow)}`}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-hover px-4 py-3">
          <h2 className="text-base font-bold">Rincian Akun Kas &amp; Bank</h2>
          <span className="text-xs tabular-nums text-muted">
            {FIXTURE_PERIOD_LABEL} · {branchLabel}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Akun</TableHead>
              <TableHead className="text-right">Saldo Awal</TableHead>
              <TableHead className="text-right">Uang Masuk</TableHead>
              <TableHead className="text-right">Uang Keluar</TableHead>
              <TableHead className="text-right">Saldo Akhir</TableHead>
              <TableHead className="text-right">Porsi Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Belum ada akun kas atau bank di cabang ini.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Tambahkan akun kas di Daftar Akun, lalu transaksinya akan
                    muncul di sini.
                  </p>
                </TableCell>
              </TableRow>
            )}

            {report.rows.map((row) => (
              <TableRow key={row.code}>
                <TableCell className="px-4 py-2.5">
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs tabular-nums text-muted">{row.code}</p>
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums text-muted">
                  {signed(row.saldoAwal)}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums text-success">
                  {signed(row.inflow)}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums text-danger-ink">
                  {signed(row.outflow)}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                  {signed(row.saldoAkhir)}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right">
                  {/* The bar is a second reading of the number beside it, never
                      the only one — §1, status is never shape or colour alone. */}
                  <span className="inline-flex items-center justify-end gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-hover"
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(row.share ?? 0, 0)}%` }}
                      />
                    </span>
                    <span className="text-sm tabular-nums text-muted">
                      {formatPercent(row.share)}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted">
        Saldo akhir setiap akun dihitung dari tiga kolom di kirinya, bukan
        disimpan terpisah — jadi angkanya tidak bisa berbeda dari penjumlahannya
        sendiri.
      </p>
    </div>
  );
}

/**
 * One figure in the summary strip.
 *
 * A 1px gap over a bordered grid rather than four bordered cards: the four
 * numbers are one equation, and boxing them separately would make them read as
 * four unrelated facts.
 */
function FlowCell({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  emphasis,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "danger";
  /** The closing balance — the one figure somebody came to the page for. */
  emphasis?: boolean;
}) {
  return (
    <div className={cn("bg-surface px-4 py-4", emphasis && "bg-navy-100")}>
      <p className="flex items-center gap-2 text-xs font-medium tracking-widest text-muted uppercase">
        <Icon
          className={cn(
            "size-4",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger-ink",
          )}
          aria-hidden
        />
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-lg font-semibold tabular-nums text-foreground",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger-ink",
        )}
      >
        {signed(value)}
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-muted">{hint}</p>
    </div>
  );
}

/**
 * Money as this report prints it.
 *
 * A TRUE MINUS SIGN, not the hyphen `formatMoney` puts after "Rp" — the same
 * choice the dashboard and the laba rugi screen make. Here it shows up on a
 * negative arus kas bersih, which is a month the shop spent more than it took,
 * and that is the last number anybody should have to read twice.
 */
function signed(value: string): string {
  return value.startsWith("-")
    ? `−${formatMoney(absDecimal(value))}`
    : formatMoney(value);
}
