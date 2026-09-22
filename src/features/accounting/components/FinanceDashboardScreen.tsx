"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Building2,
  ChevronRight,
  Percent,
  Plus,
  Receipt,
  RefreshCw,
  Repeat,
  Scale,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Alert, Button, Card } from "@/components";
// `asChild` lives on the vendored button, not the project one — the same import
// CashTransactionsScreen makes for the same "a link that looks like the primary
// action" job.
import { Button as SlotButton } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FIXED_COSTS_HREF } from "@/features/fixed-costs/labels";
import { usePermissions } from "@/features/permissions";
import { PURCHASING_CRUMBS } from "@/features/purchasing";
import { cn } from "@/lib/utils";
import { absDecimal, formatMoney, subtractDecimals } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { AccountingModuleHeader } from "./AccountingModuleHeader";
import {
  changePct,
  formatPercent,
  largestExpenses,
  lineProfits,
  profitLossHeadline,
  reportPresets,
  SHARED_LINE_NONE,
  type ExpenseShare,
  type FinanceQuery,
  type LineProfit,
  type ProfitLossHeadline,
} from "../financeSummary";
import {
  FIXED_COST_HORIZON_DAYS,
  useFinanceDashboard,
} from "../hooks/useFinanceDashboard";
import { formatDate } from "../labels";
import { FinanceReportToolbar } from "./FinanceReportToolbar";
import { LineRevenueChart } from "./LineRevenueChart";

/**
 * The Keuangan landing screen — the Ringkasan tab, after `buloo-navigation-v3`
 * (22 September 2026).
 *
 * WHAT IT IS FOR: whether the shop is making money, and where. Six figures in
 * two rows, then the lini that earn it, then the laba rugi in five lines and
 * where the costs go. Saldo, uang masuk/keluar and komisi LEFT this tab with the
 * v3 mockup — they are the Kas & Bank and Komisi tabs' own cards, and a landing
 * page repeating them was a second, staler answer one tab along.
 *
 * ONE LEDGER READ. Every P&L figure — the cards, the per-lini table, the P&L
 * panel, the largest costs — is read off one `/journal-entries/profit-loss`
 * response, the same statement the Laba Rugi screen renders. See
 * `useFinanceDashboard` for which module answers the rest.
 *
 * NET REVENUE IS REAL, NOT THE MOCKUP'S FLAT 11%. Diskon and retur are contra
 * accounts inside pendapatan, so "before discount" is simply the accounts that
 * grew and "net" is the category's total — see `profitLossHeadline`.
 *
 * WHAT THE FILTERS DO NOT TOUCH, each stated on the card it applies to: piutang,
 * utang and biaya tetap are positions as of today and ignore the period; the
 * chart is always the last seven days; and a business line narrows the P&L
 * only, because a rupiah in the bank belongs to the shop.
 *
 * "VS PERIODE SEBELUMNYA" ONLY WHEN THERE IS ONE. The four money cards carry a
 * delta against `previousPeriod` — the month before for a whole month, else
 * the same length immediately before. On "Semua" there is no before, so the
 * cards carry none and a caption says how to get one.
 *
 * IT OPENS ON "SEMUA", like every other date filter in the product, and `now`
 * COMES FROM THE SERVER — the presets, the chart's window and the biaya tetap
 * horizon are all dates.
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

  // Shared with Laba Rugi and Arus Kas — see reportPresets.
  const presets = useMemo(() => reportPresets(today), [today]);

  // The shared bucket is a client-side token; the API expresses "no business
  // line" by filtering on the lines, which it cannot do through an id. Sending
  // it would be a 400, so it is dropped.
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
    wrapping its call, because a hook cannot be called conditionally.
  */
  const readsLedger = can("journalEntries", "read");
  const data = useFinanceDashboard(apiQuery, {
    now: today,
    ledger: readsLedger,
    cashMovement: can("cashTransactions", "read"),
    receivables: can("customerInvoices", "read"),
    payables: can("purchaseInvoices", "read"),
    fixedCosts: can("fixedCosts", "read"),
  });

  const headline = useMemo(
    () => (data.profitLoss ? profitLossHeadline(data.profitLoss) : null),
    [data.profitLoss],
  );
  const lines = useMemo(
    () =>
      data.profitLoss
        ? lineProfits(data.profitLoss, data.businessLineNames)
        : [],
    [data.profitLoss, data.businessLineNames],
  );
  const expenses = useMemo(
    () => (data.profitLoss ? largestExpenses(data.profitLoss) : []),
    [data.profitLoss],
  );
  const lineOrder = useMemo(
    () => data.businessLines.map((line) => line._id),
    [data.businessLines],
  );

  /*
    "HAS LINI" IS EITHER SIGN OF ONE: the tenant defined a line, or the ledger
    carries one. The second covers a reader without `businessLines:read`, whose
    lookup is empty although the lines are very much there.
  */
  const hasLini =
    data.businessLines.length > 0 ||
    lines.some((line) => line.businessLineId !== null);

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
              <HeadlineRow data={data} headline={headline} />
              <PositionRow data={data} headline={headline} />
              <ComparisonNote data={data} />

              {hasLini ? (
                <>
                  <ThinnestLine lines={lines} />
                  <Card
                    title="Laba per lini bisnis"
                    description="Diurutkan dari margin tertipis."
                    action={
                      can("businessLines", "read") ? (
                        <Link
                          href={ACCOUNTING_CRUMBS.businessLines.href}
                          className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary transition hover:text-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          Kelola lini bisnis
                          <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      ) : undefined
                    }
                  >
                    <LineProfitTable lines={lines} loading={data.loading} />
                  </Card>

                  <Card title="Pendapatan 7 hari per lini bisnis">
                    <LineRevenueChart
                      days={data.trend}
                      names={data.businessLineNames}
                      lineOrder={lineOrder}
                      loading={data.trendLoading}
                      error={data.trendError}
                      onRetry={data.refetch}
                    />
                    {/*
                      The one thing the chart cannot say about itself: that it is
                      NOT the period above it.
                    */}
                    <p className="mt-3 text-xs text-muted">
                      Pendapatan setelah diskon & retur, tujuh hari terakhir
                      sampai {formatDate(data.trendPeriod.dateTo)} — tidak ikut
                      filter periode, tapi ikut filter cabang dan lini bisnis.
                    </p>
                  </Card>
                </>
              ) : (
                <div className="rounded-xl border border-border bg-tint-neutral px-5 py-4">
                  <p className="font-semibold text-foreground">
                    Belum ada lini bisnis
                  </p>
                  <p className="mt-1.5 text-sm text-muted">
                    Semua angka di atas ditampilkan sebagai satu kesatuan usaha.
                    Tambahkan lini bisnis supaya laba bisa dibaca per Grooming,
                    Hotel, Retail, dan seterusnya.
                  </p>
                </div>
              )}

              <Card title="P&L ringkas & beban terbesar">
                <ProfitLossBrief headline={headline} loading={data.loading} />
                <LargestExpenses expenses={expenses} />
                <FixedCostsDue data={data} />
              </Card>
            </>
          )}
        </>
      )}
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

