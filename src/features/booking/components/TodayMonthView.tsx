"use client";

import { cn } from "@/lib/utils";

import {
  hoursMinutes,
  longDayOf,
  monthGrid,
  outsideMonth,
  WEEKDAY_NAMES,
} from "../day";
import { mixOn, summariseTodayDay, type TodayRow } from "../today";
import { TodayLegend, TodayMixBar } from "./TodayCard";

/**
 * The month — one cell per day, each saying how much work is on it.
 *
 * EACH LINE OF BUSINESS COUNTS ITSELF. The mockup reports grooming as a count
 * and the hotel as a percentage of its rooms; there is no room table here, so
 * every line is counted the same way and the minutes ride under it. Forcing the
 * three into one number would hide which kind of work the day is actually full
 * of.
 *
 * DAYS OUTSIDE THE MONTH ARE DRAWN AND DEAD — the grid keeps six rows so the
 * page below it never jumps, and a cell nobody can open carries nothing to
 * mislead a reader into counting it.
 */
export function TodayMonthView({
  rows,
  anchor,
  today,
  lines,
  onOpenDay,
}: {
  rows: TodayRow[];
  /** Any day in the month being drawn. */
  anchor: string;
  today: string;
  lines: string[];
  onOpenDay: (day: string) => void;
}) {
  const days = monthGrid(anchor);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_NAMES.map((name) => (
          <p
            key={name}
            className="py-1 text-center text-xs font-bold text-muted"
          >
            {name}
          </p>
        ))}

        {days.map((day) => {
          const outside = outsideMonth(day, anchor);
          const summary = summariseTodayDay(rows, day);

          if (outside) {
            return (
              <div
                key={day}
                aria-hidden
                className="min-h-24 rounded-xl border border-border bg-surface-hover opacity-40"
              />
            );
          }

          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={`${longDayOf(day)} · ${summary.count} booking`}
              className={cn(
                "flex min-h-24 flex-col gap-1 rounded-xl border bg-surface px-2 py-2 text-left transition hover:bg-surface-hover focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                day === today ? "border-primary" : "border-border",
              )}
            >
              <span className="text-sm font-bold tabular-nums text-foreground">
                {Number(day.slice(-2))}
              </span>

              {summary.lines.length === 0 ? (
                <span className="text-xs text-muted">—</span>
              ) : (
                summary.lines.map((line) => (
                  <span
                    key={line.name}
                    className="truncate text-xs tabular-nums text-muted"
                  >
                    {line.count} {line.name}
                    {line.minutes > 0 && ` · ${hoursMinutes(line.minutes)}`}
                  </span>
                ))
              )}

              {summary.trips > 0 && (
                <span className="text-xs tabular-nums text-muted">
                  {summary.trips} antar-jemput
                </span>
              )}

              <span className="mt-auto block">
                <TodayMixBar slices={mixOn(rows, day)} lines={lines} />
              </span>
            </button>
          );
        })}
      </div>

      <TodayLegend lines={lines} />
    </div>
  );
}
