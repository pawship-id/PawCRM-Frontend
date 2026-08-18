"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Alert, Breadcrumb } from "@/components";
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

import { ACCOUNTING_CRUMBS } from "../crumbs";
import {
  formatPercent,
  marginPct,
  reportPresets,
  type FinanceQuery,
} from "../financeSummary";
import {
  profitLossMatrix,
  FIXTURE_BRANCHES,
  FIXTURE_LINES,
  FIXTURE_PERIOD_LABEL,
  type MatrixRow,
  type ProfitLossGroupKey,
} from "../reportSummary";
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
 * THE FIGURES ARE CONTOH. `GET /journal-entries/summary` groups by
 * (businessLineId × accountType), which produces the three group TOTALS and
 * nothing under them: there is no per-account breakdown, and no way to tell HPP
 * from beban operasional, because the chart of accounts has one `expense` class.
 * So Pendapatan, Beban and Laba Bersih could be real today; the detail rows and
 * the Laba Kotor line could not. Rather than ship half a report and leave the
 * shape to be argued about later, the whole thing renders from a fixture and says
 * so on the page. See ../data/reportFixtures.ts for what replaces what.
 *
 * TWO OF THE THREE FILTERS ARE LIVE over that fixture — cabang and lini bisnis
 * really do narrow it, because both are questions the fixture can answer. The
 * period cannot, since the fixture is one month, and the banner says which is
 * which. A control that silently does nothing is the thing worth avoiding here.
 *
 * `now` COMES FROM THE SERVER, like the dashboard's: the presets are dates, and a
 * client component that read the clock while rendering would disagree with the
 * HTML the server sent.
 */
export function ProfitLossScreen({ now }: { now: string }) {
  const today = useMemo(() => new Date(now), [now]);

  const [query, setQuery] = useState<FinanceQuery>(() => ({
    dateFrom: "",
    dateTo: "",
    branchId: "",
    businessLineId: "",
  }));

  /** Open group keys. Pendapatan leads open — it is the row people came for. */
  const [expanded, setExpanded] = useState<Set<ProfitLossGroupKey>>(
    () => new Set<ProfitLossGroupKey>(["revenue"]),
  );

  const presets = useMemo(() => reportPresets(today), [today]);

  const matrix = useMemo(
    () =>
      profitLossMatrix({
        branchId: query.branchId,
        businessLineId: query.businessLineId,
      }),
    [query.branchId, query.businessLineId],
  );

  const allOpen = expanded.size === matrix.groups.length;

  function toggle(key: ProfitLossGroupKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // +2: the sticky account column and the consolidated one, which are not lini.
  const columnCount = matrix.columns.length + 2;

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

      <Alert variant="info">
        <p className="font-semibold">Angka di halaman ini masih contoh.</p>
        <p className="mt-0.5">
          Belum terhubung ke jurnal umum. Filter cabang dan lini bisnis sudah
          bekerja di data contoh ini; filter periode belum, karena datanya baru
          satu periode ({FIXTURE_PERIOD_LABEL}).
        </p>
      </Alert>

      <FinanceReportToolbar
        query={query}
        branches={FIXTURE_BRANCHES}
        businessLines={FIXTURE_LINES}
        presets={presets}
        onChange={(patch) => setQuery((prev) => ({ ...prev, ...patch }))}
      />

      {/* The table container is written out rather than wrapped in <Card>: Card
          pads its content, and a matrix has to run edge to edge so the sticky
          first column has an edge to stick to. Same shape JournalEntriesScreen
          uses for the same reason. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-hover px-4 py-3">
          <h2 className="text-base font-bold">Laporan Laba Rugi</h2>
          <span className="text-xs tabular-nums text-muted">
            {FIXTURE_PERIOD_LABEL} ·{" "}
            {query.branchId
              ? (FIXTURE_BRANCHES.find((b) => b._id === query.branchId)?.name ??
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

        <Table>
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
              // Pendapatan adds; the two beban groups are subtracted from it, so
              // they print with a leading minus. The stored amounts stay positive
              // — see the fixture — because a report prints "Beban Sewa
              // 15.000.000", not "−15.000.000", until it is being subtracted.
              const negative = group.key !== "revenue";

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

                  {/* Laba kotor sits directly under HPP, which is what makes it
                      laba kotor rather than a second net figure. */}
                  {group.key === "cogs" && (
                    <ResultRow
                      label="Laba Kotor"
                      row={matrix.grossProfit}
                      base={matrix.revenue}
                      columns={matrix.columns}
                      pctLabel="margin"
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
