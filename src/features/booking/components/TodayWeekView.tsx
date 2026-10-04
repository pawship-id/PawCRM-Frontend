"use client";

import { cn } from "@/lib/utils";

import { addDays, WEEKDAY_NAMES } from "../day";
import { mixOn, rowsOn, summariseTodayDay, type TodayRow } from "../today";
import { TodayCard, TodayLegend, TodayMixBar } from "./TodayCard";

/** How many cards fit a column before the rest are counted rather than listed. */
const SHOWN = 4;

/**
 * The week — seven days side by side, each a short stack.
 *
 * SUMMARISED, NOT DRAWN HOUR BY HOUR. Seven days of half-hour slots is a grid
 * nobody can read on a laptop, and what the week is actually asked is "which day
 * is full" — so it answers in counts, and the day is one click away.
 *
 * THE HEADER IS THE CLICK TARGET, and it opens that day in the daily view. A
 * card opens the panel, the way it does everywhere else on this screen.
 */
export function TodayWeekView({
  rows,
  from,
  today,
  lines,
  selected,
  onSelect,
  onOpenDay,
}: {
  rows: TodayRow[];
  /** The Monday the week starts on. */
  from: string;
  today: string;
  /** Every line on screen, in legend order — fixes each bar's colours. */
  lines: string[];
  selected: string | null;
  onSelect: (key: string) => void;
  onOpenDay: (day: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-flow-col auto-cols-[minmax(10.5rem,1fr)] gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const here = rowsOn(rows, day);
          const summary = summariseTodayDay(rows, day);

          return (
            <section
              key={day}
              aria-label={day}
              className={cn(
                "overflow-hidden rounded-xl border bg-surface",
                day === today ? "border-primary" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(day)}
                className={cn(
                  "w-full border-b border-border px-3 py-2 text-left transition hover:bg-surface-hover focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  day === today && "bg-navy-100",
                )}
              >
                <span className="block text-xs font-bold text-muted">
                  {WEEKDAY_NAMES[(new Date(`${day}T00:00:00`).getDay() + 6) % 7]}
                  {day === today && " · hari ini"}
                </span>
                <span className="block text-lg font-extrabold tabular-nums text-foreground">
                  {Number(day.slice(-2))}
                </span>
                <TodayMixBar slices={mixOn(rows, day)} lines={lines} />
              </button>

              <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto p-2">
                {here.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted">
                    Kosong
                  </p>
                ) : (
                  <>
                    <p className="px-1 text-xs tabular-nums text-muted">
                      {summary.count} booking
                      {summary.trips > 0 && ` · ${summary.trips} antar-jemput`}
                    </p>
                    {here.slice(0, SHOWN).map((row) => (
                      <TodayCard
                        key={row.key}
                        row={row}
                        selected={selected === row.key}
                        onSelect={onSelect}
                        dense
                      />
                    ))}
                    {here.length > SHOWN && (
                      <button
                        type="button"
                        onClick={() => onOpenDay(day)}
                        className="rounded px-1 text-left text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        +{here.length - SHOWN} lagi — buka harian
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <TodayLegend lines={lines} />
    </div>
  );
}
