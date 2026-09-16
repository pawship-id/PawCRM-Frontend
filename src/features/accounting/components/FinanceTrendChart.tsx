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
import { formatMoney, formatMoneyShort, toMinor } from "@/utils/decimal";
import type { JournalTrendDay } from "@/services/journalEntry.service";

import { formatDate } from "../labels";

/**
 * Kotor vs bersih over the last seven days — the Ringkasan tab's one chart.
 *
 * TWO SERIES ON ONE AXIS, and that is not a detail. Both are rupiah over the
 * same days, so they share a scale and the DISTANCE BETWEEN THE LINES is the
 * thing worth reading: a week where both climb is growth, one where only the top
 * line climbs is a week that sold more and kept less. A second y-axis would
 * invent a relationship the numbers do not have, which is the single most common
 * way a dashboard chart lies.
 *
 * IT IS NOT A SPARKLINE. Seven points is few enough to label and to hover, so it
 * carries axes, a legend, an end label per series, a crosshair readout and a
 * table view — everything needed to get a number out of it without a mouse.
 *
 * THE COLOURS ARE `--chart-gross` AND `--chart-net`, which exist for this and
 * nothing else. The brand's own navy-700 and orange-500 FAIL a categorical
 * palette's checks — too dark and too grey, and 2.27:1 on white respectively —
 * and orange already means "a human must act" in this product. See globals.css.
 *
 * ZEROS ARE POINTS, NOT GAPS. The API returns every day in the range including
 * the ones with no trading, so the line never jumps a day — see
 * `GET /journal-entries/trend`.
 */
