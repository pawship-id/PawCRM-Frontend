"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  HandCoins,
  Plus,
  Receipt,
  RefreshCw,
  Repeat,
  Scale,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Alert, Button, Card } from "@/components";
import { Badge } from "@/components/ui/badge";
// `asChild` lives on the vendored button, not the project one — the same import
// CashTransactionsScreen makes for the same "a link that looks like the primary
// action" job.
import { Button as SlotButton } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import { PURCHASING_CRUMBS } from "@/features/purchasing";
import { cn } from "@/lib/utils";
import { reportService } from "@/services/report.service";
import { absDecimal, formatMoney, subtractDecimals } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { AccountingModuleHeader } from "./AccountingModuleHeader";
import {
  cashPosition,
  formatPercent,
  lineFigures,
  marginPct,
  reportPresets,
  SHARED_LINE_NONE,
  type FinanceQuery,
  type LineFigures,
} from "../financeSummary";
import { useFinanceDashboard } from "../hooks/useFinanceDashboard";
import { formatDate } from "../labels";
import { FinanceReportToolbar } from "./FinanceReportToolbar";
import { FinanceTrendChart } from "./FinanceTrendChart";

/**
 * The Keuangan landing screen — the mockup's Ringkasan tab.
 *
 * WHAT IT IS FOR: money that MOVED and money that needs doing something about.
 * Shape and comparison belong to Laporan; this tab answers "where do we stand
 * this period, and what is outstanding". It says none of that on screen — the
 * standing blurb under the tabs was removed on request, so the cards are left to
 * introduce themselves.
 *
 * EIGHT FIGURES IN TWO ROWS, AND THE ROWS ARE NOT INTERCHANGEABLE. The first is
 * cash — a position and the two directions that moved it. The second is what the
 * books say: profit, the net of those two directions, and the two ledgers of
 * things not yet settled. A reader scanning the first row learns what is in the
 * till; scanning the second, whether the shop is actually making money and who
 * still owes whom.
 *
 * NOT ONE OF THEM IS SUMMED HERE. Every figure is an aggregate its own module
 * computed over its whole book — see `useFinanceDashboard`. The two derivations
 * left are display arithmetic: a margin percentage and masuk − keluar.
 *
 * WHAT THE FILTERS DO NOT TOUCH, each stated on the card that it applies to:
 * the cash and commission balances are POSITIONS as of the end of the range, so
 * they ignore its start; piutang and utang are positions as of now and ignore the
 * period entirely; the chart is always the last seven days; and a business line
 * narrows the P&L only, because a rupiah in the bank belongs to the shop rather
 * than to grooming or retail.
 *
 * NO TRANSACTION TABLE. It lived here while Keuangan had nowhere else to put a
 * list of movements; the Transaksi tab is that place now, and a landing page that
 * repeated its first ten rows would be a second, staler answer to a question one
 * tab along.
 *
 * IT OPENS ON "SEMUA", like every other date filter in the product. A dashboard
 * that opened on this month answered a question nobody had asked yet — on a
 * tenant whose ledger starts in June, an August default shows an empty screen
 * that reads as "no data" rather than as "no data *this month*".
 *
 * `now` COMES FROM THE SERVER. The presets are dates, and so is the chart's
 * seven-day window; a client component that read the clock while rendering would
 * disagree with the HTML the server sent.
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

  // Shared with Laba Rugi and Arus Kas — see reportPresets. Three report screens
  // offering three slightly different sets of chips is how one control becomes
  // three to learn.
  const presets = useMemo(() => reportPresets(today), [today]);

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

  /*
    ONE GRANT PER READ. They do not travel together — a bookkeeper may hold the
    ledger and not the purchase book — and each is passed to the hook rather than
    wrapping its call, because a hook cannot be called conditionally and would
    otherwise fire requests the user is guaranteed to be refused.
  */
  const readsLedger = can("journalEntries", "read");
  const data = useFinanceDashboard(apiQuery, {
    now: today,
    ledger: readsLedger,
    cashMovement: can("cashTransactions", "read"),
    receivables: can("customerInvoices", "read"),
    payables: can("purchaseInvoices", "read"),
  });

  const figures = useMemo(
    () =>
      data.summary ? lineFigures(data.summary, data.businessLineNames) : [],
    [data.summary, data.businessLineNames],
  );

  const patch = (next: Partial<FinanceQuery>) =>
    setQuery((prev) => ({ ...prev, ...next }));

  return (
    <div className="flex flex-col gap-6">
      <AccountingModuleHeader
        action={
          can("cashTransactions", "create") ? (
            <SlotButton asChild>
              <Link href={`${ACCOUNTING_CRUMBS.cashBank.href}/transaksi/new`}>
                <Plus className="size-4" aria-hidden />
                Tambah transaksi
              </Link>
            </SlotButton>
          ) : undefined
        }
      />

      {!readsLedger ? (
        <Card>
          <p className="text-sm text-muted">
            Kamu belum punya akses ke jurnal umum, jadi ringkasan keuangan tidak
            bisa ditampilkan. Minta admin menambahkan izin baca jurnal umum.
          </p>
        </Card>
      ) : (
        <>
          <FinanceReportToolbar
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
              <CashRow
                data={data}
                periodTo={query.dateTo}
                branchId={apiQuery.branchId}
              />
              <BooksRow data={data} />
              <MarginInsights lines={figures} />

              <Card title="Tren 7 hari — kotor vs bersih">
                <FinanceTrendChart
                  days={data.trend}
                  loading={data.trendLoading}
                  error={data.trendError}
                  onRetry={data.refetch}
                />
                {/*
                  The one thing the chart cannot say about itself: that it is NOT
                  the period above it. A reader who set "Bulan lalu" and read
                  this week's line off the card would be reading the wrong week.
                */}
                <p className="mt-3 text-xs text-muted">
                  Selalu tujuh hari terakhir sampai{" "}
                  {formatDate(data.trendPeriod.dateTo)} — tidak ikut filter
                  periode, tapi ikut filter cabang dan lini bisnis.
                </p>
              </Card>

              <RecurringNote />
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

type DashboardData = ReturnType<typeof useFinanceDashboard>;

/**
 * Row one — the cash the shop is holding, and the two directions that moved it.
 *
 * SALDO IS A POSITION AND THE OTHER TWO ARE MOVEMENTS, which is why they are
 * captioned differently and not merely formatted the same. Read as one row they
 * are a sentence: this is what is in the till, this came in, this went out.
 */
function CashRow({
  data,
  periodTo,
  branchId,
}: {
  data: DashboardData;
  periodTo: string;
  branchId: string;
}) {
  const { can } = usePermissions();
  const movement = data.cashMovement;
  const readsPayroll = can("users", "read");
  const commission = useCommissionOwed(branchId, readsPayroll);
  const owesCommission =
    commission.amount !== null &&
    !commission.amount.startsWith("-") &&
    !/^0(\.0+)?$/.test(commission.amount);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={Wallet}
        label="Saldo kas & bank"
        value={money(cashPosition(data.cashAccounts))}
        hint={
          periodTo
            ? `Posisi per ${formatDate(periodTo)}`
            : "Posisi kas & bank saat ini"
        }
        loading={data.loading}
      />

      {/*
        LEFT OUT RATHER THAN DASHED for a role that cannot read transactions.
        A dash means "this failed to load"; an absent card means "not yours to
        see", and the two must not look the same.
      */}
      {can("cashTransactions", "read") && (
        <>
          <SummaryCard
            icon={ArrowDownLeft}
            label="Uang masuk"
            value={movement ? money(movement.in.amount) : null}
            hint={
              movement
                ? `${movement.in.count} transaksi di periode ini`
                : "Periode ini"
            }
            loading={data.loading}
          />
          <SummaryCard
            icon={ArrowUpRight}
            label="Uang keluar"
            value={movement ? money(movement.out.amount) : null}
            hint={
              movement
                ? `${movement.out.count} transaksi di periode ini`
                : "Periode ini"
            }
            loading={data.loading}
          />
        </>
      )}

      {/*
        FROM THE KOMISI LIST, NOT FROM 2102 (21 September 2026). Commission is
        no longer accrued, so the ledger's payable only ever holds what a monthly
        close took to it before then; what is owed now is the list's Pending —
        everything not yet paid, approved or not — the same figure the Komisi
        tab's third card shows. A POSITION, like Saldo: it ignores the period.

        LEFT OUT for a reader without `users:read`, like the tab itself — it is
        payroll.
      */}
      {readsPayroll && (
        <SummaryCard
          icon={HandCoins}
          label="Komisi belum dibayar"
          value={commission.amount !== null ? money(commission.amount) : null}
          valueClassName={owesCommission ? "text-warning" : undefined}
          hint="Menunggu persetujuan & disetujui — kelola di tab Komisi"
          loading={commission.loading}
        />
      )}
    </div>
  );
}

/**
 * What the shop still owes its groomers — the Komisi list's Pending card, for
 * one branch or all of them. One row asked for; only the cards are read.
 */
function useCommissionOwed(branchId: string, enabled: boolean) {
  const [amount, setAmount] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    reportService
      .commissionRecords({ branchId: branchId || undefined, limit: 1 })
      .then((result) => {
        if (active) setAmount(result.cards.pending);
      })
      .catch(() => {
        if (active) setAmount(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branchId, enabled]);

  return { amount, loading };
}

/**
 * Row two — what the books say: profit, net cash, and the two unsettled ledgers.
 */
function BooksRow({ data }: { data: DashboardData }) {
  const { can } = usePermissions();
  const { summary, cashMovement: movement, receivables, payables } = data;

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

  // Masuk − keluar, in minor units. The only arithmetic on this screen that is
  // not a percentage, and it is exact: two aggregates the server computed,
  // subtracted in BigInt rather than added up from any list of rows.
  const netCash = movement
    ? subtractDecimals(movement.in.amount, movement.out.amount)
    : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={Scale}
        label="Laba bersih periode"
        value={money(netProfit)}
        valueClassName={
          noRevenue ? undefined : loss ? "text-danger" : "text-success"
        }
        hint={
          noRevenue
            ? "Belum ada pendapatan di periode ini"
            : `Pendapatan ${money(summary?.revenue)} · margin ${formatPercent(netMargin)}`
        }
        hintClassName={noRevenue ? "text-warning" : undefined}
        loading={data.loading}
      />

      {can("cashTransactions", "read") && (
        <SummaryCard
          icon={Banknote}
          label="Arus kas bersih"
          value={netCash === null ? null : money(netCash)}
          valueClassName={netCash?.startsWith("-") ? "text-danger" : undefined}
          hint="Uang masuk dikurangi uang keluar"
          loading={data.loading}
        />
      )}

      {can("customerInvoices", "read") && (
        <SummaryCard
          icon={Receipt}
          label="Piutang belum tertagih"
          value={receivables ? money(receivables.totalOutstanding) : null}
          /*
            A POSITION, NOT A PERIOD FIGURE, and it says so by naming invoices
            rather than a range. An invoice raised in July and still unpaid is
            money missing today; a piutang that emptied itself when somebody
            picked "bulan ini" would say the opposite.
          */
          valueClassName={
            receivables && Number(receivables.totalOverdueInvoices) > 0
              ? "text-warning"
              : undefined
          }
          hint={
            receivables
              ? `${receivables.totalInvoices} faktur · ${receivables.totalOverdueInvoices} lewat jatuh tempo`
              : "Seluruh faktur yang belum lunas"
          }
          loading={data.loading}
          /*
            THE FAKTUR LIST, NOT `/sales/piutang`. Piutang is a LENS on that
            list — its "Belum lunas" card drills to every unpaid invoice — and
            the tab of that name is still a placeholder. A card that opened an
            empty screen would be worse than one that did not link at all.
          */
          href={
            receivables && receivables.totalInvoices > 0
              ? "/dashboard/sales"
              : undefined
          }
        />
      )}

      {can("purchaseInvoices", "read") && (
        <SummaryCard
          icon={Building2}
          label="Utang belum dibayar"
          value={payables ? money(payables.totalOutstanding) : null}
          valueClassName={
            payables && Number(payables.totalOverdueInvoices) > 0
              ? "text-warning"
              : undefined
          }
          hint={
            payables
              ? `${payables.totalInvoices} tagihan · ${payables.totalOverdueInvoices} lewat jatuh tempo`
              : "Seluruh tagihan supplier yang belum lunas"
          }
          loading={data.loading}
          href={
            payables && payables.totalInvoices > 0
              ? PURCHASING_CRUMBS.payables.href
              : undefined
          }
        />
      )}
    </div>
  );
}

/**
 * One figure, with the three states a summary tile owes a reader.
 *
 * A NULL VALUE IS A DASH, NEVER A ZERO. A card whose request failed and a card
 * whose answer is genuinely nothing must not look alike: a zero standing in for
 * an error is the most dangerous thing a summary can show, because nobody goes
 * and looks. Same contract as `components/StatTile`; the layout differs because
 * these carry an icon and a caveat line.
 */
function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  valueClassName,
  hintClassName,
  loading,
  href,
}: {
  icon: LucideIcon;
  label: string;
  /** `null` when the read failed — rendered as a dash and captioned as one. */
  value: string | null;
  hint: string;
  valueClassName?: string;
  /** For a hint that is a caveat rather than a caption. */
  hintClassName?: string;
  loading: boolean;
  /** Where the number is acted on, when it is a number somebody acts on. */
  href?: string;
}) {
  const failed = value === null;

  const body = (
    <>
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
          !failed && valueClassName,
          loading && "opacity-50",
        )}
        aria-busy={loading}
      >
        {failed ? "—" : value}
      </p>
      <p
        className={cn(
          "mt-1.5 text-xs tabular-nums text-muted",
          failed ? "text-warning" : hintClassName,
        )}
      >
        {failed ? "Gagal dimuat" : hint}
      </p>
    </>
  );

  if (href && !failed) {
    return (
      <Link
        href={href}
        /*
          THE SAME BOX AS `Card`, spelled out — `rounded-xl border`, `px-6 py-5`
          and `shadow-sm` are what the vendored card resolves to under the
          `gap-0 py-5` below. A linked card sitting a shadow off its neighbours
          in the same row would read as a different kind of thing.
        */
        className="rounded-xl border border-border bg-surface px-6 py-5 shadow-sm transition hover:border-primary hover:shadow-md focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {body}
      </Link>
    );
  }

  return <Card className="gap-0 py-5">{body}</Card>;
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

