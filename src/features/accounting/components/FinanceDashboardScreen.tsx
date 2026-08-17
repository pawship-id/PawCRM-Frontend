"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Building2,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Alert, Button, Card, Spinner } from "@/components";
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
import {
  cashPosition,
  currentMonthRange,
  financeTransactions,
  formatPercent,
  lineFigures,
  lineLabel,
  marginPct,
  previousMonthRange,
  type FinanceQuery,
  type FinanceTransaction,
  type LineFigures,
} from "../financeSummary";
import {
  RECENT_LIMIT,
  useFinanceDashboard,
} from "../hooks/useFinanceDashboard";
import { formatDate } from "../labels";
import {
  FinanceDashboardToolbar,
  SHARED_LINE_NONE,
} from "./FinanceDashboardToolbar";

/**
 * The Keuangan landing screen: where the money went this period, and the last
 * ten transactions that moved it.
 *
 * READS THE LEDGER THROUGH THREE ENDPOINTS, and the split is deliberate.
 * `/journal-entries/summary` folds the period, `/balances` gives the cash
 * position as of its end, and the list supplies exactly ten rows. Every figure
 * here used to be summed in the browser over a paged ledger; the aggregates
 * exist so it is not. See PawCRM-Backend/docs/finance-dashboard-gaps.md.
 *
 * THE THREE REPORTS ARE NOT HERE. Laba rugi per lini, arus kas and the full
 * transaction list each get their own screen; this page carries the summary and
 * hands off. The ten rows below the cards exist so the numbers above them are
 * explicable at a glance, not so anybody reads a ledger here.
 *
 * WHAT THE PERIOD DOES NOT TOUCH: the cash card is a POSITION as of the end of
 * the range, so it ignores the start; and picking a business line narrows the
 * P&L only, because a rupiah in the bank belongs to the shop rather than to
 * grooming or retail. Both are stated on the cards themselves.
 *
 * IT OPENS ON "SEMUA", like every other date filter in the product. A dashboard
 * that opened on this month answered a question nobody had asked yet — on a
 * tenant whose ledger starts in June, an August default shows an empty screen
 * that reads as "no data" rather than as "no data *this month*". The filter is
 * the same `FilterDateRange` the purchasing and inventory screens use, with the
 * same preset chips and the same Reset; only the two month presets are extra,
 * because a P&L is read a month at a time.
 *
 * `now` COMES FROM THE SERVER, and still does with no default period to compute:
 * the presets are dates too, and a client component that read the clock while
 * rendering would disagree with the HTML the server sent.
 */
