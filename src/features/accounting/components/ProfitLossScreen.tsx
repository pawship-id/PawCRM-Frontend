"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Alert,
  Breadcrumb,
  FilterMultiSelect,
  FilterPills,
  Spinner,
  namedOptions,
} from "@/components";
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
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";

import {
  SHARED_LINE_LABEL,
  SHARED_LINE_NONE,
  formatPercent,
  monthRange,
} from "../financeSummary";
import { useProfitLossMonths } from "../hooks/useProfitLossMonths";
import {
  CHANGE_BIG,
  CHANGE_THRESHOLD,
  changeAgainst,
  profitLossStatement,
  type StatementRow,
  type StatementValue,
} from "../profitLossStatement";

/**
 * Laba rugi, as the v3 mockup draws it (Laporan › Laba rugi).
 *
 * THREE MONTHS SIDE BY SIDE rather than accounts × lini. The question a reader
 * brings to a P&L is "did this month get better or worse than the last", so the
 * columns are months, oldest first, and a figure that moved 10% or more against
 * the month before wears a label under it: green when the move helps (revenue or
 * profit up, cost down), red when it hurts. 25% or more also tints the cell.
 *
 * TWO VIEWS OF THE SAME NUMBERS. Gabungan is the whole shop; Per lini bisnis
 * keeps the same rows but each can be opened to show its share per lini, the
 * unattributed bucket included. The lini filter drops columns, it does not
 * narrow the ledger — see `profitLossMatrix`.
 *
 * Every amount is the server's (`GET /journal-entries/profit-loss`, one read per
 * month). The page adds nothing up except the percentages between two figures.
 *
 * `now` COMES FROM THE SERVER so the month the screen opens on matches the HTML.
 */

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type View = "gabungan" | "lini";

