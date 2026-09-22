"use client";

import { useId, useMemo, useState } from "react";

import { Spinner } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatMoneyShort,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type { JournalTrendDay } from "@/services/journalEntry.service";

import { lineLabel } from "../financeSummary";
import { formatDate } from "../labels";

/**
 * Pendapatan over the last seven days, stacked per lini bisnis — the Ringkasan
 * tab's one chart since the v3 mockup (22 September 2026). It replaced "kotor
 * vs bersih"; the laba side of that picture is the P&L panel below it now.
 *
 * STACKED BARS, because the question is two at once: how big was each day, and
 * who made it. The total is the bar's height; the lini are its parts.
 *
 * COLOUR FOLLOWS THE LINI, NOT ITS RANK. `lineOrder` is the tenant's own list of
 * business lines, and slot n is the n-th of them — so Grooming is the same
 * colour this week and next, filtered or not. Only five slots are validated; a
 * sixth line, and the unattributed bucket, fold into "Lainnya" in a neutral
 * grey rather than into a generated hue. See `--chart-line-*` in globals.css.
 *
 * PENDAPATAN AFTER DISKON & RETUR — the income class, contra accounts included,
 * exactly what `/trend` calls `revenue`. A day where returns outweighed a
 * line's sales is drawn as zero for that line (a stack cannot hold a negative
 * part without lying about the others) and printed as its real, negative
 * figure in the readout and the table.
 */
const SLOT_CLASSES = [
  { fill: "fill-chart-line-1", bg: "bg-chart-line-1" },
  { fill: "fill-chart-line-2", bg: "bg-chart-line-2" },
  { fill: "fill-chart-line-3", bg: "bg-chart-line-3" },
  { fill: "fill-chart-line-4", bg: "bg-chart-line-4" },
  { fill: "fill-chart-line-5", bg: "bg-chart-line-5" },
] as const;
const OTHER = { fill: "fill-chart-other", bg: "bg-chart-other" } as const;
const OTHER_KEY = "__other__";

interface Series {
  key: string;
  label: string;
  fill: string;
  bg: string;
}

interface Bar {
  date: string;
  /** Per series key, in minor units — the printed figure. */
  values: Map<string, bigint>;
  total: bigint;
}

