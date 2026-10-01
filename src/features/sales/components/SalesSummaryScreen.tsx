"use client";

import Link from "next/link";

import { Alert, Card, ScopePeriodCard, Spinner } from "@/components";
import { SETTINGS_PATHS } from "@/features/settings/paths";
import type { RevenueBreakdown } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import type { BreakdownState } from "../hooks/useSalesSummary";
import { useReceivableFilterOptions } from "../hooks/useReceivableFilterOptions";
import { useSalesSummary } from "../hooks/useSalesSummary";
import { InvoiceStatCards } from "./InvoiceStatCards";
import { SalesModuleHeader } from "./SalesModuleHeader";

/** How many bars a panel draws before it folds the rest into one row. */
const TOP_GROUPS = 8;

/** "75,0" — a share, in the decimal comma every other number here uses. */
const SHARE = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * The Penjualan › Ringkasan tab — where the period's omzet came from.
 *
 * IT SHARES THE FAKTUR TAB'S FOUR STATUS CARDS (1 October 2026, on request) —
 * `InvoiceStatCards`, the same component and the same `/customer-invoices/summary`
 * figures, so Omzet periode / Belum lunas / Lewat jatuh tempo / Tertagih read
 * identically wherever somebody lands. What is unique to THIS tab is everything
 * below the cards: the breakdowns of what the omzet was MADE OF, which Faktur's
 * table does not show. `onDrill` is left unset here — there is no invoice table
 * on this page to drill into, so the two balance cards render as plain figures.
 *
 * THE SUMMARY TABS' OWN SCOPE ROW, NOT THE FAKTUR TAB'S (29 September 2026, on
 * request). It opened with the list's read-only scope card, its search box and
 * its `Filter (n)` panel; all three are gone in favour of the row Pembelian ›
 * Ringkasan wears — a cabang dropdown and five period chips, applying on click.
 *
 * WHAT WENT WITH THEM, so the next person does not look for it: the search box
 * (this tab counts a period's composition; narrowing it to one invoice number
 * answers nothing), the Gudang / Kasir / Sumber / Status fields, and the
 * multi-cabang set — all of which the Faktur tab still offers over the rows they
 * were written for. The filter still travels through `toFilterQuery`, the same
 * translation the list uses, so the fields that remain cannot be honoured by the
 * card and ignored by a breakdown.
 *
 * THREE BREAKDOWNS, ALL REAL, AND TWO OF THEM COUNT DIFFERENT THINGS. Kategori
 * produk and Lini usaha are read off the invoice LINES, joined to the catalogue
 * row each line sold — including the till's basket, which a `pos_bridge` invoice
 * keeps on its `posTransactions` document rather than in its own `items`.
 * Kategori pelanggan is read off the INVOICE, whose customer carries the
 * category, so it needs no allocation and sums to the Omzet card exactly. EVERY
 * PANEL SAYS WHICH IT IS AND WHERE ITS FIELD LIVES — see `SOURCES` — because a
 * reader comparing two totals that differ deserves the reason on the page rather
 * than in a commit message.
 */
