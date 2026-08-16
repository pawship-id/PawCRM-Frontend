"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Building2,
  Scale,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { absDecimal, formatMoney } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { ACCOUNTS_BY_ID, DUMMY_ACCOUNTS, DUMMY_ENTRIES } from "../data/dummy";
import {
  branchesIn,
  businessLinesIn,
  defaultPeriod,
  financeTransactions,
  formatPercent,
  fullPeriod,
  ledgerMonths,
  lineLabel,
  SHARED_LINE,
  summarise,
  type FinanceQuery,
  type FinanceTransaction,
  type LineFigures,
} from "../financeSummary";
import { formatDate } from "../labels";
import { DummyNotice } from "./DummyNotice";
import {
  FinanceDashboardToolbar,
  periodPresets,
} from "./FinanceDashboardToolbar";

/**
 * The Keuangan landing screen: where the money went this period, and the last
 * ten transactions that moved it.
 *
 * IT REPLACED A HUB whose two cards duplicated the sidebar. What earns the space
 * instead is the thing a shop owner opens the module for — pendapatan, beban,
 * laba, kas — and those four figures are DERIVED FROM THE LEDGER, never stored
 * (see ../financeSummary). The module links survive at the bottom, because a
 * sidebar is not the only way people navigate.
 *
 * THE THREE REPORTS ARE NOT HERE. Laba rugi per lini, arus kas and the full
 * transaction list each get their own screen; this page carries the summary and
 * hands off. The ten rows below the cards exist so the numbers above them are
 * explicable at a glance, not so anybody reads a ledger here.
 *
 * WHAT THE PERIOD DOES NOT TOUCH: `cashBalance` is a position as of the end of
 * the range, so it ignores the start; and the business-line filter narrows the
 * P&L only, because a rupiah in the bank belongs to the shop rather than to
 * grooming or retail. Both are stated on the cards themselves.
 */
const RECENT_LIMIT = 10;

export function FinanceDashboardScreen() {
  const { can } = usePermissions();

  const [query, setQuery] = useState<FinanceQuery>(() => ({
    ...defaultPeriod(DUMMY_ENTRIES),
    branchName: "",
    businessLines: [],
  }));

  const branches = useMemo(() => branchesIn(DUMMY_ENTRIES), []);
  const businessLines = useMemo(() => businessLinesIn(DUMMY_ENTRIES), []);
  const presets = useMemo(
    () => periodPresets(ledgerMonths(DUMMY_ENTRIES), fullPeriod(DUMMY_ENTRIES)),
    [],
  );

  const summary = useMemo(
    () => summarise(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query),
    [query],
  );
  const recent = useMemo(
    () => financeTransactions(DUMMY_ENTRIES, ACCOUNTS_BY_ID, query, RECENT_LIMIT),
    [query],
  );

  const patch = (next: Partial<FinanceQuery>) =>
    setQuery((prev) => ({ ...prev, ...next }));

  const readsLedger = can("journalEntries", "read");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Keuangan</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Ringkasan pendapatan, beban, laba, dan posisi kas — dihitung langsung
          dari jurnal umum. Laporan laba rugi per lini, arus kas, dan daftar
          transaksi lengkap ada di halamannya masing-masing.
        </p>
      </div>

      <DummyNotice endpoint="GET /api/journal-entries" />

      {readsLedger ? (
        <>
          <FinanceDashboardToolbar
            query={query}
            branches={branches}
            businessLines={businessLines}
            presets={presets}
            onChange={patch}
          />

          <SummaryCards
            revenue={summary.revenue}
            expense={summary.expense}
            netProfit={summary.netProfit}
            netMarginPct={summary.netMarginPct}
            cashBalance={summary.cashBalance}
            cashIn={summary.cashIn}
            cashOut={summary.cashOut}
            periodTo={query.to}
          />

          <MarginInsights lines={summary.perLine} />

          <RecentTransactions
            rows={recent}
            entryCount={summary.entryCount}
            periodFrom={query.from}
            periodTo={query.to}
          />
        </>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            Kamu belum punya akses ke jurnal umum, jadi ringkasan keuangan tidak
            bisa ditampilkan. Minta admin menambahkan izin baca jurnal umum.
          </p>
        </Card>
      )}

      <ModuleLinks />
    </div>
  );
}

/* ------------------------------------------------------------------- cards */

/**
 * Money as this screen prints it.
 *
 * `formatMoney` renders a negative as "Rp -1.200.000"; a hyphen glued to the
 * digits after the currency reads as a typo at a glance. A true minus sign
 * leading the whole amount is what a ledger prints, and the one place it shows
 * up is a loss — which is exactly the number nobody may misread.
 */
function money(value: string): string {
  return value.startsWith("-")
    ? `−${formatMoney(absDecimal(value))}`
    : formatMoney(value);
}