/** A decimal string that is zero, however many places it carries. */
function isZero(value: string): boolean {
  return /^-?0(\.0+)?$/.test(value);
}

type DashboardData = ReturnType<typeof useFinanceDashboard>;

/**
 * Row one — did the shop make money: laba bersih, net revenue, net cashflow.
 *
 * PROFIT AND CASH SIDE BY SIDE ON PURPOSE. The two are different questions — a
 * month of invoices on tempo is profitable and cash-poor — and reading them in
 * one row is how somebody notices the gap.
 */
function HeadlineRow({
  data,
  headline,
}: {
  data: DashboardData;
  headline: ProfitLossHeadline | null;
}) {
  const { can } = usePermissions();
  const movement = data.cashMovement;

  const netProfit = headline?.netProfit ?? "0";
  /**
   * NO REVENUE MEANS NO PROFIT TO CLAIM. `marginPct` is null exactly when
   * revenue is zero; an inventory gain in a month with no sales is arithmetically
   * positive and is not profit, so the card stays neutral and says why.
   */
  const noRevenue = headline !== null && headline.marginPct === null;

  // Masuk − keluar, exact in BigInt — two aggregates the server computed.
  const netCash = movement
    ? subtractDecimals(movement.in.amount, movement.out.amount)
    : null;

  const before = usePrevious(data);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <SummaryCard
        icon={Scale}
        label="Total laba bersih"
        value={money(netProfit)}
        valueClassName={
          noRevenue
            ? undefined
            : netProfit.startsWith("-")
              ? "text-danger"
              : "text-success"
        }
        hint={
          noRevenue
            ? "Belum ada pendapatan di periode ini"
            : `Margin ${formatPercent(headline?.marginPct ?? null)} dari net revenue`
        }
        hintClassName={noRevenue ? "text-warning" : undefined}
        delta={deltaOf(netProfit, before.headline?.netProfit)}
        loading={data.loading}
      />

      <SummaryCard
        icon={TrendingUp}
        label="Total net revenue"
        value={money(headline?.netRevenue)}
        hint={
          headline && !isZero(headline.deductions)
            ? `Kotor ${money(headline.grossRevenue)} − diskon & retur ${money(headline.deductions)}`
            : `Pendapatan kotor ${money(headline?.grossRevenue)} sebelum diskon`
        }
        delta={deltaOf(headline?.netRevenue, before.headline?.netRevenue)}
        loading={data.loading}
      />

      {/*
        LEFT OUT RATHER THAN DASHED for a role that cannot read transactions. A
        dash means "this failed to load"; an absent card means "not yours to
        see", and the two must not look the same.
      */}
      {can("cashTransactions", "read") && (
        <SummaryCard
          icon={Banknote}
          label="Total net cashflow"
          value={netCash === null ? null : money(netCash)}
          valueClassName={netCash?.startsWith("-") ? "text-danger" : undefined}
          hint={
            movement
              ? `Masuk ${money(movement.in.amount)} − keluar ${money(movement.out.amount)}`
              : "Uang masuk dikurangi uang keluar"
          }
          delta={deltaOf(netCash, before.netCash)}
          loading={data.loading}
        />
      )}
    </div>
  );
}

