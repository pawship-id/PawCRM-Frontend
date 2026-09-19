"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Alert, Breadcrumb, Spinner } from "@/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
// The shadcn button directly, for `size="sm"` — the app-facing wrapper in
// @/components does not carry a size prop. Same import JournalEntriesScreen makes.
import { Button } from "@/components/ui/button";
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
import type { AccountCategory } from "@/types/accounting";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import {
  currentMonthRange,
  formatPercent,
  marginPct,
  reportPresets,
  type FinanceQuery,
} from "../financeSummary";
import { useFinanceReport } from "../hooks/useFinanceReport";
import { profitLossMatrix, type MatrixRow } from "../reportSummary";
import { formatDate } from "../labels";
import { FinanceReportToolbar } from "./FinanceReportToolbar";

/**
 * Laba rugi per lini bisnis — accounts down, lini across, konsolidasi on the end.
 *
 * WHY A MATRIX RATHER THAN A LIST. A single-column P&L answers "did the shop make
 * money", which the Keuangan dashboard already answers in four cards. The question
 * this screen exists for is the one a petshop owner actually has — *which* part of
 * the shop makes money — and that is a comparison, so the lines have to sit side
 * by side on one row. Grooming's margin is only interesting next to retail's.
 *
 * THE FIGURES ARE REAL as of 18 September 2026 — `GET /journal-entries/profit-loss`.
 * It used to render a fixture, and the note here used to explain why: `summary`
 * groups by (line × account CLASS), which could give the group totals and
 * nothing under them, and could not tell HPP from beban operasional because both
 * are `expense`. The chart of accounts grew CATEGORIES, the endpoint groups by
 * them, and the whole report follows.
 *
 * FIVE GROUPS AND THREE SUBTOTALS, which is BO's own formula:
 *
 *   Pendapatan − HPP = Laba Kotor − Biaya = Laba Usaha
 *   + Pendapatan Lainnya − Biaya Lainnya = Laba Bersih
 *
 * Pendapatan Lainnya sits BELOW laba usaha rather than in laba kotor — decided
 * 18 September, so gross margin is not shifted by delivery income or an opname
 * gain, and so it mirrors Biaya Lainnya. Laba bersih is the same either way.
 *
 * ALL THREE FILTERS ARE LIVE NOW. The period and the cabang go to the API; the
 * lini bisnis does NOT — it drops COLUMNS from a matrix that still totals across
 * all of them, which is a different act from narrowing the ledger. See
 * `profitLossMatrix`.
 *
 * NOTHING ON THIS SCREEN ADDS UP MONEY. Every figure including the three
 * subtotals is computed server-side and derived from the others there, so two
 * numbers on this page cannot disagree.
 *
 * `now` COMES FROM THE SERVER, like the dashboard's: the presets are dates, and a
 * client component that read the clock while rendering would disagree with the
 * HTML the server sent.
 */