export function LineRevenueChart({
  days,
  names,
  lineOrder,
  loading,
  error,
  onRetry,
}: {
  days: JournalTrendDay[];
  /** business line id → name. */
  names: Map<string, string>;
  /** The tenant's business line ids, in the order that assigns colour slots. */
  lineOrder: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();

  const { series, bars } = useMemo(
    () => buildSeries(days, names, lineOrder),
    [days, names, lineOrder],
  );

  if (error) {
    return (
      <div className="px-2 py-10 text-center">
        <p className="font-semibold text-foreground">
          Pendapatan 7 hari gagal dimuat.
        </p>
        <p className="mt-1 text-sm text-muted">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md text-sm font-semibold text-primary transition hover:text-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Muat ulang
        </button>
      </div>
    );
  }

  if (loading && bars.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 px-2 py-16 text-sm text-muted">
        <Spinner size={16} />
        Memuat pendapatan 7 hari…
      </div>
    );
  }

  /*
    SEVEN ZEROS ARE A SENTENCE, NOT A CHART. The API returns every day in the
    window, so a shop that sold nothing this week gets seven empty bars — which
    reads as a broken chart rather than as a quiet week.
  */
  if (bars.length === 0 || bars.every((bar) => bar.total === 0n)) {
    return (
      <p className="px-2 py-10 text-center text-sm text-muted">
        Belum ada pendapatan tercatat di tujuh hari terakhir.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", loading && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/*
          A LEGEND WHENEVER THERE IS MORE THAN ONE PART. Identity must not rest
          on colour alone; the word wears a text token and the swatch beside it
          carries the hue. One series needs none — the card title names it.
        */}
        {series.length > 1 &&
          series.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-2 text-xs text-muted"
            >
              <span className={cn("size-2.5 rounded-sm", item.bg)} aria-hidden />
              {item.label}
            </span>
          ))}
        <button
          type="button"
          onClick={() => setAsTable((open) => !open)}
          aria-pressed={asTable}
          className="ml-auto rounded-md text-xs font-semibold text-primary transition hover:text-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {asTable ? "Tampilkan grafik" : "Tampilkan tabel"}
        </button>
      </div>

      {asTable ? (
        <BarTable series={series} bars={bars} />
      ) : (
        <Plot
          series={series}
          bars={bars}
          hovered={hovered}
          onHover={setHovered}
          titleId={titleId}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the series */

function minor(value: string | null | undefined): bigint {
  return toMinor(value ?? "") ?? 0n;
}

/**
 * Days → one bar each, and the series they are drawn in.
 *
 * A series exists only if it earned something in the window — a lini that sold
 * nothing all week is not worth a legend entry. Series are ordered by their
 * SLOT, not by size, so the stack's order is as stable as its colours.
 */
function buildSeries(
  days: JournalTrendDay[],
  names: Map<string, string>,
  lineOrder: string[],
): { series: Series[]; bars: Bar[] } {
  const slotOf = new Map(
    lineOrder
      .slice(0, SLOT_CLASSES.length)
      .map((id, index) => [id, index] as const),
  );
  const keyOf = (businessLineId: string | null) =>
    businessLineId !== null && slotOf.has(businessLineId)
      ? businessLineId
      : OTHER_KEY;

  const seen = new Set<string>();
  const bars = days.map((day) => {
    const values = new Map<string, bigint>();
    for (const line of day.byBusinessLine ?? []) {
      const amount = minor(line.revenue);
      if (amount === 0n) continue;
      const key = keyOf(line.businessLineId);
      values.set(key, (values.get(key) ?? 0n) + amount);
      seen.add(key);
    }
    const total = [...values.values()].reduce((sum, value) => sum + value, 0n);
    return { date: day.date, values, total };
  });

  /*
    "LAINNYA" IS NAMED BY WHAT IS IN IT when it holds one thing. A week whose
    only unslotted revenue is the unattributed bucket should say "Bersama (HQ)",
    the label every other finance screen uses for it, not a vaguer word.
  */
  const otherMembers = new Set<string | null>();
  for (const day of days) {
    for (const line of day.byBusinessLine ?? []) {
      if (minor(line.revenue) !== 0n && keyOf(line.businessLineId) === OTHER_KEY) {
        otherMembers.add(line.businessLineId);
      }
    }
  }

  const series: Series[] = [...seen]
    .filter((key) => key !== OTHER_KEY)
    .sort((a, b) => (slotOf.get(a) ?? 0) - (slotOf.get(b) ?? 0))
    .map((key) => ({
      key,
      label: lineLabel(key, names),
      ...SLOT_CLASSES[slotOf.get(key) ?? 0],
    }));

  if (seen.has(OTHER_KEY)) {
    series.push({
      key: OTHER_KEY,
      label:
        otherMembers.size === 1
          ? lineLabel([...otherMembers][0], names)
          : "Lainnya",
      ...OTHER,
    });
  }

  return { series, bars };
}

/* --------------------------------------------------------------- the plot */

const W = 760;
const H = 216;
const PAD = { left: 72, right: 20, top: 14, bottom: 30 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/**
 * Minor units as whole rupiah — PIXEL ARITHMETIC ONLY. Every printed figure goes
 * through `formatMoney` from the original minor units.
 */
function px(value: bigint): number {
  return Number(value) / 10_000;
}

function Plot({
  series,
  bars,
  hovered,
  onHover,
  titleId,
}: {
  series: Series[];
  bars: Bar[];
  hovered: number | null;
  onHover: (index: number | null) => void;
  titleId: string;
}) {
  // Negative parts draw as zero (see the component note), so the stack's height
  // is the sum of the positive parts.
  const heights = bars.map((bar) =>
    series.reduce(
      (sum, item) => sum + Math.max(0, px(bar.values.get(item.key) ?? 0n)),
      0,
    ),
  );
  const scale = niceScale(Math.max(0, ...heights));
  const band = PLOT_W / bars.length;
  const barW = Math.min(56, band * 0.56);
  const y = (value: number) => PAD.top + PLOT_H - (value / scale.max) * PLOT_H;
  const active = hovered === null ? null : bars[hovered];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        onBlur={() => onHover(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const step = event.key === "ArrowRight" ? 1 : -1;
            const next = (hovered ?? (step > 0 ? -1 : bars.length)) + step;
            onHover(Math.max(0, Math.min(bars.length - 1, next)));
          }
          if (event.key === "Escape") onHover(null);
        }}
        onMouseLeave={() => onHover(null)}
      >
        <title id={titleId}>
          Pendapatan per lini bisnis, {bars.length} hari terakhir. Tekan panah
          kiri dan kanan untuk membaca angka tiap hari.
        </title>

        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              y1={y(tick)}
              x2={W - PAD.right}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-muted text-[13px] tabular-nums"
            >
              {formatMoneyShort(String(tick)).replace(/^Rp\s*/, "")}
            </text>
          </g>
        ))}

        {bars.map((bar, index) => {
          const x = PAD.left + index * band + (band - barW) / 2;
          let base = 0;
          return (
            <g
              key={bar.date}
              className={cn(
                "transition-opacity",
                hovered !== null && hovered !== index && "opacity-60",
              )}
            >
              {series.map((item) => {
                const value = Math.max(0, px(bar.values.get(item.key) ?? 0n));
                if (value === 0) return null;
                const top = y(base + value);
                const height = y(base) - top;
                base += value;
                return (
                  /*
                    A 2px SURFACE STROKE IS THE GAP between segments — without
                    it two neighbouring hues bleed into one block.
                  */
                  <rect
                    key={item.key}
                    x={x}
                    y={top}
                    width={barW}
                    height={Math.max(height, 0)}
                    className={cn(item.fill, "stroke-surface")}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          );
        })}

        {bars.map((bar, index) => (
          <text
            key={`label-${bar.date}`}
            x={PAD.left + index * band + band / 2}
            y={H - 8}
            textAnchor="middle"
            className={cn(
              "text-[13px]",
              hovered === index ? "fill-foreground" : "fill-muted",
            )}
          >
            {weekday(bar.date)}
          </text>
        ))}

        {/* Full-height hit bands — a reader aims at a day, not at a segment. */}
        {bars.map((bar, index) => (
          <rect
            key={`hit-${bar.date}`}
            x={PAD.left + index * band}
            y={PAD.top}
            width={band}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => onHover(index)}
          />
        ))}
      </svg>

      {active && (
        <Readout
          bar={active}
          series={series}
          left={((PAD.left + (hovered as number) * band + band / 2) / W) * 100}
        />
      )}
    </div>
  );
}

/** The hovered day: its total, then each lini that earned — value first. */
function Readout({
  bar,
  series,
  left,
}: {
  bar: Bar;
  series: Series[];
  left: number;
}) {
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 w-max max-w-64 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 shadow-md"
      style={{ left: `clamp(6rem, ${left}%, calc(100% - 6rem))` }}
      role="status"
    >
      <p className="text-xs font-semibold text-foreground">
        {formatDate(bar.date)} ·{" "}
        <span className="tabular-nums">
          {formatMoney(toDecimalString(bar.total))}
        </span>
      </p>
      {series
        .filter((item) => bar.values.has(item.key))
        .map((item) => (
          <p key={item.key} className="mt-1 flex items-baseline gap-2 text-xs">
            <span className={cn("size-2 rounded-sm", item.bg)} aria-hidden />
            <b className="font-semibold tabular-nums text-foreground">
              {formatMoney(toDecimalString(bar.values.get(item.key) ?? 0n))}
            </b>
            <span className="text-muted">{item.label}</span>
          </p>
        ))}
    </div>
  );
}