export function ProfitLossScreen({ now }: { now: string }) {
  const today = useMemo(() => new Date(now), [now]);

  const [back, setBack] = useState(0);
  // Empty = semua. The multi-selects apply on Terapkan and reset to "all".
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [view, setView] = useState<View>("gabungan");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["np"]));

  // Oldest first: the month on screen is the LAST column.
  const months = useMemo(() => {
    const base = today.getFullYear() * 12 + today.getMonth() - back;
    return [2, 1, 0].map((k) => {
      const index = base - k;
      const year = Math.floor(index / 12);
      const month = index % 12;
      return { ...monthRange(year, month + 1), label: MONTHS[month], year };
    });
  }, [today, back]);

  const { branches, businessLines, results, loading, error } =
    useProfitLossMonths(months, branchIds);

  const statement = useMemo(
    () => (results ? profitLossStatement(results, businessLines, lineIds) : null),
    [results, businessLines, lineIds],
  );

  const current = months[2];
  const rows = statement
    ? view === "lini"
      ? statement.rows.filter((r) => r.inLini)
      : statement.rows
    : [];
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.key));

  const branchOptions = namedOptions(branches);
  const lineOptions = [
    ...namedOptions(businessLines),
    { value: SHARED_LINE_NONE, label: SHARED_LINE_LABEL },
  ];
  const summarize = (all: string) => (values: string[]) =>
    values.length === 0 ? all : `${values.length} dipilih`;

  async function exportXlsx() {
    if (!statement) return;
    type Line = { label: string; v: StatementValue[]; pct?: boolean };
    const lines: Line[] = [];
    for (const row of rows) {
      lines.push({ label: row.label, pct: row.pct, v: row.v.map((m) => m[0]) });
      if (view === "lini") {
        statement.columns.forEach((col, i) =>
          lines.push({ label: `   ${col.label}`, pct: row.pct, v: row.v.map((m) => m[i + 1]) }),
        );
      }
    }
    const cell = (line: Line, m: number) => {
      const value = line.v[m];
      if (line.pct) return typeof value === "number" ? value : null;
      return typeof value === "string" ? Number(value) : null;
    };
    const columns: XlsxColumn<Line>[] = [
      { header: "Uraian", value: (l) => l.label, width: 34 },
      ...months.map((month, m): XlsxColumn<Line> => ({
        header: `${month.label} ${month.year}`,
        value: (l) => cell(l, m),
        type: "number",
        width: 18,
      })),
    ];
    await exportToXlsx(columns, lines, `laba-rugi-${current.dateFrom.slice(0, 7)}.xlsx`, {
      sheetName: "Laba rugi",
    });
  }

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Laporan", href: "/dashboard/reports?tab=keuangan" },
              { label: "Laba rugi" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Laba rugi
          </h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted">
            Basis akrual. Pendapatan diakui saat faktur diposting, HPP saat stok
            keluar.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/reports?tab=keuangan">← Kembali</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!statement}
            onClick={exportXlsx}
          >
            Ekspor
          </Button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {results?.some((r) => r.allocation?.estimated) && (
        <Alert variant="warning">
          Sebagian biaya bersama dibagi rata, bukan sesuai porsi pendapatan,
          karena tidak ada lini di lingkup pembagian itu yang mencatat
          pendapatan pada periode ini. Angkanya perkiraan.
        </Alert>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {branches.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted">Cabang</span>
              <FilterMultiSelect
                label="Cabang"
                layout="bar"
                ariaLabel="Filter cabang"
                values={branchIds}
                options={branchOptions}
                disabled={loading}
                formatValue={summarize("Semua cabang")}
                onApply={setBranchIds}
                onReset={() => setBranchIds([])}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">Lini bisnis</span>
            <FilterMultiSelect
              label="Lini bisnis"
              layout="bar"
              ariaLabel="Filter lini bisnis"
              values={lineIds}
              options={lineOptions}
              disabled={loading}
              formatValue={summarize("Semua lini")}
              onApply={setLineIds}
              onReset={() => setLineIds([])}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">Bulan</span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Bulan sebelumnya"
              onClick={() => setBack((n) => n + 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <b className="min-w-32 text-center text-sm">
              {current.label} {current.year}
            </b>
            <Button
              variant="outline"
              size="sm"
              aria-label="Bulan berikutnya"
              disabled={back === 0}
              onClick={() => setBack((n) => Math.max(0, n - 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="ml-auto text-xs text-muted">
            Pilih satu lini untuk melihat laba rugi lengkap lini itu
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">Tampilan</span>
            <FilterPills<View>
              ariaLabel="Tampilan laba rugi"
              value={view}
              options={[
                { value: "gabungan", label: "Gabungan" },
                { value: "lini", label: "Per lini bisnis" },
              ]}
              onChange={setView}
            />
          </div>
          {view === "lini" && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() =>
                setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.key)))
              }
            >
              {allOpen ? "Tutup semua" : "Buka semua"}
            </Button>
          )}
        </div>
      </div>

      {statement === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat laba rugi…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <Table className={loading ? "opacity-60" : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[34%]">Uraian</TableHead>
                {months.map((m) => (
                  <TableHead key={m.dateFrom} className="text-right">
                    {m.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <Fragment key={row.key}>
                  <StatementLine
                    row={row}
                    column={0}
                    label={row.label}
                    expander={
                      view === "lini"
                        ? { open: open.has(row.key), onToggle: () => toggle(row.key) }
                        : undefined
                    }
                  />
                  {view === "lini" &&
                    open.has(row.key) &&
                    statement.columns.map((col, i) => (
                      <StatementLine
                        key={col.id ?? "shared"}
                        row={row}
                        column={i + 1}
                        label={col.label}
                        child
                      />
                    ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-xl border border-border border-l-[3px] border-l-primary bg-surface px-4 py-3">
        <p className="text-sm font-bold text-foreground">Cara membaca</p>
        <p className="mt-0.5 text-xs text-muted">
          Angka yang berubah {CHANGE_THRESHOLD}% atau lebih dari bulan sebelumnya
          diberi label di bawahnya: hijau kalau menguntungkan (pendapatan atau
          laba naik, biaya turun), merah kalau merugikan. Perubahan{" "}
          {CHANGE_BIG}% atau lebih juga diberi warna tipis pada selnya. Laba
          bersih di sini sama dengan laba bersih di Beranda dan menjadi laba
          tahun berjalan di Neraca.{" "}
          {view === "lini"
            ? "Kategori bertanda Bersama (sewa, utilitas, gaji admin) dibagi ke tiap lini memakai dasar yang diatur di Pengaturan > Keuangan > Lini bisnis. Kategori lain dibebankan langsung ke lini."
            : "Di versi engineering, tiap angka bisa diklik ke saldo per akun, lalu mutasi jurnal, lalu dokumen sumber."}
        </p>
      </div>
    </div>
  );
}

/** One row of the statement for one column (0 = whole shop, 1.. = a lini). */
function StatementLine({
  row,
  column,
  label,
  child,
  expander,
}: {
  row: StatementRow;
  column: number;
  label: string;
  child?: boolean;
  expander?: { open: boolean; onToggle: () => void };
}) {
  return (
    <TableRow
      className={cn(
        "hover:bg-transparent",
        !child && row.kind === "b" && "bg-surface-selected font-bold",
      )}
    >
      <TableCell
        className={cn(
          "py-2.5 text-sm",
          child
            ? "pl-14 text-muted"
            : row.kind === "i" && !expander
              ? "pl-8 text-muted"
              : "pl-4 font-semibold",
        )}
      >
        {expander ? (
          <button
            type="button"
            aria-expanded={expander.open}
            onClick={expander.onToggle}
            className="inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ChevronRight
              className={cn("size-4 text-muted transition", expander.open && "rotate-90")}
              aria-hidden
            />
            {label}
          </button>
        ) : (
          label
        )}
      </TableCell>
      {row.v.map((perMonth, m) => {
        const value = perMonth[column];
        const previous = m > 0 ? row.v[m - 1][column] : undefined;
        const change = !row.pct && m > 0 ? changeOf(row, value, previous) : null;
        const shown = change !== null && Math.abs(change.pct) >= CHANGE_THRESHOLD;
        const big = shown && Math.abs(change.pct) >= CHANGE_BIG;

        return (
          <TableCell
            key={m}
            className={cn(
              "py-2.5 text-right text-sm tabular-nums whitespace-nowrap",
              child && "text-muted",
              big && (change.bad ? "bg-[#FDF3F2]" : "bg-[#F1FAF4]"),
            )}
          >
            {format(value, row.pct)}
            {shown && (
              <div className="mt-0.5">
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-full px-2 text-xs font-bold",
                    change.bad ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700",
                  )}
                >
                  {change.pct > 0 ? "▲" : "▼"} {Math.abs(Math.round(change.pct))}%
                </span>
              </div>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/** Percent change vs the month before, and whether that move is bad news. */
function changeOf(
  row: StatementRow,
  value: StatementValue,
  previous: StatementValue | undefined,
): { pct: number; bad: boolean } | null {
  if (typeof value !== "string" || typeof previous !== "string") return null;
  let pct = changeAgainst(value, previous);
  if (pct === null) return null;
  // A discount is stored negative: a larger magnitude is a lower figure, but it
  // is the same event as a cost rising, so read its direction the other way.
  if (row.invert) pct = -pct;
  return { pct, bad: row.riseIsBad ? pct > 0 : pct < 0 };
}

function format(value: StatementValue, pct?: boolean): string {
  if (pct) return typeof value === "number" ? formatPercent(value) : "—";
  if (typeof value !== "string") return "—";
  if (value.startsWith("-")) return `−${formatMoney(absDecimal(value))}`;
  return formatMoney(value);
}
