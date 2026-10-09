"use client";

import { cn } from "@/lib/utils";
import type { GroomerWeekDay } from "@/types/groomer";
import { dayName, dayNumber } from "../dates";

/**
 * The seven days of the week, Monday first. Each shows how many turns THIS
 * groomer has that day, so an empty Thursday reads as empty before it is opened.
 *
 * A SCROLL ROW, not a grid: seven 44 px targets plus gaps are wider than a small
 * phone, and a cramped target is worse than one that scrolls.
 */
export function DayStrip({
  week,
  selected,
  onSelect,
}: {
  week: GroomerWeekDay[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Pilih hari"
      className="flex gap-1.5 overflow-x-auto border-b border-border bg-surface px-3 pb-3 pt-2"
    >
      {week.map((day) => {
        const on = day.date === selected;

        return (
          <button
            key={day.date}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(day.date)}
            className={cn(
              "relative flex min-h-[4.25rem] min-w-12 flex-none flex-col items-center justify-center rounded-xl border px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground hover:bg-surface-hover",
            )}
          >
            <span className={cn("text-xs font-semibold", on ? "text-primary-foreground/80" : "text-muted")}>
              {dayName(day.date)}
            </span>
            <span className="font-display text-base font-extrabold tabular-nums leading-tight">
              {dayNumber(day.date)}
            </span>
            <span className={cn("text-xs tabular-nums", on ? "text-primary-foreground/80" : "text-muted")}>
              {day.mine > 0 ? `${day.mine} job` : "—"}
            </span>
            {day.isToday && (
              <>
                {/* The dot is a fill, so orange is allowed; the word is for screen readers. */}
                <span aria-hidden="true" className="absolute bottom-1 size-1.5 rounded-full bg-secondary" />
                <span className="sr-only">hari ini</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