export function FinanceTrendChart({
  days,
  loading,
  error,
  onRetry,
}: {
  days: JournalTrendDay[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();

  const points = useMemo(() => days.map(toPoint), [days]);
  const scale = useMemo(() => niceScale(points), [points]);

  if (error) {
    return (
      <div className="px-2 py-10 text-center">
        <p className="font-semibold text-foreground">Tren 7 hari gagal dimuat.</p>
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

  if (loading && points.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 px-2 py-16 text-sm text-muted">
        <Spinner size={16} />
        Memuat tren 7 hari…
      </div>
    );
  }

  /*
    NO POINTS AND ALL-ZERO POINTS ARE THE SAME SENTENCE, and the second is the
    one that actually happens: the API returns a point for every day in the
    range, so a tenant that has not traded this week gets seven zeros rather than
    an empty array. Drawn, that is two flat lines along the bottom of an axis
    with nothing on it — which reads as a broken chart rather than as a quiet
    week. The words are the honest rendering of the same fact.
  */
  if (points.length === 0 || points.every(isQuiet)) {
    return (
      <p className="px-2 py-10 text-center text-sm text-muted">
        Belum ada pendapatan atau beban tercatat di tujuh hari terakhir.
      </p>
    );
  }

  const last = points[points.length - 1];

  return (
    <div className={cn("flex flex-col gap-3", loading && "opacity-50")}>
      {/*
        THE LEGEND IS ALWAYS THERE FOR TWO SERIES. Identity must not rest on
        colour alone — a line key beside a word, and the word wears a TEXT token
        rather than the series colour, which would be illegible as text and would
        make the reader match hues to read a label.
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendKey className="bg-chart-gross" label="Kotor (pendapatan)" />
        <LegendKey className="bg-chart-net" label="Bersih (laba)" />
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
        <TrendTable points={points} />
      ) : (
        <Plot
          points={points}
          scale={scale}
          hovered={hovered}
          onHover={setHovered}
          titleId={titleId}
        />
      )}

      {/*
        The endpoint values, spelled out. A number on every point would be chaos
        and go unread; the two that matter — where the week ENDED — ride under
        the chart where they cannot collide with the lines, and every other value
        is a hover, a keyboard focus or the table away.
      */}
      {!asTable && (
        <p className="text-xs text-muted">
          Terakhir ({formatDate(last.date)}): kotor{" "}
          <b className="font-semibold tabular-nums text-foreground">
            {formatMoney(last.revenueRaw)}
          </b>
          , bersih{" "}
          <b className="font-semibold tabular-nums text-foreground">
            {formatMoney(last.netRaw)}
          </b>
          .
        </p>
      )}
    </div>
  );
}

function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className={cn("h-0.5 w-5 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}

/* --------------------------------------------------------------- the plot */

/**
 * The drawing itself, in a `viewBox` that scales to whatever width it is given.
 *
 * THE HEIGHT INCLUDES THE AXIS BAND. A container sized to the plot alone leaves
 * the day labels outside it and gives the card a tiny nested scrollbar.
 */
const W = 760;
const H = 216;
const PAD = { left: 72, right: 20, top: 14, bottom: 30 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function Plot({
  points,
  scale,
  hovered,
  onHover,
  titleId,
}: {
  points: TrendPoint[];
  scale: Scale;
  hovered: number | null;
  onHover: (index: number | null) => void;
  titleId: string;
}) {
  const x = (index: number) =>
    points.length === 1
      ? PAD.left + PLOT_W / 2
      : PAD.left + (index * PLOT_W) / (points.length - 1);

  const y = (value: number) =>
    PAD.top + PLOT_H - ((value - scale.min) / (scale.max - scale.min)) * PLOT_H;

  const path = (read: (point: TrendPoint) => number) =>
    points
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(read(point)).toFixed(1)}`,
      )
      .join(" ");

  const active = hovered === null ? null : points[hovered];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        role="img"
        aria-labelledby={titleId}
        /*
          FOCUSABLE, AND THE ARROWS MOVE THE CROSSHAIR. A readout reachable only
          by pointer is a readout half the readers cannot have — and the same
          values are in the table view either way, so the hover layer enhances
          rather than gates.
        */
        tabIndex={0}
        onBlur={() => onHover(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const step = event.key === "ArrowRight" ? 1 : -1;
            const next = (hovered ?? (step > 0 ? -1 : points.length)) + step;
            onHover(Math.max(0, Math.min(points.length - 1, next)));
          }
          if (event.key === "Escape") onHover(null);
        }}
        onMouseLeave={() => onHover(null)}
      >
        <title id={titleId}>
          Tren pendapatan kotor dan laba bersih, {points.length} hari terakhir.
          Tekan panah kiri dan kanan untuk membaca angka tiap hari.
        </title>

        {/* Gridlines: solid hairlines one step off the surface, never dashed —
            a dashed grid reads as a threshold when it is only a ruler. */}
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
              {tickLabel(tick)}
            </text>
          </g>
        ))}

        {/* The zero rule, drawn only when the scale crosses it — a net-profit
            line below this is a losing day, and without the rule there is
            nothing on the chart that says where losing starts. */}
        {scale.min < 0 && (
          <line
            x1={PAD.left}
            y1={y(0)}
            x2={W - PAD.right}
            y2={y(0)}
            className="stroke-muted"
            strokeWidth={1}
          />
        )}

        <path
          d={path((point) => point.revenue)}
          fill="none"
          className="stroke-chart-gross"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path((point) => point.net)}
          fill="none"
          className="stroke-chart-net"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Markers carry a 2px ring in the surface colour so they stay legible
            where the two lines cross each other. A stroke around a mark to
            separate it would be ink that is not data; the ring is the gap. */}
        {points.map((point, index) => (
          <g key={point.date}>
            <circle
              cx={x(index)}
              cy={y(point.revenue)}
              r={4}
              className="fill-chart-gross stroke-surface"
              strokeWidth={2}
            />
            <circle
              cx={x(index)}
              cy={y(point.net)}
              r={4}
              className="fill-chart-net stroke-surface"
              strokeWidth={2}
            />
          </g>
        ))}

        {/* The crosshair finds the X — readers aim at a day, never at a 2px
            line. Drawn behind the readout, above the grid. */}
        {hovered !== null && (
          <line
            x1={x(hovered)}
            y1={PAD.top}
            x2={x(hovered)}
            y2={PAD.top + PLOT_H}
            className="stroke-muted"
            strokeWidth={1}
          />
        )}

        {points.map((point, index) => (
          <text
            key={`label-${point.date}`}
            x={x(index)}
            y={H - 8}
            textAnchor="middle"
            className={cn(
              "text-[13px]",
              hovered === index ? "fill-foreground" : "fill-muted",
            )}
          >
            {weekday(point.date)}
          </text>
        ))}

        {/*
          THE HIT ZONES ARE BANDS, NOT THE DOTS. An 8px marker is a pinpoint
          nobody lands on; a full-height band per day means the pointer only has
          to be nearest, which is what a reader is actually aiming for.
        */}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.date}`}
            x={x(index) - PLOT_W / (points.length * 2)}
            y={PAD.top}
            width={PLOT_W / points.length}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => onHover(index)}
          />
        ))}
      </svg>

      {active && (
        <Readout
          point={active}
          /* Percent of the box, because the SVG scales and its user units do
             not survive into the HTML layer. */
          left={(x(hovered as number) / W) * 100}
        />
      )}
    </div>
  );
}

/**
 * The hovered day's two figures.
 *
 * VALUES LEAD, LABELS FOLLOW — the reader already has the series and wants the
 * number, so the amount is the strong element and the name is secondary. That is
 * the legend's hierarchy, inverted on purpose.
 */