/* --------------------------------------------------------------- recurring */

/**
 * Biaya tetap — the mockup's callout, with no figures in it and a badge saying
 * why.
 *
 * BADGED RATHER THAN BLANK, AND CERTAINLY NOT FILLED IN. The mockup counts the
 * active recurring costs and names the next one due. The model carries a
 * `recurring` subdocument and nothing executes it — there is no scheduler and no
 * endpoint that lists them — so every number in that callout would be invented,
 * and an invented figure on a finance screen is indistinguishable from a real
 * one. The same treatment `PendingStatTile` gives a tile the database cannot
 * answer yet.
 *
 * NEUTRAL, NOT ORANGE, although the mockup's callout is warm. Orange in this
 * product means a human must act (§4), and "this is coming later" is the one
 * thing on the page nobody can act on — spending the accent on it would leave
 * two oranges competing with the chart's net-profit line.
 */
function RecurringNote() {
  return (
    <div className="rounded-xl border border-border bg-tint-neutral px-5 py-4">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
        <Repeat className="size-4 text-muted" aria-hidden />
        Biaya tetap
        <Badge variant="outline">Segera</Badge>
      </p>
      <p className="mt-1.5 text-sm text-muted">
        Gaji, sewa, dan langganan yang berulang tiap bulan akan tercatat sendiri
        dan muncul di sini beserta jatuh temponya. Sampai penjadwalnya ada,
        catat biayanya lewat Tambah transaksi seperti biasa.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- links */

/**
 * The way into every finance screen that is NOT a tab.
 *
 * IT USED TO BE A COURTESY AND IS NOW THE ROUTE. The rail carried a row for each
 * of these until Keuangan took the mockup's tabs; Laba Rugi, Arus Kas and Lini
 * Bisnis are not among them, and the two homes the mockup gives them —
 * `Pengaturan › Keuangan` and `Laporan` — do not exist yet. So this list is
 * where they live in the meantime, and deleting a card from it now strands a
 * working screen.
 *
 * Daftar Akun and Jurnal Umum stay although both ARE tabs: a landing page that
 * describes the ledger and then does not offer it reads as an omission, and the
 * card says something the tab label cannot.
 *
 * Each card is gated on the grant its own destination enforces — a role that may
 * not read the ledger is not offered three ways into it.
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
  {
    href: ACCOUNTING_CRUMBS.profitLoss.href,
    title: "Laba Rugi",
    description:
      "Pendapatan dikurangi beban untuk satu periode, dipecah per lini bisnis.",
    feature: "journalEntries",
  },
  {
    href: ACCOUNTING_CRUMBS.balanceSheet.href,
    title: "Neraca",
    description:
      "Posisi pada satu tanggal: yang dimiliki, yang masih jadi kewajiban, dan sisanya milik pemilik.",
    feature: "journalEntries",
  },
  {
    href: ACCOUNTING_CRUMBS.cashflow.href,
    title: "Arus Kas",
    description:
      "Uang yang benar-benar masuk dan keluar — beda dari laba, dan ini yang menentukan bisa bayar apa tidak.",
    feature: "journalEntries",
  },
  {
    href: ACCOUNTING_CRUMBS.businessLines.href,
    title: "Lini Bisnis",
    description:
      "Definisi lini dan cara biaya bersama dibagi ke masing-masing — sumbu yang dipakai laporan laba rugi.",
    feature: "businessLines",
  },
] as const;

function ModuleLinks() {
  const { can } = usePermissions();
  const visible = MODULES.filter((item) => can(item.feature, "read"));

  if (!visible.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