export function FinanceDashboardScreen({ now }: { now: string }) {
  const { can } = usePermissions();
  const today = useMemo(() => new Date(now), [now]);

  const [query, setQuery] = useState<FinanceQuery>(() => ({
    dateFrom: "",
    dateTo: "",
    branchId: "",
    businessLineId: "",
  }));

  // The four the shared control offers everywhere else, then the two months this
  // screen is actually read by. Same order, so somebody who learned the picker
  // on Penerimaan Barang finds the same chips in the same places here.
  const presets = useMemo(() => {
    const todayIso = isoDate(today);
    const back = (days: number) => {
      const start = new Date(today);
      start.setDate(start.getDate() - (days - 1));
      return isoDate(start);
    };

    return [
      { label: "Hari ini", from: todayIso, to: todayIso },
      { label: "7 hari", from: back(7), to: todayIso },
      { label: "30 hari", from: back(30), to: todayIso },
      { label: "Bulan ini", ...toPreset(currentMonthRange(today)) },
      { label: "Bulan lalu", ...toPreset(previousMonthRange(today)) },
    ];
  }, [today]);

  // The shared bucket is a client-side token; the API expresses "no business
  // line" by filtering on the lines, which it cannot do through an id. Sending
  // it would be a 400, so it is dropped and the split below is read instead.
  const apiQuery = useMemo<FinanceQuery>(
    () => ({
      ...query,
      businessLineId:
        query.businessLineId === SHARED_LINE_NONE ? "" : query.businessLineId,
    }),
    [query],
  );

  // The gate is passed to the hook rather than wrapping the call: a hook cannot
  // be called conditionally, and calling it anyway would fire three requests a
  // user without the grant is guaranteed to be refused.
  const readsLedger = can("journalEntries", "read");
  const data = useFinanceDashboard(apiQuery, { enabled: readsLedger });

  const figures = useMemo(
    () =>
      data.summary ? lineFigures(data.summary, data.businessLineNames) : [],
    [data.summary, data.businessLineNames],
  );

  const rows = useMemo(
    () => financeTransactions(data.entries, data.accountsById),
    [data.entries, data.accountsById],
  );

  const patch = (next: Partial<FinanceQuery>) =>
    setQuery((prev) => ({ ...prev, ...next }));

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

      {!readsLedger ? (
        <Card>
          <p className="text-sm text-muted">
            Kamu belum punya akses ke jurnal umum, jadi ringkasan keuangan tidak
            bisa ditampilkan. Minta admin menambahkan izin baca jurnal umum.
          </p>
        </Card>
      ) : (
        <>
          <FinanceDashboardToolbar
            query={query}
            branches={data.branches}
            businessLines={data.businessLines}
            presets={presets}
            disabled={data.loading}
            onChange={patch}
          />

          {data.error ? (
            <Alert variant="error">
              <p className="font-semibold">Ringkasan keuangan gagal dimuat.</p>
              <p className="mt-0.5">{data.error}</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={data.refetch}
              >
                <RefreshCw className="size-4" aria-hidden />
                Muat ulang
              </Button>
            </Alert>
          ) : (
            <>
              <SummaryCards
                summary={data.summary}
                cash={cashPosition(data.cashAccounts)}
                periodTo={query.dateTo}
                loading={data.loading}
              />

              <MarginInsights lines={figures} />

              <RecentTransactions
                rows={rows}
                names={data.businessLineNames}
                total={data.entryCount}
                loading={data.loading}
                periodFrom={query.dateFrom}
                periodTo={query.dateTo}
              />
            </>
          )}
        </>
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
function money(value: string | null | undefined): string {
  if (!value) return formatMoney("0");
  return value.startsWith("-")
    ? `−${formatMoney(absDecimal(value))}`
    : formatMoney(value);
}

function SummaryCards({
  summary,
  cash,
  periodTo,
  loading,
}: {
  summary: ReturnType<typeof useFinanceDashboard>["summary"];
  cash: string;
  periodTo: string;
  loading: boolean;
}) {
  const netProfit = summary?.netProfit ?? "0";
  const loss = netProfit.startsWith("-");
  const netMargin = summary ? marginPct(summary.netProfit, summary.revenue) : null;

  /**
   * NO REVENUE MEANS NO PROFIT TO CLAIM.
   *
   * `marginPct` returns null exactly when revenue is zero, which is the same
   * condition — so the card stays neutral instead of going green, and says why.
   * Arithmetically `0 − (−1.105.100)` really is a positive number; calling it
   * profit is what would be a lie. It happens whenever an inventory gain credits
   * 5201 in a period with no sales, which on a tenant still being set up is
   * every period.
   */
  const noRevenue = summary !== null && netMargin === null;

  /**
   * A negative total expense is legitimate — a stock surplus credits 5201
   * Kerugian Persediaan, and a supplier credit note does the same — but it is
   * rare enough that seeing it without explanation reads as a bug. The note is
   * the diagnostic somebody would otherwise have to ask for.
   */
  const expenseCredited = Boolean(summary?.expense.startsWith("-"));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={TrendingUp}
        label="Total Revenue"
        value={money(summary?.revenue)}
        hint="Belum termasuk PPN keluaran"
        loading={loading}
      />
      <SummaryCard
        icon={TrendingDown}
        label="Total Expense"
        value={money(summary?.expense)}
        hint={
          expenseCredited
            ? "Beban negatif — ada akun beban yang dikredit, misalnya selisih lebih stok"
            : "HPP ditambah beban operasional"
        }
        hintClassName={expenseCredited ? "text-warning" : undefined}
        loading={loading}
      />
      <SummaryCard
        icon={Scale}
        label="Net Profit"
        value={money(netProfit)}
        valueClassName={
          noRevenue ? undefined : loss ? "text-danger" : "text-success"
        }
        hint={
          noRevenue
            ? "Belum ada pendapatan di periode ini"
            : `Margin bersih ${formatPercent(netMargin)}`
        }
        hintClassName={noRevenue ? "text-warning" : undefined}
        loading={loading}
      />
      <SummaryCard
        icon={Banknote}
        label="Saldo Kas & Bank"
        value={money(cash)}
        hint={
          periodTo
            ? `Posisi kas & bank per ${formatDate(periodTo)}`
            : "Posisi kas & bank saat ini"
        }
        loading={loading}
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
  hintClassName,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
  /** For a hint that is a caveat rather than a caption. */
  hintClassName?: string;
  loading: boolean;
}) {
  return (
    <Card className="gap-0 py-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" aria-hidden />
        <span className="text-xs font-semibold tracking-wide uppercase">
          {label}
        </span>
      </div>
      {/*
        The figure is dimmed rather than replaced while a new period loads. A
        skeleton here would blank the one thing somebody is looking at every time
        they nudge a filter; the previous number, visibly stale, is more useful
        than an empty box for the third of a second it takes.
      */}
      <p
        className={cn(
          "mt-2 text-2xl font-extrabold tabular-nums text-foreground transition-opacity",
          valueClassName,
          loading && "opacity-50",
        )}
        aria-busy={loading}
      >
        {value}
      </p>
      <p
        className={cn(
          "mt-1.5 text-xs tabular-nums text-muted",
          hintClassName,
        )}
      >
        {hint}
      </p>
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
 * The unattributed bucket gets a different sentence on purpose. It has costs and
 * no revenue, so a "margin" for it would be meaningless; what matters about it
 * is that those rupiah have not been charged to a line yet, which is the caveat
 * on every other chip in the row.
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
  // with no revenue — a month where grooming only bought shampoo — and giving it
  // the shared bucket's sentence would say its costs are unallocated when they
  // are allocated to it precisely.
  const shared = lines.find((line) => line.businessLineId === null);
  const named = lines.filter((line) => line.businessLineId !== null);

  if (!named.length && !shared) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {named.map((line) =>
        line.netMarginPct === null ? (
          <span
            key={line.businessLineId}
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
            key={line.businessLineId}
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
  names,
  total,
  loading,
  periodFrom,
  periodTo,
}: {
  rows: FinanceTransaction[];
  names: Map<string, string>;
  total: number;
  loading: boolean;
  periodFrom: string;
  periodTo: string;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-bold">Transaksi terakhir</h2>
        <p className="text-xs text-muted">
          {rows.length} dari {total} entri
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

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center gap-3 px-5 py-16 text-sm text-muted">
          <Spinner size={16} />
          Memuat transaksi…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-16 text-center">
          {/*
            The period is optional now, so the sentence cannot assume one. With
            the filter on "Semua" there is nothing to widen, and telling somebody
            to widen a range they never set is how a filter gets blamed for an
            empty ledger.
          */}
          <p className="font-semibold text-foreground">
            {periodFrom || periodTo
              ? "Belum ada transaksi di periode ini."
              : "Belum ada transaksi di jurnal umum."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {periodFrom || periodTo
              ? "Coba lebarkan periodenya, atau lepas filter cabang dan lini bisnis."
              : "Coba lepas filter cabang dan lini bisnis."}
          </p>
        </div>
      ) : (
        <div className={cn("overflow-x-auto", loading && "opacity-50")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead>Kategori akun</TableHead>
                <TableHead>Lini bisnis</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TransactionRow key={row.entry._id} row={row} names={names} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
        Hanya {RECENT_LIMIT} transaksi terakhir yang memengaruhi laba rugi.
        Penerimaan barang dan pembayaran utang tidak muncul di sini — semuanya
        ada di Jurnal Umum.
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

function TransactionRow({
  row,
  names,
}: {
  row: FinanceTransaction;
  names: Map<string, string>;
}) {
  const { label, raisesProfit } = transactionTone(row);
  const { entry } = row;
  const [account, ...rest] = row.accounts;

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums text-muted">
        {formatDate(entry.date)}
      </TableCell>

      <TableCell className="max-w-xs">
        <Link
          href={`${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`}
          className="block truncate font-medium text-foreground transition hover:text-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {entry.description}
        </Link>
        <span className="tabular-nums text-xs text-muted">
          {entry.source.reference ?? entry.entryNumber}
          {entry.branchName ? ` · ${entry.branchName}` : ""}
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
          {row.businessLineIds.map((id) => (
            <span
              key={id ?? "shared"}
              className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted"
            >
              {lineLabel(id, names)}
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
        </Link>
      ))}
    </div>
  );
}

/** `{ dateFrom, dateTo }` as `FilterDateRange` names its two ends. */
function toPreset(period: { dateFrom: string; dateTo: string }) {
  return { from: period.dateFrom, to: period.dateTo };
}

/**
 * A `Date` as the calendar date it is *here*.
 *
 * Local parts rather than `toISOString()`: the latter is UTC and shifts the day
 * back for everyone east of Greenwich, which is everyone using this — "Hari ini"
 * would mean yesterday for the first seven hours of a Jakarta morning.
 */
function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