export function ProfitLossScreen({ now }: { now: string }) {
  const today = useMemo(() => new Date(now), [now]);
  const presets = useMemo(() => reportPresets(today), [today]);

  // The current month, so the screen opens on a period rather than on the whole
  // history of the ledger — which is a legal answer from the API and never the
  // one somebody came for. A laba rugi is read by the month.
  const [query, setQuery] = useState<FinanceQuery>(() => {
    const month = currentMonthRange(today);
    return {
      dateFrom: month.dateFrom,
      dateTo: month.dateTo,
      branchId: "",
      businessLineId: "",
      // OFF. The undivided report is what every previous month was read as, so
      // it stays what the screen opens on — the toggle is how somebody asks the
      // other question, side by side with the answer they already know.
      allocation: false,
    };
  });

  /** Open group keys. Pendapatan leads open — it is the row people came for. */
  const [expanded, setExpanded] = useState<Set<AccountCategory>>(
    () => new Set<AccountCategory>(["pendapatan"]),
  );

  const { branches, businessLines, profitLoss, loading, error } =
    useFinanceReport("profitLoss", query);

  const matrix = useMemo(
    () =>
      profitLoss
        ? profitLossMatrix(profitLoss, businessLines, query.businessLineId)
        : null,
    [profitLoss, businessLines, query.businessLineId],
  );

  const allOpen = matrix !== null && expanded.size === matrix.groups.length;

  function toggle(key: AccountCategory) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // +2: the sticky account column and the consolidated one, which are not lini.
  const columnCount = (matrix?.columns.length ?? 0) + 2;

  /** The period as it reads on the card, taken from what was asked for. */
  const periodLabel =
    query.dateFrom && query.dateTo
      ? `${formatDate(query.dateFrom)} – ${formatDate(query.dateTo)}`
      : "Seluruh periode";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[ACCOUNTING_CRUMBS.hub, { label: "Laba Rugi" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Laba Rugi per Lini Bisnis
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Pendapatan dikurangi beban pokok dan beban operasional, dipecah per
          lini bisnis. Kolom Bersama (HQ) menampung yang tidak terikat satu lini
          — sewa, gaji kantor, listrik.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/*
        THE ONE CONTROL ON THIS SCREEN THAT IS NOT A FILTER, which is why it does
        not live in the toolbar (§8 is about narrowing a list). It does not change
        WHICH entries are read — it changes what the same entries are reported as,
        and the two answers are meant to be compared. Applying on the switch, with
        no Terapkan, is what makes the comparison a flick back and forth.
      */}
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <Switch
          id="pl-allocation"
          checked={query.allocation === true}
          disabled={loading}
          onCheckedChange={(allocation) =>
            setQuery((prev) => ({ ...prev, allocation }))
          }
        />
        <div className="min-w-0 flex-1">
          <Label htmlFor="pl-allocation">Bagikan beban bersama ke tiap lini</Label>
          <p className="mt-1 text-xs text-muted">
            {query.allocation
              ? "Sewa, marketing dan gaji kantor dibagi ke tiap lini mengikuti Aturan Alokasi di Daftar Akun, sesuai porsi pendapatan periode ini. Kolom Bersama menyisakan akun yang belum dipetakan."
              : "Beban yang tidak terikat satu lini tetap utuh di kolom Bersama — sama seperti laporan bulan-bulan sebelumnya."}
          </p>
        </div>
      </div>

      {/*
        A figure that rests on an equal split rather than on trade. Said here, on
        the report, rather than only in a tooltip: somebody who prints this page
        has to be able to see that one of its numbers is an estimate.
      */}
      {profitLoss?.allocation?.estimated && (
        <Alert variant="warning">
          Sebagian pembagian dibagi rata, bukan sesuai porsi pendapatan — ada
          segmen yang belum membukukan pendapatan apa pun di periode ini.
        </Alert>
      )}

      <FinanceReportToolbar
        query={query}
        branches={branches}
        businessLines={businessLines}
        presets={presets}
        disabled={loading}
        onChange={(patch) => setQuery((prev) => ({ ...prev, ...patch }))}
      />

      {matrix === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat laba rugi…
        </div>
      ) : (
      /* The table container is written out rather than wrapped in <Card>: Card
         pads its content, and a matrix has to run edge to edge so the sticky
         first column has an edge to stick to. Same shape JournalEntriesScreen
         uses for the same reason. */
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-hover px-4 py-3">
          <h2 className="text-base font-bold">Laporan Laba Rugi</h2>
          <span className="text-xs tabular-nums text-muted">
            {periodLabel} ·{" "}
            {query.branchId
              ? (branches.find((b) => b._id === query.branchId)?.name ??
                "Cabang terpilih")
              : "Semua cabang"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() =>
              setExpanded(
                allOpen
                  ? new Set()
                  : new Set(matrix.groups.map((group) => group.key)),
              )
            }
          >
            {allOpen ? "Tutup semua rincian" : "Buka semua rincian"}
          </Button>
        </div>

        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              {/* Sticky, because the whole point of the table is reading one
                  account across several lini — and a row you have scrolled the
                  name off is a row of numbers about nothing. */}
              <TableHead className="sticky left-0 z-20 bg-surface-hover">
                Akun
              </TableHead>
              {matrix.columns.map((column) => (
                <TableHead
                  key={column.id ?? "shared"}
                  className="text-right whitespace-nowrap"
                >
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="border-l border-border text-right whitespace-nowrap">
                Total Konsolidasi
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {matrix.groups.map((group) => {
              const open = expanded.has(group.key);
              // Which side of the formula the group is on, decided in
              // `reportSummary` rather than here: the two income groups add, the
              // three cost groups are subtracted and so print with a leading
              // minus. The amounts themselves stay positive, because a report
              // prints "Beban Sewa 15.000.000" until it is being taken away.
              const negative = group.negative;

              return (
                <Fragment key={group.key}>
                  <TableRow className="bg-surface-hover hover:bg-surface-hover">
                    <TableCell className="sticky left-0 z-10 bg-surface-hover px-4 py-2.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggle(group.key)}
                        className="inline-flex items-center gap-2 rounded-md text-sm font-semibold outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <ChevronRight
                          className={cn(
                            "size-4 text-muted transition",
                            open && "rotate-90",
                          )}
                          aria-hidden
                        />
                        {group.label}
                      </button>
                    </TableCell>
                    {group.cells.map((amount, index) => (
                      <TableCell
                        key={matrix.columns[index].id ?? "shared"}
                        className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums"
                      >
                        {signed(amount, negative)}
                      </TableCell>
                    ))}
                    <TableCell className="border-l border-border px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                      {signed(group.total, negative)}
                    </TableCell>
                  </TableRow>

                  {open &&
                    group.accounts.map((account) => (
                      <TableRow key={account.code}>
                        <TableCell className="sticky left-0 z-10 bg-surface py-2 pr-4 pl-10 text-sm">
                          <span className="mr-2 text-xs tabular-nums text-muted">
                            {account.code}
                          </span>
                          {account.name}
                        </TableCell>
                        {account.cells.map((amount, index) => (
                          <TableCell
                            key={matrix.columns[index].id ?? "shared"}
                            className="px-4 py-2 text-right text-sm tabular-nums text-muted"
                          >
                            {signed(amount, negative)}
                          </TableCell>
                        ))}
                        <TableCell className="border-l border-border px-4 py-2 text-right text-sm tabular-nums text-muted">
                          {signed(account.total, negative)}
                        </TableCell>
                      </TableRow>
                    ))}

                  {open && group.accounts.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columnCount}
                        className="py-4 pl-10 text-sm text-muted"
                      >
                        Belum ada akun yang bergerak di grup ini.
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Each subtotal sits directly under the group it closes —
                      that placement IS what makes it that subtotal rather than
                      a second net figure. Laba kotor after HPP, laba usaha
                      after Biaya. */}
                  {group.key === "hpp" && (
                    <ResultRow
                      label="Laba Kotor"
                      row={matrix.grossProfit}
                      base={matrix.revenue}
                      columns={matrix.columns}
                      pctLabel="margin"
                    />
                  )}
                  {group.key === "biaya" && (
                    <ResultRow
                      label="Laba Usaha"
                      row={matrix.operatingProfit}
                      base={matrix.revenue}
                      columns={matrix.columns}
                      pctLabel="margin usaha"
                    />
                  )}
                </Fragment>
              );
            })}

            <ResultRow
              label="Laba Bersih"
              row={matrix.netProfit}
              base={matrix.revenue}
              columns={matrix.columns}
              pctLabel="margin bersih"
              emphasis
            />
          </TableBody>
        </Table>
      </div>
      )}

      <p className="text-xs text-muted">
        Persentase dihitung terhadap pendapatan kolom yang sama, jadi sebuah lini
        dibandingkan dengan dirinya sendiri — bukan dengan total shop. Kolom
        Bersama (HQ) tidak punya pendapatan, jadi persentasenya tampil sebagai
        &ldquo;—&rdquo;.
      </p>
    </div>
  );
}

/**
 * Laba Kotor and Laba Bersih — a total with its margin under it.
 *
 * THE PERCENTAGE IS PER COLUMN, taken against that column's own pendapatan. Any
 * other base would make the number mean something else entirely: grooming's
 * margin against the shop's revenue is not a margin, it is a contribution share
 * wearing a margin's label. `marginPct` returns null when the base is zero, which
 * is exactly the Bersama column's case, and it renders as an em dash rather than
 * as 0% — a column with no revenue has no margin, and claiming zero is a claim.
 */
function ResultRow({
  label,
  row,
  base,
  columns,
  pctLabel,
  emphasis,
}: {
  label: string;
  row: MatrixRow;
  base: MatrixRow;
  columns: Array<{ id: string | null; label: string }>;
  pctLabel: string;
  /** The bottom line, tinted so the eye lands on it from anywhere on the page. */
  emphasis?: boolean;
}) {
  const cellClass = cn(
    "px-4 py-2.5 text-right text-sm font-bold tabular-nums",
    emphasis ? "bg-navy-100" : "bg-surface-selected",
  );

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        className={cn(
          "sticky left-0 z-10 px-4 py-2.5 text-sm font-bold",
          emphasis ? "bg-navy-100" : "bg-surface-selected",
        )}
      >
        {label}
      </TableCell>
      {row.cells.map((amount, index) => (
        <TableCell key={columns[index].id ?? "shared"} className={cellClass}>
          {signed(amount, false)}
          <span className="mt-0.5 block text-xs font-medium tabular-nums text-muted">
            {formatPercent(marginPct(amount, base.cells[index]))} {pctLabel}
          </span>
        </TableCell>
      ))}
      <TableCell className={cn(cellClass, "border-l border-border")}>
        {signed(row.total, false)}
        <span className="mt-0.5 block text-xs font-medium tabular-nums text-muted">
          {formatPercent(marginPct(row.total, base.total))} {pctLabel}
        </span>
      </TableCell>
    </TableRow>
  );
}

/**
 * Money as this report prints it.
 *
 * A TRUE MINUS SIGN, not the hyphen `formatMoney` puts after "Rp" — the same
 * choice the dashboard makes, and for the same reason: "Rp -1.200.000" reads as a
 * typo at a glance, and the number it happens on is always a loss.
 *
 * `negate` is for the two beban groups, whose amounts are stored positive and
 * subtracted at the point of display. An amount of zero prints as an em dash:
 * a matrix is mostly empty cells, and a grid of "Rp 0" hides the ones that are
 * not.
 */
function signed(value: string, negate: boolean): string {
  if (value === "0.0000" || value === "0") return "—";

  const loss = value.startsWith("-");
  const magnitude = formatMoney(absDecimal(value));

  // A negative beban — a supplier credit note, a stock surplus crediting 5201 —
  // subtracts to a positive, so the two signs cancel rather than stack.
  const minus = negate ? !loss : loss;
  return minus ? `−${magnitude}` : magnitude;
}
