"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import {
  Alert,
  FilterPills,
  FilterSelect,
  namedOptions,
  PendingStatTile,
  Spinner,
  StatTile,
} from "@/components";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/features/purchasing";
import { Can } from "@/features/permissions";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { formatMoneyShort } from "@/utils/decimal";

import { TODAY_CRUMBS } from "../crumbs";
import {
  addDays,
  addMonths,
  endOfMonth,
  hoursMinutes,
  longDayOf,
  monthTitleOf,
  startOfMonth,
  startOfWeek,
  todayIso,
  weekTitleOf,
} from "../day";
import { MAX_BOOKING_PAGES } from "../listAll";
import { useTodayBoard } from "../hooks/useTodayBoard";
import {
  DEFAULT_TODAY_FILTERS,
  matchesTodayFilters,
  summariseTodayDay,
  type TodayFilters,
  type TodayView,
} from "../today";
import { TodayDayView } from "./TodayDayView";
import { TodayDetailPanel } from "./TodayDetailPanel";
import { TodayFilterButton } from "./TodayFilterButton";
import { TodayMonthView } from "./TodayMonthView";
import { TodayNewBookingDialog } from "./TodayNewBookingDialog";
import { TodayWeekView } from "./TodayWeekView";

const VIEWS: { value: TodayView; label: string }[] = [
  { value: "harian", label: "Harian" },
  { value: "mingguan", label: "Mingguan" },
  { value: "bulanan", label: "Bulanan" },
];

/**
 * Layanan › Kalender — every line of business on one operational screen, from
 * `buloo-hari-ini-v1.html`.
 *
 * ─── WHAT IT REPLACED, AND WHY ─────────────────────────────────────────────
 *
 * `/dashboard/booking` was a paged table of every booking ever taken. It
 * answered "was this recorded"; it did not answer the question somebody opens a
 * shop screen with, which is "what is happening today". The table is gone
 * (16 September 2026, on request) — the per-line boards keep the searching and
 * the lenses (Layanan › Grooming), and this screen keeps the day.
 *
 * ─── ONE READ, THREE VIEWS ─────────────────────────────────────────────────
 *
 * The range follows the VIEW, not the day: stepping between days inside a week
 * that is already loaded asks the server nothing, and every number on screen —
 * the tiles, the bars, the month's counts — is computed from that one array, so
 * a tile can never disagree with the cards under it.
 *
 * ─── WHAT THE MOCKUP DRAWS THAT THE DATABASE CANNOT ANSWER ─────────────────
 *
 * Room occupancy as a percentage, check-in and check-out times, a trip's
 * driver, zone and fee, and a grooming capacity ceiling. There is no room
 * table, no trip record, and nothing anywhere states a groomer's working hours
 * — so the tiles report LOAD ("beban 4j 30m") and never a ceiling. See
 * `today.ts` for the columns, and `BookingCalendarScreen` for the same
 * load-not-capacity argument on the hour grid.
 */