function Readout({ point, left }: { point: TrendPoint; left: number }) {
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 w-max max-w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 shadow-md"
      style={{
        // Clamped so a readout on the first or last day does not hang off the
        // card; the arrow-key walk reaches both ends, so both happen.
        left: `clamp(5rem, ${left}%, calc(100% - 5rem))`,
      }}
      role="status"
    >
      <p className="text-xs font-semibold text-foreground">
        {formatDate(point.date)}
      </p>
      <ReadoutRow
        className="bg-chart-gross"
        label="Kotor"
        value={formatMoney(point.revenueRaw)}
      />
      <ReadoutRow
        className="bg-chart-net"
        label="Bersih"
        value={formatMoney(point.netRaw)}
      />
    </div>
  );
}

function ReadoutRow({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: string;
}) {
  return (
    <p className="mt-1 flex items-baseline gap-2 text-xs">
      <span className={cn("h-0.5 w-3 rounded-full", className)} aria-hidden />
      <b className="font-semibold tabular-nums text-foreground">{value}</b>
      <span className="text-muted">{label}</span>
    </p>
  );
}

/**
 * The chart's table twin — the same numbers, with no colour in the way.
 *
 * Not a fallback for a failure: it is the WCAG-clean equivalent every chart owes
 * a reader who cannot use the plot, and the place a value lives when the chart
 * chose not to print it.
 */
function TrendTable({ points }: { points: TrendPoint[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            <TableHead className="text-right">Kotor</TableHead>
            <TableHead className="text-right">Bersih</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((point) => (
            <TableRow key={point.date}>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatDate(point.date)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(point.revenueRaw)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(point.netRaw)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------------------------------------- the scale */

interface TrendPoint {
  date: string;
  /** Rupiah as a number — GEOMETRY ONLY. The printed figures use `*Raw`. */
  revenue: number;
  net: number;
  revenueRaw: string;
  netRaw: string;
}

interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * A decimal string as whole rupiah.
 *
 * `Number` HERE IS PIXEL ARITHMETIC, nothing else — the value that gets PRINTED
 * is always the original string through `formatMoney`. Money never round-trips
 * through a float on its way to a reader.
 */
function rupiah(value: string): number {
  const minor = toMinor(value);
  return minor === null ? 0 : Number(minor) / 10_000;
}

function toPoint(day: JournalTrendDay): TrendPoint {
  return {
    date: day.date,
    revenue: rupiah(day.revenue),
    net: rupiah(day.netProfit),
    revenueRaw: day.revenue,
    netRaw: day.netProfit,
  };
}

/** A day the ledger recorded neither income nor cost on. */
function isQuiet(point: TrendPoint): boolean {
  return point.revenue === 0 && point.net === 0;
}

/**
 * Round tick values covering both series, and the domain they imply.
 *
 * ZERO IS ALWAYS IN THE DOMAIN. A chart of money that floated its baseline would
 * exaggerate every wobble into a cliff — and the net line genuinely goes
 * negative on a losing day, which only reads as a loss if zero is on the canvas.
 *
 * A FLAT WEEK IS NOT A DIVISION BY ZERO. Seven identical days collapse the
 * domain, so a floor keeps the line on a real axis instead of on a scale of no
 * height. Seven ZEROS never reach here — those are words, not a chart.
 */
function niceScale(points: TrendPoint[]): Scale {
  const values = points.flatMap((point) => [point.revenue, point.net]);
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);

  const step = niceStep((rawMax - rawMin) / 4);
  const min = Math.floor(rawMin / step) * step;
  // THE FLOOR IS APPLIED BEFORE THE TICKS, not after — building them from the
  // unfloored max is how a flat week ends up with a single gridline and a line
  // lying on it.
  const max = Math.max(Math.ceil(rawMax / step) * step, min + step);

  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) {
    ticks.push(Math.round(tick));
  }

  return { min, max, ticks };
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

/**
 * An axis tick — the short form WITHOUT the currency.
 *
 * "Rp 38,1 jt" right-anchored into the gutter runs past the left edge of the
 * viewBox at every width, and a clipped axis label is worse than a short one.
 * The currency is said once, by the card, and repeated on every figure the chart
 * actually prints; an axis is a ruler and reads as one.
 *
 * Still routed through `formatMoneyShort` rather than divided here, so the
 * rb/jt/M thresholds are the same ones the rest of the product uses.
 */
function tickLabel(value: number): string {
  return formatMoneyShort(String(value)).replace(/^Rp\s*/, "");
}

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * "Sen" for a `"2026-09-14"`.
 *
 * Built from UTC parts and read back as UTC. `new Date("2026-09-14")` is midnight
 * UTC, and asking a browser west of Greenwich for its local weekday would answer
 * with the day before.
 */
function weekday(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  return WEEKDAYS[at.getUTCDay()] ?? "";
}