/** The chart's table twin — every value, no colour in the way. */
function BarTable({ series, bars }: { series: Series[]; bars: Bar[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            {series.map((item) => (
              <TableHead key={item.key} className="text-right">
                {item.label}
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bars.map((bar) => (
            <TableRow key={bar.date}>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatDate(bar.date)}
              </TableCell>
              {series.map((item) => (
                <TableCell key={item.key} className="text-right tabular-nums">
                  {formatMoney(toDecimalString(bar.values.get(item.key) ?? 0n))}
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">
                {formatMoney(toDecimalString(bar.total))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------------------------------------- the scale */

/** Round ticks from zero to a little above the tallest bar. */
function niceScale(rawMax: number): { max: number; ticks: number[] } {
  const step = niceStep(rawMax / 4);
  const max = Math.max(Math.ceil(rawMax / step) * step, step);
  const ticks: number[] = [];
  for (let tick = 0; tick <= max + step / 2; tick += step) {
    ticks.push(Math.round(tick));
  }
  return { max, ticks };
}

/** 1, 2 or 5 × a power of ten — the steps an axis is read in. */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 100_000;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  if (normalised <= 1) return magnitude;
  if (normalised <= 2) return 2 * magnitude;
  if (normalised <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** "Sen" for `"2026-09-14"`, read in UTC so no browser shifts the day. */
function weekday(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}