export function TodayScreen({
  /** From `?tanggal=`; empty is today. */
  initialDate = "",
}: {
  initialDate?: string;
} = {}) {
  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;

  const [today] = useState(todayIso);
  const [view, setView] = useState<TodayView>("harian");
  const [anchor, setAnchor] = useState(() => initialDate || today);
  const [filters, setFilters] = useState<TodayFilters>(DEFAULT_TODAY_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const weekStart = startOfWeek(anchor);
  const from =
    view === "harian"
      ? anchor
      : view === "mingguan"
        ? weekStart
        : startOfMonth(anchor);
  const to =
    view === "harian"
      ? anchor
      : view === "mingguan"
        ? addDays(weekStart, 6)
        : endOfMonth(anchor);

  const board = useTodayBoard(branchId, from, to);

  const rows = useMemo(
    () => board.rows.filter((row) => matchesTodayFilters(row, filters)),
    [board.rows, filters],
  );

  /** Every line in the range, in legend order — fixes the bars' colours. */
  const lines = useMemo(
    () =>
      [...new Set(rows.map((row) => row.line))].sort((a, b) =>
        a.localeCompare(b, "id-ID"),
      ),
    [rows],
  );

  const day = useMemo(() => summariseTodayDay(rows, anchor), [rows, anchor]);
  const open = selected ? rows.find((row) => row.key === selected) : undefined;

  function step(direction: 1 | -1) {
    setAnchor((prev) =>
      view === "harian"
        ? addDays(prev, direction)
        : view === "mingguan"
          ? addDays(prev, 7 * direction)
          : addMonths(prev, direction),
    );
  }

  const title =
    view === "harian"
      ? longDayOf(anchor)
      : view === "mingguan"
        ? weekTitleOf(weekStart)
        : monthTitleOf(anchor);

  /*
    THE COUNT UNDER THE TITLE IS OF LIVE WORK. A cancelled booking still has a
    card — one that vanished would read as lost — but counting it would put work
    on the day that nobody is going to do.

    THE WEEK AND THE MONTH SAY ONLY A NUMBER, never "minggu ini": the title above
    already names which week, and the anchor is often not the current one.
  */
  const bits = [
    ...day.lines.map((line) => `${line.count} ${line.name.toLowerCase()}`),
    day.trips > 0 ? `${day.trips} antar-jemput` : null,
  ].filter((bit): bit is string => bit !== null);

  const live = rows.filter((row) => row.booking.status !== "cancelled").length;
  const caption =
    view === "harian"
      ? bits.length
        ? bits.join(" · ")
        : "tidak ada kegiatan"
      : `${live} booking`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <PageHeading crumbs={TODAY_CRUMBS} title="Kalender">
          Semua layanan dalam satu layar operasional.
        </PageHeading>

        <div className="ml-auto flex flex-none flex-wrap items-center gap-2">
          <TodayFilterButton
            rows={board.rows}
            filters={filters}
            onChange={setFilters}
          />
          <Can feature="bookings" action="create">
            <Button type="button" onClick={() => setPicking(true)}>
              <Plus className="size-4" aria-hidden />
              Booking baru
            </Button>
          </Can>
        </div>
      </div>

      {/*
        THE DATE BAR. Arrows and Hari ini move the anchor; the pills change what
        a step MEANS — a day, a week, a month — which is why they sit on the same
        row rather than in the filter panel.
      */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Sebelumnya"
            onClick={() => step(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Berikutnya"
            onClick={() => step(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        <div>
          <p className="text-base font-bold text-foreground">{title}</p>
          <p className="text-xs text-muted">{caption}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAnchor(today);
              setView("harian");
            }}
          >
            Hari ini
          </Button>

          {/*
            THE HOUR GRID IS A SECOND WAY TO READ THE SAME DAY — who is free at
            two o'clock, which this board's columns do not answer. Its only link
            used to sit on the booking list's toolbar, which is gone.
          */}
          <Button asChild variant="secondary" size="sm">
            <Link href="/dashboard/booking/kalender">Kalender groomer</Link>
          </Button>

          {/*
            EMPTY MEANS EVERY BRANCH — a legitimate question for an owner with
            two shops, and a wrong DEFAULT for one, which is why `soleBranch`
            fills it in when there is only one.
          */}
          {scope.branches.length > 1 && (
            <FilterSelect
              label="Cabang"
              ariaLabel="Filter cabang"
              value={branchId}
              options={namedOptions(scope.branches)}
              onChange={setPickedBranch}
            />
          )}

          <FilterPills
            ariaLabel="Tampilan jadwal"
            value={view}
            options={VIEWS}
            onChange={setView}
          />
        </div>
      </div>

      {board.error && <Alert variant="error">{board.error}</Alert>}
      {board.truncated && (
        <Alert variant="warning">
          Rentang ini berisi lebih dari {MAX_BOOKING_PAGES * 100} booking, jadi
          yang ditampilkan hanya sebagian. Pindah ke tampilan harian supaya
          lengkap.
        </Alert>
      )}

      {/*
        THE TILES SIT IN THE LEFT COLUMN, not in a band across the page — so the
        panel beside them starts at the same line (the mockup's `.grid2`, with
        `.stats` inside its first child). A full-width band would push the panel
        a card's height below everything it belongs to.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex flex-col gap-4">
          {view === "harian" && (
            <section
              aria-label="Ringkasan hari ini"
              /*
                ONE ROW, AS LONG AS THE ROW HOLDS. `auto-fit` keeps every tile on
                one line where there is room and wraps them itself where there is
                not — a fixed column count would either wrap on a laptop or
                squeeze six tiles into slivers on a phone.
              */
              className="grid gap-3"
              style={{
                /*
                  8.75rem IS THE WIDTH FIVE TILES FIT IN beside the 21rem panel
                  on a 1440 laptop — the mockup's own 146 px, near enough. They
                  stretch past it wherever there is more room.
                */
                gridTemplateColumns: "repeat(auto-fit, minmax(8.75rem, 1fr))",
              }}
            >
              {day.lines.map((line) => (
                <StatTile
                  key={line.name}
                  label={line.name}
                  value={String(line.count)}
                  caption={
                    line.minutes > 0
                      ? `beban ${hoursMinutes(line.minutes)}`
                      : "durasi belum diisi"
                  }
                  loading={board.loading}
                  error={board.error !== null}
                  dense
                />
              ))}
              {/*
                THE MOCKUP'S THREE TILES THAT NOTHING CAN ANSWER YET — badged
                "Segera", never blank and never filled with a plausible number.
                A dash would read as a count that failed to load, and an invented
                figure is indistinguishable from a real one. `blockedBy` says
                what each is waiting for, which is also the note the next person
                needs before building it.

                "PERJALANAN" IS HERE BY DECISION, not for want of data (16
                September 2026, on request): the day's journeys ARE countable
                from a booking's `pickupRequested` / `deliveryRequested` /
                `location`, and the number is on screen in the Antar-Jemput
                column and under the date. The tile waits for antar-jemput to be
                a record of its own — with a jam, a driver, a zona and a tarif —
                so it never reports half a module as a whole one.
              */}
              {/* Short lines, because the tile is 145 px wide — the long
                  version of each reason is in the note above. */}
              <PendingStatTile
                dense
                label="Okupansi hotel"
                blockedBy="Kamar belum ada di sistem."
              />
              <PendingStatTile
                dense
                label="Masuk / keluar"
                blockedBy="Jam check-in dan check-out belum disimpan."
              />
              <PendingStatTile
                dense
                label="Perjalanan"
                blockedBy="Jemput dan antar belum jadi catatan sendiri."
              />

              <StatTile
                label="Nilai hari ini"
                value={formatMoneyShort(day.value)}
                caption="semua layanan · sebelum diskon"
                loading={board.loading}
                error={board.error !== null}
                dense
              />
            </section>
          )}

          {board.loading && board.rows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Spinner /> Memuat jadwal…
            </div>
          ) : (
            <div className={board.loading ? "opacity-60" : undefined}>
              {view === "harian" ? (
                /*
                  ALWAYS THE COLUMNS, EVEN ON AN EMPTY DAY — the two disabled
                  ones say where penitipan and antar-jemput will appear, and a
                  quiet Tuesday is no reason to take that off the screen. The
                  "nothing booked" card is one of the columns' own cells.
                */
                <TodayDayView
                  rows={rows}
                  day={anchor}
                  selected={selected}
                  onSelect={setSelected}
                  onAdd={() => setPicking(true)}
                />
              ) : view === "mingguan" ? (
                <TodayWeekView
                  rows={rows}
                  from={weekStart}
                  today={today}
                  lines={lines}
                  selected={selected}
                  onSelect={setSelected}
                  onOpenDay={(picked) => {
                    setAnchor(picked);
                    setView("harian");
                  }}
                />
              ) : (
                <TodayMonthView
                  rows={rows}
                  anchor={anchor}
                  today={today}
                  lines={lines}
                  onOpenDay={(picked) => {
                    setAnchor(picked);
                    setView("harian");
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* `top-20` clears DashboardShell's own 56 px header. */}
        <div className="lg:sticky lg:top-20">
          {open ? (
            <TodayDetailPanel
              row={open}
              onChanged={board.replaceBooking}
              onClose={() => setSelected(null)}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
              Klik satu kartu untuk membuka rinciannya di sini — status,
              tahapan, dan jalan ke bookingnya.
            </p>
          )}
        </div>
      </div>

      <TodayNewBookingDialog open={picking} onOpenChange={setPicking} />
    </div>
  );
}