function SummaryCards({
  revenue,
  expense,
  netProfit,
  netMarginPct,
  cashBalance,
  cashIn,
  cashOut,
  periodTo,
}: {
  revenue: string;
  expense: string;
  netProfit: string;
  netMarginPct: number | null;
  cashBalance: string;
  cashIn: string;
  cashOut: string;
  periodTo: string;
}) {
  const loss = netProfit.startsWith("-");

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={TrendingUp}
        label="Total Revenue"
        value={money(revenue)}
        hint="Belum termasuk PPN keluaran"
      />
      <SummaryCard
        icon={TrendingDown}
        label="Total Expense"
        value={money(expense)}
        hint="HPP ditambah beban operasional"
      />
      <SummaryCard
        icon={Scale}
        label="Net Profit"
        value={money(netProfit)}
        valueClassName={loss ? "text-danger" : "text-success"}
        hint={`Margin bersih ${formatPercent(netMarginPct)}`}
      />
      <SummaryCard
        icon={Banknote}
        label="Saldo Kas & Bank"
        value={money(cashBalance)}
        hint={
          periodTo
            ? `Posisi per ${formatDate(periodTo)} · masuk ${money(cashIn)}, keluar ${money(cashOut)}`
            : `Masuk ${money(cashIn)}, keluar ${money(cashOut)}`
        }
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
}) {
  return (
    <Card className="gap-0 py-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" aria-hidden />
        <span className="text-xs font-semibold tracking-wide uppercase">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-extrabold tabular-nums text-foreground",
          valueClassName,
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs tabular-nums text-muted">{hint}</p>
    </Card>
  );
}

/* ---------------------------------------------------------------- insights */

/**
 * One chip per business line, saying how its margin is doing.
 *
 * THE WORD CARRIES THE STATUS, not the tint (§1.3, §9) — "Sehat" and "Tipis"
 * are readable with the colour switched off, and the percentage is there for
 * anyone who wants the number rather than the verdict.
 *
 * The shared bucket gets a different sentence on purpose. It has costs and no
 * revenue, so a "margin" for it would be −∞ and meaningless; what matters about
 * it is that those rupiah have not been charged to a line yet, which is the
 * caveat on every other chip in the row.
 */
const MARGIN_BANDS = [
  { min: 25, word: "Sehat", tone: "bg-tint-success text-success" },
  { min: 10, word: "Stabil", tone: "bg-tint-info text-info" },
  { min: 0, word: "Tipis", tone: "bg-tint-warning text-warning" },
] as const;

function marginBand(pct: number) {
  return (
    MARGIN_BANDS.find((band) => pct >= band.min) ?? {
      word: "Rugi",
      tone: "bg-tint-danger text-danger",
    }
  );
}