export function SalesSummaryScreen() {
  const { query, summary, summaryFailed, breakdowns, setQuery } =
    useSalesSummary();
  const options = useReceivableFilterOptions();

  const revenue = summary?.revenue;

  return (
    <div className="flex flex-col gap-5">
      <SalesModuleHeader />

      {/* What every figure below is ABOUT — and the two controls that set it.
          The same row Pembelian › Ringkasan wears (29 September 2026, on
          request); see ScopePeriodCard for why there is no Filter button. */}
      <ScopePeriodCard
        /*
          ONE CABANG, WHERE THE QUERY HOLDS A SET. The list's panel offers several
          at once; this row offers one, so the value is the first of the set and
          picking replaces it. Nothing is lost that this tab could show: a
          composition of two branches read as one number is a figure nobody can
          act on, and the Faktur tab still takes the set.
        */
        branchId={query.branchIds[0] ?? ""}
        branches={options.branches}
        onBranchChange={(branchId) =>
          setQuery({ branchIds: branchId ? [branchId] : [] })
        }
        period={query.period}
        /* Leaving Custom drops the typed dates: a named period carries its own,
           and stale ones would travel beside it. */
        onPeriodChange={(period) =>
          setQuery(
            period === "custom"
              ? { period }
              : { period, dateFrom: "", dateTo: "" },
          )
        }
        dateFrom={query.dateFrom}
        dateTo={query.dateTo}
        onDateRangeChange={({ from, to }) =>
          setQuery({ dateFrom: from, dateTo: to })
        }
        dateLabel="Tanggal faktur"
      />

      <InvoiceStatCards summary={summary} failed={summaryFailed} />

      <BreakdownPanel
        title="Omzet per kategori produk"
        state={breakdowns.category}
        revenue={revenue?.amount ?? null}
      />
      <BreakdownPanel
        title="Omzet per layanan"
        state={breakdowns.businessLine}
        revenue={revenue?.amount ?? null}
      />
      <BreakdownPanel
        title="Omzet per kategori pelanggan"
        state={breakdowns.customerType}
        revenue={revenue?.amount ?? null}
      />

      {/* The mockup's closing note — what this tab is, and what it is not. */}
      <Card>
        <p className="text-base font-bold text-foreground">
          Komposisi, bukan daftar faktur
        </p>
        <p className="mt-1 text-sm text-muted">
          Kartu di atas sama dengan tab{" "}
          <Link
            href="/dashboard/sales/invoice"
            className="text-primary underline-offset-2 hover:underline"
          >
            Faktur
          </Link>
          . Yang khas di sini adalah rinciannya — dari kategori, lini, dan
          jenis pelanggan apa omzet itu berasal. Daftar fakturnya sendiri,
          beserta aksi bayar dan batalkan, tetap di tab Faktur dan{" "}
          <Link
            href="/dashboard/sales/piutang"
            className="text-primary underline-offset-2 hover:underline"
          >
            Piutang
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ the three axes */

/**
 * WHERE EACH PANEL'S FIGURES COME FROM, in the words of the screens a reader can
 * go and check — asked for explicitly, and load-bearing rather than decorative.
 *
 * `empty` NAMES THE FIELD THAT IS BLANK, not "no data". Two of these three have
 * an optional field behind them (a service needs no category, a customer needs
 * no type), so an empty panel usually means somebody has not filled a master
 * list in — which is a thing they can act on, unlike "belum ada data".
 */
const SOURCES: Record<
  RevenueBreakdown["axis"],
  { source: React.ReactNode; unnamed: string; empty: string }
> = {
  category: {
    source: (
      <>
        Dikelompokkan dari <b>Kategori</b> pada master{" "}
        <Link
          href="/dashboard/inventory/products"
          className="text-primary underline-offset-2 hover:underline"
        >
          Produk &amp; Varian
        </Link>{" "}
        dan Layanan, dibaca per baris faktur.
      </>
    ),
    unnamed: "Tanpa kategori",
    empty:
      "Belum ada baris terjual pada cabang dan periode ini. Ubah lewat tombol Filter.",
  },
  businessLine: {
    source: (
      <>
        Dikelompokkan dari <b>Lini usaha</b> yang menempel di master produk dan
        layanan — daftarnya di{" "}
        <Link
          href={SETTINGS_PATHS.liniBisnis}
          className="text-primary underline-offset-2 hover:underline"
        >
          Pengaturan › Lini bisnis
        </Link>
        , dibaca per baris faktur.
      </>
    ),
    unnamed: "Tanpa lini usaha",
    empty:
      "Belum ada baris terjual pada cabang dan periode ini. Ubah lewat tombol Filter.",
  },
  customerType: {
    source: (
      <>
        Dikelompokkan dari <b>Kategori pelanggan</b> pada profil pelanggan —
        daftarnya di{" "}
        <Link
          href={SETTINGS_PATHS.tipePelanggan}
          className="text-primary underline-offset-2 hover:underline"
        >
          Pengaturan › Kategori pelanggan
        </Link>
        . Dibaca dari register hari ini, bukan disalin ke faktur: pelanggan yang
        pindah kategori membawa seluruh riwayatnya.
      </>
    ),
    unnamed: "Tanpa kategori pelanggan",
    empty:
      "Belum ada faktur pada cabang dan periode ini. Ubah lewat tombol Filter.",
  },
};

const groupName = (
  axis: RevenueBreakdown["axis"],
  row: RevenueBreakdown["groups"][number],
) => row.name ?? SOURCES[axis].unnamed;

/**
 * One breakdown, as the mockup's bar list on real figures.
 *
 * BARS RATHER THAN A CHART, the same call `LargestExpenses` makes in Keuangan: a
 * handful of magnitudes with their names read better as a ranked list with the
 * money printed than as anything with an axis.
 *
 * IT SAYS WHERE ITS FIGURES COME FROM, AND WHAT THEY ADD UP TO. On a `line`
 * basis the bars are short of the omzet — the invoice discount, the other
 * charges and the tax belong to no single catalogue row — and the gap is printed
 * rather than smoothed over, because a breakdown quietly adding up to something
 * else is the bug this note exists to prevent. On the `invoice` basis it says
 * that the two agree, which is worth as much.
 *
 * A LONG TAIL FOLDS INTO ONE ROW. A tenant with forty categories would otherwise
 * push everything else on the page below the fold, and the rows past the eighth
 * are not what somebody opened this tab to read.
 */
function BreakdownPanel({
  title,
  state,
  revenue,
}: {
  title: string;
  state: BreakdownState;
  /** The Omzet card's figure, for the line that reconciles the two. */
  revenue: string | null;
}) {
  const data = state.data;
  const rows = data?.groups ?? [];
  const total = Number(data?.total ?? 0);
  const largest = Number(rows[0]?.amount ?? 0) || 1;
  const head = rows.slice(0, TOP_GROUPS);
  const tail = rows.slice(TOP_GROUPS);
  const tailAmount = tail.reduce((sum, row) => sum + Number(row.amount), 0);
  const copy = data ? SOURCES[data.axis] : null;

  return (
    <Card title={<h2 className="text-lg font-bold">{title}</h2>}>
      {state.failed ? (
        <Alert variant="error">
          Rincian ini tidak bisa dimuat. Angka omzet dan rincian lain di halaman
          ini tidak terpengaruh.
        </Alert>
      ) : state.loading || !data || !copy ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Spinner /> Menghitung rincian…
        </div>
      ) : (
        <>
          {/* Where these figures come from — the master list to go and check. */}
          <p className="mb-3 text-xs text-muted">{copy.source}</p>

          {rows.length === 0 ? (
            <p className="py-2 text-sm text-muted">{copy.empty}</p>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border px-4">
                {head.map((row) => (
                  <BreakdownRow
                    key={row.id ?? "__unnamed"}
                    name={groupName(data.axis, row)}
                    amount={row.amount}
                    share={total > 0 ? (Number(row.amount) / total) * 100 : 0}
                    width={(Number(row.amount) / largest) * 100}
                    meta={countLabel(row)}
                  />
                ))}
                {tail.length > 0 && (
                  <BreakdownRow
                    name={`${tail.length} lainnya`}
                    amount={String(tailAmount)}
                    share={total > 0 ? (tailAmount / total) * 100 : 0}
                    width={(tailAmount / largest) * 100}
                    meta=""
                  />
                )}
              </ul>

              <p className="mt-3 text-xs text-muted">
                {data.basis === "invoice" ? (
                  <>
                    Total {formatMoney(data.total)} — sama dengan omzet periode,
                    karena kategori pelanggan menempel pada seluruh faktur
                    sehingga tidak ada yang perlu dibagi.
                  </>
                ) : (
                  <>
                    Total nilai baris {formatMoney(data.total)}
                    {revenue ? ` dari omzet ${formatMoney(revenue)}` : ""} —
                    selisihnya diskon faktur, biaya lain, dan pajak, yang tidak
                    menempel pada satu baris. Baris dari kasir ikut dihitung lewat
                    transaksi kasirnya.
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}

/** "40 baris" or "3 faktur" — whichever this axis actually counted. */
function countLabel(row: RevenueBreakdown["groups"][number]): string {
  if (row.lineCount !== null) return `${row.lineCount} baris`;
  if (row.invoiceCount !== null) return `${row.invoiceCount} faktur`;
  return "";
}

/** One group: its name, its bar, its money and its share. */
function BreakdownRow({
  name,
  amount,
  share,
  width,
  meta,
}: {
  name: string;
  amount: string;
  share: number;
  /** The bar's length, as a percentage of the largest group. */
  width: number;
  meta: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
      <span className="min-w-0 flex-1 font-semibold text-foreground">
        {name}
        {meta && (
          <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">
            {meta}
          </span>
        )}
      </span>
      <span
        className="h-1.5 w-28 overflow-hidden rounded-full bg-tint-neutral"
        aria-hidden
      >
        <span
          className="block h-full rounded-full bg-chart-gross"
          style={{ width: `${Math.max(Math.min(width, 100), 0)}%` }}
        />
      </span>
      <span className="w-44 text-right text-muted tabular-nums">
        {formatMoney(amount)} · {SHARE.format(share)}%
      </span>
    </li>
  );
}
