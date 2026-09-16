import type {
  Booking,
  BookingAddon,
  BookingMainService,
  BookingSession,
} from "@/types/api";
import { sumDecimals } from "@/utils/decimal";

import { billingOf, type BillingState } from "./billing";
import { dayKeyOf, minutesOf } from "./day";

/**
 * Hari Ini's arithmetic — from `buloo-hari-ini-v1.html`.
 *
 * ─── THE MOCKUP'S THREE COLUMNS ARE THREE LINES OF BUSINESS ────────────────
 *
 * It draws Grooming, Hotel and Antar-Jemput as fixed columns. Nothing in this
 * system is fixed that way: a line of business is a label the tenant names
 * (Grooming, Hotel, Day Care, …) and every booking SNAPSHOTS it into
 * `service.serviceType`. So the columns are READ OFF THE DAY rather than
 * declared here — which is also the mockup's own rule, that a column with
 * nothing in it is not drawn at all. A shop that has never opened a hotel never
 * sees a hotel column, and one that opens one tomorrow gets it with no code.
 *
 * ─── ANTAR-JEMPUT IS A COLUMN OVER THE SAME BOOKINGS ───────────────────────
 *
 * The mockup has trips as records of their own, with a driver, a zone and a
 * fee. Here there are none: a journey is three FLAGS on the booking that needs
 * it (`pickupRequested`, `deliveryRequested`, `location: "in_home"`). So the
 * column lists the bookings somebody has to drive to or collect, and a booking
 * appears BOTH in its own line's column and in that one. That is the honest
 * reading — the groomer and the driver are looking for the same dog — and it is
 * why `tripsOn` filters rather than builds.
 *
 * WHAT IS NOT DRAWN, because the API does not have it: the zone, the travel
 * fee, the driver (the trip has no PIC of its own — the booking's groomers are
 * who is named), hotel occupancy as a percentage of rooms, and check-in /
 * check-out times. Do not invent them.
 *
 * PURE, so the grouping is tested without a DOM (`src/tests/bookingToday.test.ts`).
 */

export type TodayView = "harian" | "mingguan" | "bulanan";

/**
 * The column a booking lands in when its service never named a line.
 *
 * NOT "Grooming". A booking raised at the till carries no `serviceType`, and
 * filing it under a line somebody else runs would put a bag of dog food on the
 * grooming day sheet.
 */
export const LINE_UNKNOWN = "Lainnya";

/**
 * The trip column's heading — a column, never a line of business.
 *
 * Drawn disabled on the board until antar-jemput is a record of its own, with a
 * jam berangkat, a driver, a zona and a tarif.
 */
export const TRIP_COLUMN = "Antar-Jemput";

/** The same, for penitipan — a line a shop may not run at all. */
export const HOTEL_COLUMN = "Hotel";

/** Which legs of a journey one booking asks for. */
export interface TodayTrip {
  pickup: boolean;
  delivery: boolean;
  /** The groomer goes to the animal — the booking never comes to the shop. */
  inHome: boolean;
}

/** ONE BOOKING ON THE BOARD — one animal, one main service. */
export interface TodayRow {
  /** The booking's id. */
  key: string;
  booking: Booking;
  service: BookingMainService;
  addons: BookingAddon[];
  /** The line of business it belongs to, as the booking snapshotted it. */
  line: string;
  /** The local calendar day it falls on — the axis every view is drawn on. */
  day: string;
  /** Minutes past midnight, local — what the day column sorts by. */
  minutes: number;
  /** Null when neither the service nor an add-on carries one. */
  durationMin: number | null;
  /** The service plus its add-ons, BEFORE discount. */
  value: string;
  /** What the bill comes to, after the booking's own discounts. */
  net: string;
  sessions: BookingSession[];
  sessionsDone: number;
  /** Everybody on any turn of this booking, once each. */
  groomers: { _id: string; name: string }[];
  billing: BillingState;
  /** Null when nobody has to drive anywhere. */
  trip: TodayTrip | null;
}

function tripOf(booking: Booking): TodayTrip | null {
  const inHome = booking.location === "in_home";

  if (!inHome && !booking.pickupRequested && !booking.deliveryRequested) {
    return null;
  }

  return {
    pickup: booking.pickupRequested,
    delivery: booking.deliveryRequested,
    inHome,
  };
}