function MarginInsights({ lines }: { lines: LineFigures[] }) {
  // Keyed on the line, NOT on "has no margin". A named line can also come out
  // with no revenue — a month where grooming only bought shampoo — and giving
  // it the shared bucket's sentence would say its costs are unallocated when
  // they are allocated to it precisely.
  const shared = lines.find((line) => line.line === SHARED_LINE);
  const named = lines.filter((line) => line.line !== SHARED_LINE);

  if (!named.length && !shared) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {named.map((line) =>
        line.netMarginPct === null ? (
          <span
            key={line.line}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-tint-danger px-3 text-xs text-danger"
          >
            {line.label}
            <b className="font-semibold tabular-nums">
              Beban {money(line.expense)}
            </b>
            tanpa pendapatan
          </span>
        ) : (
          <span
            key={line.line}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs",
              marginBand(line.netMarginPct).tone,
            )}
          >
            Margin {line.label}
            <b className="font-semibold tabular-nums">
              {marginBand(line.netMarginPct).word}{" "}
              {formatPercent(line.netMarginPct)}
            </b>
          </span>
        ),
      )}

      {shared && (
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-tint-neutral px-3 text-xs text-muted">
          Beban bersama
          <b className="font-semibold tabular-nums text-foreground">
            {money(shared.expense)}
          </b>
          belum dibagi ke lini
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ transactions */

function RecentTransactions({
  rows,
  entryCount,
  periodFrom,
  periodTo,
}: {
  rows: FinanceTransaction[];
  entryCount: number;
  periodFrom: string;
  periodTo: string;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-bold">Transaksi terakhir</h2>
        <p className="text-xs text-muted">
          {rows.length} dari {entryCount} entri
          {periodFrom && periodTo
            ? ` · ${formatDate(periodFrom)} – ${formatDate(periodTo)}`
            : ""}
        </p>
        <Link
          href={ACCOUNTING_CRUMBS.journal.href}
          className="ml-auto inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary transition hover:text-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Lihat semua
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="font-semibold text-foreground">
            Belum ada transaksi di periode ini.
          </p>
          <p className="mt-1 text-sm text-muted">
            Coba lebarkan periodenya, atau lepas filter cabang dan lini bisnis.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead>Kategori akun</TableHead>
                <TableHead>Lini bisnis</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Kas/Bank</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TransactionRow key={row.entryId} row={row} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
        Hanya transaksi yang memengaruhi laba rugi. Penerimaan barang dan
        pembayaran utang tidak muncul di sini — semuanya ada di Jurnal Umum.
      </p>
    </section>
  );
}

/**
 * The type badge and the amount's sign, from the two flags the fold returns.
 *
 * "Bertambah" is the direction that helps profit, and it is NOT the same as
 * "income": a credited cost — a reversal, a supplier refund — is an expense row
 * that raises the profit, and printing it as another "−" would make the column
 * stop adding up for anyone checking it against the cards.
 */
function transactionTone(row: FinanceTransaction) {
  const income = row.type === "income";
  const raisesProfit = income !== row.reversal;

  const label = income
    ? row.reversal
      ? "Retur pemasukan"
      : "Pemasukan"
    : row.reversal
      ? "Koreksi beban"
      : "Pengeluaran";

  return { label, raisesProfit };
}

function TransactionRow({ row }: { row: FinanceTransaction }) {
  const { label, raisesProfit } = transactionTone(row);
  const [account, ...rest] = row.accounts;

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums text-muted">
        {formatDate(row.date)}
      </TableCell>

      <TableCell className="max-w-xs">
        <Link
          href={`${ACCOUNTING_CRUMBS.journal.href}/${row.entryId}`}
          className="block truncate font-medium text-foreground transition hover:text-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {row.description}
        </Link>
        <span className="tabular-nums text-xs text-muted">
          {row.entryNumber} · {row.branchName}
        </span>
      </TableCell>

      <TableCell className="max-w-56">
        {account ? (
          <>
            <span className="tabular-nums text-muted">{account.code}</span>{" "}
            <span className="text-foreground">{account.name}</span>
            {rest.length > 0 && (
              <span className="text-muted"> +{rest.length} akun</span>
            )}
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </TableCell>

      <TableCell>
        <span className="flex flex-wrap gap-1">
          {row.lines.map((line) => (
            <span
              key={line || "shared"}
              className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted"
            >
              {lineLabel(line)}
            </span>
          ))}
        </span>
      </TableCell>

      <TableCell>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            raisesProfit
              ? "bg-tint-success text-success"
              : "bg-tint-danger text-danger",
          )}
        >
          {label}
        </span>
      </TableCell>

      <TableCell className="text-muted">
        {row.cashAccounts.length > 0
          ? row.cashAccounts.map((item) => item.name).join(" · ")
          : "Belum tunai"}
      </TableCell>

      <TableCell
        className={cn(
          "text-right font-semibold tabular-nums",
          raisesProfit ? "text-success" : "text-danger",
        )}
      >
        {raisesProfit ? "+" : "−"}
        {money(row.amount)}
      </TableCell>
    </TableRow>
  );
}

/* ------------------------------------------------------------------- links */

/**
 * The way into the two modules that exist.
 *
 * Kept from the hub this screen replaced: the sidebar carries the same two
 * links, but somebody who arrived here from a dashboard tile has no reason to
 * have looked at it, and a landing page that leads nowhere is a dead end.
 */
const MODULES = [
  {
    href: ACCOUNTING_CRUMBS.accounts.href,
    title: "Daftar Akun (COA)",
    description:
      "Fondasi pembukuan: setiap baris jurnal menunjuk salah satu akun di sini.",
    feature: "chartOfAccounts",
  },
  {
    href: ACCOUNTING_CRUMBS.journal.href,
    title: "Jurnal Umum",
    description:
      "Buku besar tenant. Semua modul mencatat ke sini, dan laporan dibaca dari sini.",
    feature: "journalEntries",
  },
] as const;

function ModuleLinks() {
  const { can } = usePermissions();
  const visible = MODULES.filter((item) => can(item.feature, "read"));

  if (!visible.length) return null;

  const counts: Record<string, string> = {
    [ACCOUNTING_CRUMBS.accounts.href]: `${
      DUMMY_ACCOUNTS.filter((account) => account.isActive).length
    } akun aktif`,
    [ACCOUNTING_CRUMBS.journal.href]: `${DUMMY_ENTRIES.length} entri`,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <p className="flex items-center gap-2 font-semibold text-foreground group-hover:text-primary-hover">
            <Building2 className="size-4 text-muted" aria-hidden />
            {item.title}
          </p>
          <p className="mt-1.5 text-sm text-muted">{item.description}</p>
          <p className="mt-3 text-xs tabular-nums text-muted">
            {counts[item.href]}
          </p>
        </Link>
      ))}
    </div>
  );
}