/**
 * Row two — what is still owed each way, and the margin that sums the period up.
 */
function PositionRow({
  data,
  headline,
}: {
  data: DashboardData;
  headline: ProfitLossHeadline | null;
}) {
  const { can } = usePermissions();
  const { receivables, payables } = data;
  const before = usePrevious(data);
  const margin = headline?.marginPct ?? null;
  const marginBefore = before.headline?.marginPct ?? null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {can("customerInvoices", "read") && (
        <SummaryCard
          icon={Receipt}
          label="Piutang belum tertagih"
          value={receivables ? money(receivables.totalOutstanding) : null}
          /*
            A POSITION, NOT A PERIOD FIGURE. An invoice raised in July and still
            unpaid is money missing today; a piutang that emptied itself when
            somebody picked "bulan ini" would say the opposite.
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

      <SummaryCard
        icon={Percent}
        label="Profit margin"
        value={formatPercent(headline?.marginPct ?? null)}
        valueClassName={
          headline?.marginPct != null && headline.marginPct < 0
            ? "text-danger"
            : undefined
        }
        hint="Laba bersih dibagi net revenue"
        /*
          IN POIN, NOT PERCENT. A margin going from 20% to 22% is +2 poin; as a
          "percentage change" it would read +10%, which nobody means by "the
          margin went up".
        */
        delta={
          margin !== null && marginBefore !== null
            ? { value: Math.round((margin - marginBefore) * 10) / 10, unit: "poin" }
            : undefined
        }
        loading={data.loading}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ deltas */

interface Delta {
  value: number;
  unit: "%" | "poin";
}

/** The previous period's figures, read the same way as the current ones. */
function usePrevious(data: DashboardData) {
  const profitLoss = data.previous?.profitLoss ?? null;
  const headline = useMemo(
    () => (profitLoss ? profitLossHeadline(profitLoss) : null),
    [profitLoss],
  );
  const movement = data.previous?.cashMovement ?? null;
  return {
    headline,
    netCash: movement
      ? subtractDecimals(movement.in.amount, movement.out.amount)
      : null,
  };
}

/** A percentage delta, or nothing when either side is missing or before was 0. */
function deltaOf(
  current: string | null | undefined,
  previous: string | null | undefined,
): Delta | undefined {
  if (current == null || previous == null) return undefined;
  const pct = changePct(current, previous);
  return pct === null ? undefined : { value: pct, unit: "%" };
}

/**
 * "↗ 12,3% vs periode sebelumnya".
 *
 * THE ARROW AND THE SIGN CARRY THE DIRECTION, the tint only repeats it (§1.3).
 * Up is green on every card that has one, because on all four more is better —
 * profit, revenue, cash kept, margin. A fall is `danger-ink`, not `danger`: at
 * 13 px `danger` misses the text floor (§13).
 */
function DeltaLine({ delta }: { delta: Delta }) {
  const flat = delta.value === 0;
  const up = delta.value > 0;
  const figure = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(delta.value));

  return (
    <p
      className={cn(
        "mt-2 text-xs font-semibold tabular-nums",
        flat ? "text-muted" : up ? "text-success" : "text-danger-ink",
      )}
    >
      <span aria-hidden>{flat ? "→" : up ? "↗" : "↘"} </span>
      {flat ? "" : up ? "+" : "−"}
      {figure}
      {delta.unit === "%" ? "%" : " poin"} vs periode sebelumnya
    </p>
  );
}

/**
 * Which period the deltas are against — or, on "Semua", how to get one.
 *
 * SAID ONCE, UNDER THE CARDS, rather than on each: four copies of the same
 * date range is a row nobody reads, and "periode sebelumnya" on its own leaves
 * a reader of "Bulan ini" guessing whether that means August or the last 30
 * days.
 */
function ComparisonNote({ data }: { data: DashboardData }) {
  if (!data.previous) {
    return (
      <p className="-mt-2 text-xs text-muted">
        Pilih periode untuk membandingkan angka dengan periode sebelumnya.
      </p>
    );
  }

  const { dateFrom, dateTo } = data.previous.period;
  return (
    <p className="-mt-2 text-xs text-muted">
      Dibandingkan dengan {formatDate(dateFrom)} – {formatDate(dateTo)}.
    </p>
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
  delta,
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
  /** Movement against the previous period. Omitted when there is none to show. */
  delta?: Delta;
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
        Dimmed rather than replaced while a new period loads — the previous
        number, visibly stale, is more useful than an empty box for the third of
        a second it takes.
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
      {!failed && delta && <DeltaLine delta={delta} />}
    </>
  );

  if (href && !failed) {
    return (
      <Link
        href={href}
        /*
          THE SAME BOX AS `Card`, spelled out — a linked card sitting a shadow
          off its neighbours in the same row would read as a different kind of
          thing.
        */
        className="rounded-xl border border-border bg-surface px-6 py-5 shadow-sm transition hover:border-primary hover:shadow-md focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {body}
      </Link>
    );
  }

  return <Card className="gap-0 py-5">{body}</Card>;
}

/* -------------------------------------------------------------------- lini */

/**
 * How a margin is doing, in a word.
 *
 * THE WORD CARRIES THE STATUS, not the tint (§1.3, §9) — "Sehat" and "Tipis"
 * are readable with the colour switched off, and the percentage is there for
 * anyone who wants the number rather than the verdict.
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

/**
 * The mockup's callout: the lini with the thinnest margin, and what eats it.
 *
 * SHOWN FROM ONE LINI, not two (22 September 2026, on request). A tenant whose
 * only earning lini is Grooming still wants its margin said out loud — but
 * "paling tipis, terendah dari 1 lini" is a comparison with nothing, so with
 * one the title names the margin and the body says it is the only one earning.
 *
 * Nothing at all when no named lini sold anything: there is no margin to talk
 * about, and the shared bucket never has one.
 */
function ThinnestLine({ lines }: { lines: LineProfit[] }) {
  const ranked = lines.filter(
    (line) => line.businessLineId !== null && line.marginPct !== null,
  );
  if (!ranked.length) return null;

  // `lineProfits` already sorts thinnest first.
  const worst = ranked[0];
  const margin = worst.marginPct as number;
  const alone = ranked.length === 1;

  return (
    <div className="rounded-xl border border-border border-l-4 border-l-warning bg-tint-warning px-5 py-4">
      <p className="font-semibold text-foreground">
        {alone
          ? `Margin ${worst.label} ${formatPercent(margin)}`
          : `${worst.label} marginnya paling tipis`}
      </p>
      <p className="mt-1 text-sm text-warning">
        {alone ? (
          <>
            Satu-satunya lini bisnis yang punya pendapatan di periode ini.
          </>
        ) : (
          <>
            Margin bersihnya {formatPercent(margin)}, terendah dari{" "}
            {ranked.length} lini bisnis.
          </>
        )}{" "}
        HPP dan biaya menyerap {formatPercent(100 - margin)} dari pendapatan
        lini ini.
      </p>
    </div>
  );
}

/**
 * "Laba per lini bisnis" — one row per column of the laba rugi.
 *
 * UNDIVIDED, like the Laba Rugi screen's default: shared costs stay on their own
 * "Bersama (HQ)" row with no margin, because a margin on a bucket that sells
 * nothing is meaningless. That row is also the reminder that the lini above it
 * look better than they would once rent and payroll were divided.
 */
function LineProfitTable({
  lines,
  loading,
}: {
  lines: LineProfit[];
  loading: boolean;
}) {
  if (!lines.length) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Belum ada pendapatan atau beban di periode ini.
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", loading && "opacity-50")}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lini bisnis</TableHead>
            <TableHead
              className="text-right"
              title="Pendapatan setelah diskon & retur"
            >
              Pendapatan
            </TableHead>
            <TableHead className="text-right">HPP</TableHead>
            <TableHead
              className="text-right"
              title="Biaya operasional, ditambah biaya lainnya dan dikurangi pendapatan lainnya"
            >
              Biaya
            </TableHead>
            <TableHead className="text-right">Laba bersih</TableHead>
            <TableHead className="text-right">Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.businessLineId ?? "shared"}>
              <TableCell className="font-semibold text-foreground">
                {line.label}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(line.revenue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(line.hpp)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(line.cost)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  line.net.startsWith("-") && "font-semibold text-danger",
                )}
              >
                {money(line.net)}
              </TableCell>
              <TableCell className="text-right">
                {line.marginPct === null ? (
                  <span className="text-xs text-muted">
                    {line.businessLineId === null
                      ? "Belum dibagi ke lini"
                      : "Tanpa pendapatan"}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular-nums",
                      marginBand(line.marginPct).tone,
                    )}
                  >
                    {marginBand(line.marginPct).word}{" "}
                    {formatPercent(line.marginPct)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* --------------------------------------------------------------------- P&L */

/**
 * The laba rugi in five lines, plus a sixth only when it is not zero.
 *
 * "PENDAPATAN & BIAYA LAINNYA" IS SHOWN WHEN IT MOVED, because without it the
 * rows would not add up — laba usaha minus nothing would not equal laba bersih.
 * Most months it is zero, and a zero row is noise.
 */
function ProfitLossBrief({
  headline,
  loading,
}: {
  headline: ProfitLossHeadline | null;
  loading: boolean;
}) {
  if (!headline) return null;

  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Pendapatan (net revenue)", value: headline.netRevenue },
    { label: "HPP", value: headline.hpp },
    { label: "Laba kotor", value: headline.grossProfit, strong: true },
    { label: "Biaya operasional", value: headline.operatingExpense },
  ];
  if (!isZero(headline.otherNet)) {
    rows.push({
      label: "Pendapatan & biaya lainnya",
      value: headline.otherNet,
    });
  }
  rows.push({ label: "Laba bersih", value: headline.netProfit, strong: true });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border",
        loading && "opacity-50",
      )}
    >
      <Table>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell
                className={cn(row.strong && "font-semibold text-foreground")}
              >
                {row.label}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  row.strong && "font-semibold text-foreground",
                )}
              >
                {money(row.value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The expense accounts that cost the most, as bars against the largest.
 *
 * A BAR PER ROW, not a chart: five magnitudes and their names read better as a
 * ranked list with the figure printed than as anything with an axis.
 */
function LargestExpenses({ expenses }: { expenses: ExpenseShare[] }) {
  if (!expenses.length) return null;

  const largest = Number(expenses[0].sharePct) || 1;

  return (
    <div className="mt-5">
      <p className="mb-2 text-xs font-semibold text-muted">
        Beban terbesar periode ini
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border px-4">
        {expenses.map((item) => (
          <li
            key={item.accountId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
          >
            <span className="min-w-0 flex-1 font-semibold text-foreground">
              <span className="mr-1.5 text-xs text-muted tabular-nums">
                {item.code}
              </span>
              {item.name}
            </span>
            <span
              className="h-1.5 w-28 overflow-hidden rounded-full bg-tint-neutral"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-chart-gross"
                style={{ width: `${(item.sharePct / largest) * 100}%` }}
              />
            </span>
            <span className="w-44 text-right text-muted tabular-nums">
              {money(item.amount)} · {formatPercent(item.sharePct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The mockup's orange callout: biaya tetap coming due, and the nearest one.
 *
 * REAL FIGURES SINCE 21 SEPTEMBER 2026, when Biaya Tetap was built — this was a
 * "Segera" badge before. The totals count each active template once, not each
 * missed occurrence; the Biaya Tetap tab is where a backlog is paid down.
 *
 * NOTHING WHEN NOTHING IS DUE. A callout saying "0 biaya tetap" is a sentence
 * nobody needed; the tab is one click away in the rail.
 */
function FixedCostsDue({ data }: { data: DashboardData }) {
  const due = data.fixedCostsDue;
  if (!due || due.totals.out.count === 0) return null;

  const next = due.items[0];

  return (
    <div className="mt-5 rounded-xl border border-border border-l-4 border-l-warning bg-tint-warning px-5 py-4">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
        <Repeat className="size-4 text-warning" aria-hidden />
        {due.totals.out.count} biaya tetap jatuh tempo ≤{FIXED_COST_HORIZON_DAYS}{" "}
        hari · {money(due.totals.out.amount)} total
      </p>
      <p className="mt-1.5 text-sm text-warning">
        {next && (
          <>
            Terdekat: {next.name} jatuh tempo {formatDate(next.nextDueAt)}.{" "}
          </>
        )}
        <Link
          href={FIXED_COSTS_HREF}
          className="inline-flex items-center gap-0.5 rounded-md font-semibold underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Kelola di Kas & Bank
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