export function toTodayRows(bookings: Booking[]): TodayRow[] {
  return bookings.flatMap((booking): TodayRow[] => {
    const service = booking.service;
    /* Absent only on a response from before the service became required. */
    if (!service) return [];

    const addons = service.addons ?? [];
    const sessions = service.sessions ?? [];

    const groomers = new Map<string, { _id: string; name: string }>();
    for (const session of sessions) {
      for (const who of session.groomers ?? []) {
        if (!groomers.has(who._id)) {
          groomers.set(who._id, { _id: who._id, name: who.name });
        }
      }
    }

    const minutes = [service, ...addons]
      .map((line) => line.durationMin)
      .filter((value): value is number => value !== null);

    const value = sumDecimals([
      service.price,
      ...addons.map((addon) => addon.price),
    ]);

    return [
      {
        key: booking._id,
        booking,
        service,
        addons,
        line: service.serviceType?.trim() || LINE_UNKNOWN,
        day: dayKeyOf(booking.scheduledAt),
        minutes: minutesOf(booking.scheduledAt),
        durationMin: minutes.length
          ? minutes.reduce((total, each) => total + each, 0)
          : null,
        value,
        net: booking.netAmount ?? value,
        sessions,
        sessionsDone: sessions.filter((session) => session.status === "done")
          .length,
        groomers: [...groomers.values()],
        billing: billingOf(booking),
        trip: tripOf(booking),
      },
    ];
  });
}

/* ─── Narrowing ───────────────────────────────────────────────────────────── */

/**
 * What the Filter panel holds — the mockup's two fields.
 *
 * EMPTY MEANS EVERYTHING, for both. "No line picked" and "every line picked"
 * are the same view, and storing the second would mean a shop that opened a new
 * line tomorrow had it silently filtered out of a filter nobody touched.
 */
export interface TodayFilters {
  /** Line-of-business names, as `TodayRow.line` spells them. */
  lines: string[];
  /** Groomer user ids — the mockup's "PIC". */
  groomerIds: string[];
}

export const DEFAULT_TODAY_FILTERS: TodayFilters = { lines: [], groomerIds: [] };

export function countTodayFilters(filters: TodayFilters): number {
  return [filters.lines, filters.groomerIds].filter(
    (values) => values.length > 0,
  ).length;
}

export function matchesTodayFilters(
  row: TodayRow,
  filters: TodayFilters,
): boolean {
  if (filters.lines.length && !filters.lines.includes(row.line)) return false;

  if (
    filters.groomerIds.length &&
    !row.groomers.some((who) => filters.groomerIds.includes(who._id))
  ) {
    return false;
  }

  return true;
}

/* ─── One day ─────────────────────────────────────────────────────────────── */

/** Earliest first; same time, then by animal, so the order never wobbles. */
function byClock(a: TodayRow, b: TodayRow): number {
  return (
    a.minutes - b.minutes ||
    (a.booking.petName ?? "").localeCompare(b.booking.petName ?? "")
  );
}

export function rowsOn(rows: TodayRow[], day: string): TodayRow[] {
  return rows.filter((row) => row.day === day).sort(byClock);
}

/**
 * The bookings somebody has to drive for, that day.
 *
 * NOT DRAWN TODAY — the Antar-Jemput column is disabled (see above). Kept
 * because it is the query that column will run, and it is tested.
 */
export function tripsOn(rows: TodayRow[], day: string): TodayRow[] {
  return rowsOn(rows, day).filter((row) => row.trip !== null);
}

/** One column of the daily view — one line of business. */
export interface TodayColumn {
  /** The column's heading, and its key. */
  name: string;
  rows: TodayRow[];
}

/**
 * The day's columns, in a fixed reading order: the lines alphabetically, with
 * "Lainnya" after them.
 *
 * ALPHABETICAL RATHER THAN BY SIZE. A column that moved because one more dog
 * was booked would make somebody re-read the whole screen every morning.
 *
 * NO TRIP COLUMN. It was a real one, listing the bookings somebody has to drive
 * for; on 16 September 2026 the shop asked for Antar-Jemput to stand on the
 * board as a MODULE THAT IS COMING instead, so the day view draws it disabled
 * (see `TodayDayView`). `tripsOn` below is what it will list when the records
 * exist; meanwhile which legs a booking asked for is in its panel.
 */
