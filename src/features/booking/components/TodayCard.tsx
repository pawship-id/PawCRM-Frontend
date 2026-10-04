"use client";

import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { clockOf } from "../day";
import type { TodayRow, TodaySlice } from "../today";
import { BookingStatusBadge } from "./BookingStatusBadge";

/**
 * The left edge says how far along the work is, WITHOUT being the only thing
 * that does — every card carries its status as a word too (§1.3). It is there
 * so a column of twenty answers "what is on the table right now" before
 * anybody reads a line of it.
 */
function edgeOf(row: TodayRow): string {
  if (row.booking.status === "cancelled") return "border-l-border";
  if (row.booking.status === "in_progress") return "border-l-secondary";
  if (row.billing === "invoiced" || row.billing === "paid") {
    return "border-l-success";
  }
  return "border-l-primary";
}

/**
 * One booking on the board — the mockup's `.xi`.
 *
 * A BUTTON, because it opens the panel beside it rather than navigating. The
 * way INTO the booking is in the panel ("Buka detail"), so a card is never a
 * link somebody middle-clicks and loses their place to.
 */
export function TodayCard({
  row,
  selected,
  onSelect,
  /** The week view has no room for the badge row. */
  dense = false,
}: {
  row: TodayRow;
  selected: boolean;
  onSelect: (key: string) => void;
  dense?: boolean;
}) {
  const { booking } = row;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${booking.petName ?? "Hewan"} · ${row.service.name}`}
      onClick={() => onSelect(row.key)}
      className={cn(
        "w-full rounded-xl border border-l-4 border-border bg-surface px-3 py-2 text-left transition hover:bg-surface-hover focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        edgeOf(row),
        selected && "bg-navy-100 hover:bg-navy-100",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-foreground">
          {booking.petName ?? "—"}
        </span>
        <span className="text-xs tabular-nums text-muted">
          {clockOf(booking.scheduledAt)}
        </span>
      </span>

      {/*
        THE LINE UNDER THE NAME IS THE WORK, not the customer (16 September
        2026, on request, and it is what the mockup draws): a column of a dog's
        name over its owner's name answers a question nobody asks a day sheet —
        what is being DONE is. The customer is one click away, in the panel.
      */}
      <span className="mt-0.5 block truncate text-xs text-muted">
        {row.service.name}
      </span>

      {!dense && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          <BookingStatusBadge status={booking.status} />

          {/*
            WHO IS ON IT, and "Belum ditentukan" when nobody is — which is the
            ordinary state of a booking taken over the phone, and the one the
            board exists to make somebody notice.
          */}
          <Badge
            variant="outline"
            className="max-w-[12rem] truncate border-transparent bg-tint-neutral text-muted"
          >
            {row.groomers.length
              ? row.groomers.map((who) => who.name).join(", ")
              : "Belum ditentukan"}
          </Badge>

          {row.durationMin !== null && (
            <Badge
              variant="outline"
              className="border-transparent bg-tint-neutral tabular-nums text-muted"
            >
              {row.durationMin} mnt
            </Badge>
          )}

          {/* Staff-facing only — the customer's note is not a warning. */}
          {booking.internalNotes && (
            <Badge
              variant="outline"
              className="border-transparent bg-tint-warning text-warning"
            >
              <TriangleAlert className="size-4" aria-hidden />
              Catatan
            </Badge>
          )}
        </span>
      )}
    </button>
  );
}

/**
 * The tokens a composition bar cycles through.
 *
 * NO ORANGE. §4 spends it on "a human must act", which on this screen is an
 * animal on the table — a bar slice standing for "Hotel" would be the second
 * orange thing on the page, and §4 says one of them is then wrong.
 */
const SLICE_TONES = ["bg-primary", "bg-info", "bg-success", "bg-muted"];

export function sliceTone(index: number): string {
  return SLICE_TONES[index % SLICE_TONES.length];
}

/**
 * What a day is made of, as one bar — the mockup's `.wmix`.
 *
 * IT IS NEVER THE ONLY TELLING. The legend under the grid names every colour,
 * and the cell under it carries the counts as text; the bar is the shape you
 * see from across the room, not the answer.
 */
export function TodayMixBar({
  slices,
  lines,
}: {
  slices: TodaySlice[];
  /** Every line on screen, in legend order — fixes each slice's colour. */
  lines: string[];
}) {
  if (slices.length === 0) {
    return <span className="mt-1 block h-1.5 rounded-full bg-surface-hover" />;
  }

  return (
    <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-hover">
      {slices.map((slice) => (
        <span
          key={slice.name}
          className={cn("block h-full", sliceTone(lines.indexOf(slice.name)))}
          style={{ width: `${slice.percent}%` }}
        />
      ))}
    </span>
  );
}

/** Which colour meant which line — always on screen, never a tooltip. */
export function TodayLegend({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {lines.map((line, index) => (
        <li key={line} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2.5 rounded-sm", sliceTone(index))}
          />
          {line}
        </li>
      ))}
    </ul>
  );
}
