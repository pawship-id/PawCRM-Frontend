"use client";

import { Badge } from "@/components/ui/badge";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";

import {
  columnsOn,
  groupsOf,
  HOTEL_COLUMN,
  TRIP_COLUMN,
  type TodayRow,
} from "../today";
import { TodayCard } from "./TodayCard";

/**
 * Static class names, because Tailwind reads this file rather than the running
 * page — a computed `xl:grid-cols-${n}` compiles to nothing at all.
 */
const WIDE_COLUMNS: Record<number, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
};

/**
 * The two columns the mockup draws that no record can fill yet.
 *
 * ON THE BOARD AND DISABLED, on request (16 September 2026) — not left off. A
 * shop reading this screen every morning should be able to see where penitipan
 * and antar-jemput will appear, and a column badged "Segera" says that in a way
 * an absence cannot. Neither one is faked with rows.
 *
 * HOTEL IS SKIPPED WHERE IT IS REAL: a tenant that already books a line called
 * Hotel gets the live column instead, never both.
 */
const PENDING_COLUMNS: { name: string; blockedBy: string }[] = [
  {
    name: HOTEL_COLUMN,
    blockedBy:
      "Penitipan belum ada di sistem — kamar, check-in, dan check-out belum bisa dicatat.",
  },
  {
    name: TRIP_COLUMN,
    blockedBy:
      "Jemput dan antar belum jadi catatan sendiri — belum ada jam berangkat, driver, dan zona. Permintaannya sementara ada di rincian bookingnya.",
  },
];

/**
 * The day, one column per line of business — the mockup's `.xl`.
 *
 * A LINE WITH NOTHING ON IT IS NOT DRAWN, which is the mockup's own rule and the
 * reason this screen suits a shop that only grooms as well as one that also
 * boards: the columns are read off the day (see `columnsOn`). The two disabled
 * columns are the exception, and they are the exception BECAUSE they are empty
 * for everybody — nothing writes them yet.
 */
export function TodayDayView({
  rows,
  day,
  selected,
  onSelect,
  onAdd,
}: {
  rows: TodayRow[];
  day: string;
  selected: string | null;
  onSelect: (key: string) => void;
  /** Opens the "Booking baru" picker from the empty state. */
  onAdd: () => void;
}) {
  const columns = columnsOn(rows, day);
  const live = new Set(columns.map((column) => column.name.toLowerCase()));
  const pending = PENDING_COLUMNS.filter(
    (column) => !live.has(column.name.toLowerCase()),
  );
  const total = columns.length + pending.length + (columns.length ? 0 : 1);

  return (
    <div
      className={cn(
        "grid gap-4 md:grid-cols-2",
        WIDE_COLUMNS[Math.min(total, 4)] ?? "xl:grid-cols-4",
      )}
    >
      {columns.length === 0 && (
        /* §10: state the fact, then offer the next step. */
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
          Tidak ada kegiatan pada tanggal ini.{" "}
          {/*
            THE SAME DOOR AS THE BUTTON IN THE HEADER — which form to open is a
            question with one answer per shop, and asking it twice in two ways
            is how the two drift apart.
          */}
          <Can feature="bookings" action="create">
            <button
              type="button"
              onClick={onAdd}
              className="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Tambah booking →
            </button>
          </Can>
        </div>
      )}

      {columns.map((column) => (
        <section
          key={column.name}
          aria-label={column.name}
          className="overflow-hidden rounded-xl border border-border bg-surface"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-base font-bold text-foreground">
              {column.name}
            </h2>
            <span className="text-xs tabular-nums text-muted">
              {column.rows.length} booking
            </span>
          </header>

          <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto p-3">
            {groupsOf(column.rows).map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <h3 className="px-1 text-xs font-bold text-muted">
                  {group.label}
                </h3>
                {group.rows.map((row) => (
                  <TodayCard
                    key={row.key}
                    row={row}
                    selected={selected === row.key}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}

      {pending.map((column) => (
        /*
          NO `aria-disabled` — a <section> is a region, and the attribute means
          nothing on one (eslint says so too). There is no control in here to
          disable: the badge and the sentence ARE the state, which is also how a
          screen reader gets it.
        */
        <section
          key={column.name}
          aria-label={`${column.name} — segera`}
          className="overflow-hidden rounded-xl border border-dashed border-border bg-surface opacity-60"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-base font-bold text-foreground">
              {column.name}
            </h2>
            <Badge variant="outline">Segera</Badge>
          </header>

          <p className="px-4 py-6 text-sm text-muted">{column.blockedBy}</p>
        </section>
      ))}
    </div>
  );
}