export function columnsOn(rows: TodayRow[], day: string): TodayColumn[] {
  const here = rowsOn(rows, day);
  const byLine = new Map<string, TodayRow[]>();

  for (const row of here) {
    const bucket = byLine.get(row.line);
    if (bucket) bucket.push(row);
    else byLine.set(row.line, [row]);
  }

  const lines = [...byLine.keys()].sort((a, b) => {
    if (a === LINE_UNKNOWN) return 1;
    if (b === LINE_UNKNOWN) return -1;
    return a.localeCompare(b, "id-ID");
  });

  return lines.map((name) => ({ name, rows: byLine.get(name) ?? [] }));
}

/**
 * Morning and afternoon, split at noon.
 *
 * ─── A READING AID, NOT A SHOP RULE ────────────────────────────────────────
 *
 * The mockup groups a column into named sessions with hours on them — "Pagi ·
 * 09.00–13.00". This system has no session blocks: a booking carries a precise
 * time and nothing anywhere declares when a block starts or ends. Printing
 * invented hours would put a shop rule on screen that nobody set, and FR-4's
 * clash check would later be read against it.
 *
 * So the split is noon, the heading carries NO hours, and a group with nothing
 * in it is not drawn.
 */
export interface TodayGroup {
  label: string;
  rows: TodayRow[];
}

const NOON = 12 * 60;

export function groupsOf(rows: TodayRow[]): TodayGroup[] {
  const pagi = rows.filter((row) => row.minutes < NOON);
  const siang = rows.filter((row) => row.minutes >= NOON);

  return [
    { label: "Pagi", rows: pagi },
    { label: "Siang", rows: siang },
  ].filter((group) => group.rows.length > 0);
}

/* ─── The tiles ───────────────────────────────────────────────────────────── */

/** One line of business, summed over a day. */
export interface TodayLineTotal {
  name: string;
  count: number;
  /** Minutes booked — LOAD, never capacity; see BookingCalendarScreen. */
  minutes: number;
}

export interface TodaySummary {
  /** Live bookings — cancelled ones count for nothing anywhere here. */
  count: number;
  lines: TodayLineTotal[];
  /** Before discount: a booking carries prices, not what was charged. */
  value: string;
  trips: number;
  /** Trips whose booking has not reached the end of its ladder yet. */
  tripsLeft: number;
}

const TRIP_DONE = new Set(["completed", "delivery", "return_to_pawrents"]);

export function summariseTodayDay(
  rows: TodayRow[],
  day: string,
): TodaySummary {
  const live = rowsOn(rows, day).filter(
    (row) => row.booking.status !== "cancelled",
  );

  const totals = new Map<string, TodayLineTotal>();
  for (const row of live) {
    const total = totals.get(row.line) ?? { name: row.line, count: 0, minutes: 0 };
    total.count += 1;
    total.minutes += row.durationMin ?? 0;
    totals.set(row.line, total);
  }

  const trips = live.filter((row) => row.trip !== null);

  return {
    count: live.length,
    lines: [...totals.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "id-ID"),
    ),
    value: sumDecimals(live.map((row) => row.value)),
    trips: trips.length,
    tripsLeft: trips.filter((row) => !TRIP_DONE.has(row.booking.status)).length,
  };
}

/**
 * What a day is MADE of, as shares of a bar — one slice per line of business.
 *
 * COUNTED IN BOOKINGS, not in minutes or money: the bar answers "which kind of
 * work is this day", and a single overnight stay would otherwise swallow six
 * groomings.
 */
export interface TodaySlice {
  name: string;
  count: number;
  /** Whole percent of the day, so the bar's widths add to 100. */
  percent: number;
}

export function mixOn(rows: TodayRow[], day: string): TodaySlice[] {
  const lines = summariseTodayDay(rows, day).lines;
  const total = lines.reduce((sum, line) => sum + line.count, 0);
  if (!total) return [];

  return lines.map((line) => ({
    name: line.name,
    count: line.count,
    percent: Math.round((line.count / total) * 100),
  }));
}
