import { billingOf, type BillingState } from "@/features/booking/billing";
import { clockOf, dayOf, isoDate } from "@/features/booking/day";
import type {
  Booking,
  BookingAddon,
  BookingLocation,
  BookingMainService,
  BookingSession,
  BookingStatus,
  TripLeg,
} from "@/types/api";
import type { SortOptions } from "@/components/DataTable";
import {
  divideRound,
  formatMoneyShort,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

/**
 * The Grooming board's arithmetic — everything the screen shows that is not
 * drawn straight off one API field.
 *
 * ─── WHY THE SCREEN READS A WHOLE PERIOD AND NARROWS IT HERE ───────────────
 *
 * `GET /bookings` cannot be asked for one line of business: the line is known
 * only from the booking's service — its catalogue id, or the `serviceType`
 * snapshot — and the list has no filter for either. So the screen fetches every
 * booking in the period and keeps the grooming ones itself.
 *
 * THE UPSIDE IS THAT EVERY NUMBER COMES FROM THE SAME ROWS. A card saying
 * "4 belum ditagih" sits over a lens that lists exactly those four, because both
 * are computed from one array rather than one from the server and one from a
 * page of the list.
 *
 * PURE, so it is tested without a DOM (`src/tests/groomingBoard.test.ts`).
 *
 * ─── WHAT MOVED OUT, AND WHY IT IS STILL EXPORTED FROM HERE ────────────────
 *
 * `billingOf`, the date helpers and `formatMoneyShort` are read by Hari Ini too
 * (`features/booking`), so they moved DOWN into the module this one already
 * depends on rather than being copied. They are re-exported here because a
 * dozen call sites import them from `../board` and renaming those would be
 * churn with nothing behind it.
 */

/* ─── Which services are grooming ─────────────────────────────────────────── */

export interface GroomingScope {
  /**
   * Every service on the Grooming line, DELETED ONES INCLUDED — last month's
   * booking still names a service somebody has since retired.
   */
  serviceIds: ReadonlySet<string>;
  /**
   * This module's own name, which a booking snapshots into `service.serviceType`.
   *
   * THE FALLBACK FOR AN ID WE CANNOT SEE. A role that may read bookings but not
   * the catalogue gets no ids at all, and the snapshot is still on every booking.
   *
   * ⚠️ IT IS THE MODULE'S FIXED NAME NOW, NOT THE TENANT'S LINE (30 September
   * 2026). The screens read their catalogue by `serviceKind` and no longer look a
   * business line up, so a booking snapshotted under a line named something else
   * ("Salon") is matched by its service id or not at all. That only loses rows
   * whose service was BOTH renamed away and deleted — the id covers the rest.
   */
  lineName: string;
  /**
   * A booking that belongs to the board whatever its service says — on
   * Antar-Jemput, any ride (`tripLeg` set), so one sold from a service since
   * moved to another line still shows where its van is (21 September 2026).
   */
  includes?: (booking: Booking) => boolean;
}

export function isGroomingService(
  service: Pick<BookingMainService, "serviceId" | "serviceType">,
  scope: GroomingScope,
): boolean {
  if (scope.serviceIds.has(service.serviceId)) return true;

  return (
    service.serviceType !== null &&
    service.serviceType.trim().toLowerCase() ===
      scope.lineName.trim().toLowerCase()
  );
}

/* ─── Periods ─────────────────────────────────────────────────────────────── */

/**
 * "all" — every date, no bounds sent (12 October 2026, on request). The screens
 * still OPEN on "month"; "all" is a chip somebody presses.
 */
export type GroomingPeriod = "all" | "today" | "week" | "month" | "custom";

/** The period in a sentence — "Belum ada booking grooming bulan ini". */
export const PERIOD_WORDS: Record<Exclude<GroomingPeriod, "custom">, string> = {
  all: "di semua tanggal",
  today: "hari ini",
  week: "minggu ini",
  month: "bulan ini",
};

/** Calendar dates, `yyyy-mm-dd`; `""` is an open end. */
export interface DateRange {
  from: string;
  to: string;
}

/** A week runs Monday to Sunday — the shop's week, not the calendar app's. */
export function periodRange(
  period: Exclude<GroomingPeriod, "custom">,
  today: Date = new Date(),
): DateRange {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Two open ends: the API reads that as every date.
  if (period === "all") {
    return { from: "", to: "" };
  }

  if (period === "today") {
    return { from: isoDate(start), to: isoDate(start) };
  }

  if (period === "week") {
    const monday = new Date(start);
    monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return { from: isoDate(monday), to: isoDate(sunday) };
  }

  return {
    from: isoDate(new Date(start.getFullYear(), start.getMonth(), 1)),
    to: isoDate(new Date(start.getFullYear(), start.getMonth() + 1, 0)),
  };
}

/**
 * The dates "Custom" starts from — the period in force, so the numbers do not
 * move until a date does. "Semua" has no dates to hand over, so it starts from
 * this month: an empty range would read as "back to the default" instead.
 */
export function customSeed(period: Exclude<GroomingPeriod, "custom">): DateRange {
  return periodRange(period === "all" ? "month" : period);
}

/* ─── Rows ────────────────────────────────────────────────────────────────── */

/**
 * ONE BOOKING ON THE BOARD — one animal and its one grooming service.
 *
 * A booking whose main service is not grooming (a night in the hotel) is not a
 * row at all.
 */
export interface GroomingRow {
  /** The booking's id. */
  key: string;
  booking: Booking;
  service: BookingMainService;
  addons: BookingAddon[];
  /** The service plus its add-ons, as a decimal string — BEFORE discount. */
  value: string;
  /** What the bill comes to, after the booking's own discounts. */
  net: string;
  /** Null when neither the service nor an add-on carries a duration. */
  durationMin: number | null;
  sessions: BookingSession[];
  sessionsDone: number;
  /** Everybody on any turn of this booking, once each. */
  groomers: { _id: string; name: string }[];
  billing: BillingState;
}

export function toGroomingRows(
  bookings: Booking[],
  scope: GroomingScope,
): GroomingRow[] {
  return bookings.flatMap((booking): GroomingRow[] => {
    const service = booking.service;
    /* Absent only on a response from before the service became required. */
    if (!service) return [];
    if (!isGroomingService(service, scope) && !scope.includes?.(booking)) return [];

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

    return [
      {
        key: booking._id,
        booking,
        service,
        addons,
        value: sumDecimals([
          service.price,
          ...addons.map((addon) => addon.price),
        ]),
        net:
          booking.netAmount ??
          sumDecimals([service.price, ...addons.map((addon) => addon.price)]),
        durationMin: minutes.length
          ? minutes.reduce((total, value) => total + value, 0)
          : null,
        sessions,
        sessionsDone: sessions.filter((session) => session.status === "done")
          .length,
        groomers: [...groomers.values()],
        billing: billingOf(booking),
      },
    ];
  });
}

/* ─── The cards ───────────────────────────────────────────────────────────── */

export interface PeriodSummary {
  /** Live grooming bookings — one animal each. */
  bookings: number;
  /** Before any discount: a booking carries prices, not what was charged. */
  value: string;
  /**
   * The value over the live bookings. A booking is one animal, so this is the
   * card's "per hewan"; the same dog booked for two main services is two
   * bookings and counts twice, which is also how it is billed.
   */
  averagePerAnimal: string | null;
  /** Whole percent of live bookings with at least one add-on; null when none. */
  addonRate: number | null;
  unbilledCount: number;
  unbilledValue: string;
  oldestUnbilledDays: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string, today: Date): number | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const then = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.max(0, Math.round((now.getTime() - then.getTime()) / DAY_MS));
}

/**
 * NOT YET PULLED — neither put in a cashier's basket nor on an invoice, and
 * not cancelled. WHATEVER ITS STATUS (13 October 2026, on request): the
 * Grooming board's "Belum ditagih" card counts a booking still at Requested
 * or Confirmed too, because what the shop asked it to answer is "what has not
 * reached the till or a faktur yet", not "what work was finished and missed".
 *
 * Narrower `billingOf(…) === "unbilled"` (finished work only) still drives the
 * row badges and Antar-Jemput's card — "Belum ditagih" on a dog booked for
 * Thursday would read as a reproach on the row itself.
 */
export function isUnpulled(row: GroomingRow): boolean {
  const booking = row.booking;
  return (
    booking.status !== "cancelled" &&
    !booking.pulledToCartAt &&
    !booking.pulledToInvoiceAt
  );
}

/** CANCELLED BOOKINGS COUNT FOR NOTHING — not in the value, not in the average. */
export function summarisePeriod(
  rows: GroomingRow[],
  today: Date = new Date(),
): PeriodSummary {
  const live = rows.filter((row) => row.booking.status !== "cancelled");
  const value = sumDecimals(live.map((row) => row.value));
  const unbilled = rows.filter(isUnpulled);

  const oldest = unbilled.reduce<number | null>((max, row) => {
    const days = daysSince(row.booking.scheduledAt, today);
    if (days === null) return max;
    return max === null ? days : Math.max(max, days);
  }, null);

  return {
    bookings: live.length,
    value,
    averagePerAnimal: live.length
      ? toDecimalString(
          divideRound(toMinor(value) ?? 0n, BigInt(live.length)),
        )
      : null,
    addonRate: live.length
      ? Math.round(
          (live.filter((row) => row.addons.length > 0).length / live.length) *
            100,
        )
      : null,
    unbilledCount: unbilled.length,
    /* What the bills will come to — after discount, unlike `value`. */
    unbilledValue: sumDecimals(unbilled.map((row) => row.net)),
    oldestUnbilledDays: oldest,
  };
}

export interface NewAnimalSummary {
  /** Animals on a live row, once each. */
  animals: number;
  /** Of those, the ones whose first grooming booking ever is one of the rows. */
  newAnimals: number;
  returning: number;
}

/**
 * "HEWAN BARU" — an animal is new when its FIRST live grooming booking, read
 * by the server across all history and every cabang (`GET /bookings/
 * first-visits`), is one of these rows. So the card follows the Filter panel
 * like its neighbours: narrow the rows and the new animals narrow with them.
 *
 * An animal is counted once however many bookings it has in the period, and a
 * ride (no `petId`) is not an animal here.
 */
export function summariseNewAnimals(
  rows: GroomingRow[],
  firstBookingIds: ReadonlySet<string>,
): NewAnimalSummary {
  const animals = new Set<string>();
  const fresh = new Set<string>();

  for (const row of rows) {
    const petId = row.booking.petId;
    if (!petId || row.booking.status === "cancelled") continue;

    animals.add(petId);
    if (firstBookingIds.has(row.key)) fresh.add(petId);
  }

  return {
    animals: animals.size,
    newAnimals: fresh.size,
    returning: animals.size - fresh.size,
  };
}

export interface DaySummary {
  working: number;
  workingValue: string;
  /** Agreed and not yet started — the van may be out, the dog may be waiting. */
  queued: number;
  finished: number;
  /**
   * Draft and Requested: neither holds a slot. Counted apart so an empty
   * morning does not read as a full one.
   */
  unconfirmed: number;
}

const QUEUED: BookingStatus[] = ["confirmed", "pickup", "arrived"];
const FINISHED: BookingStatus[] = ["completed", "delivery", "return_to_pawrents"];
const UNCONFIRMED: BookingStatus[] = ["draft", "requested"];

export function summariseDay(rows: GroomingRow[]): DaySummary {
  const working = rows.filter((row) => row.booking.status === "in_progress");
  const count = (statuses: BookingStatus[]) =>
    rows.filter((row) => statuses.includes(row.booking.status)).length;

  return {
    working: working.length,
    workingValue: sumDecimals(working.map((row) => row.value)),
    queued: count(QUEUED),
    finished: count(FINISHED),
    unconfirmed: count(UNCONFIRMED),
  };
}

/* ─── Narrowing ───────────────────────────────────────────────────────────── */

/**
 * THE TABLE'S ORDERINGS (BO, 20 October 2026) — chosen from the column headers,
 * no longer from an Urutkan field in the Filter panel. Local names: no API sees
 * them, because the board holds the whole period and sorts it here (see the top
 * of this file) — the same client-side sort as `CashBankAccountsTable`, which is
 * right only because nothing is paged on the server.
 *
 *   schedule_asc — the default and the order before the headers existed:
 *                  earliest appointment first. No header owns it, so on first
 *                  load no header is lit.
 *   booking_*    — the booking NUMBER the Booking cell prints, compared
 *                  naturally ("BK-260923-002" before "BK-260923-010"), A first
 *                  on the first click. A draft has no number yet (its cell
 *                  prints "—") and sorts after every number in BOTH directions.
 *   value_*      — the money the Nilai cell prints, compared exactly in minor
 *                  units, largest first on the first click. Which amount that
 *                  is depends on the board: Grooming prints `value` (before
 *                  discount), Antar-Jemput `net` — `sortRows` takes it.
 *
 * Ties fall back to the schedule, then the number and the animal's name.
 */
export type GroomingSort =
  | "schedule_asc"
  | "booking_asc"
  | "booking_desc"
  | "value_asc"
  | "value_desc";

export const DEFAULT_SORT: GroomingSort = "schedule_asc";

/** Column id → its orderings, for both boards' `DataTable`. Only these sort. */
export const BOOKING_SORT_OPTIONS: SortOptions<GroomingSort> = {
  booking: { asc: "booking_asc", desc: "booking_desc" },
  value: { asc: "value_asc", desc: "value_desc", first: "desc" },
};

/** What the Filter panel holds. The ordering is not in it (§8). */
export interface GroomingFilters {
  statuses: BookingStatus[];
  /** Whoever is on a turn — the groomers, or on Antar-Jemput the drivers. */
  groomerIds: string[];
  serviceIds: string[];
  locations: BookingLocation[];
  /**
   * Antar-Jemput's Arah, where Grooming has Tempat (21 September 2026). Each
   * board draws one of the two; the other stays empty and narrows nothing.
   */
  legs: TripLeg[];
}

export const DEFAULT_FILTERS: GroomingFilters = {
  statuses: [],
  groomerIds: [],
  serviceIds: [],
  locations: [],
  legs: [],
};

export function countFilters(filters: GroomingFilters): number {
  return [
    filters.statuses,
    filters.groomerIds,
    filters.serviceIds,
    filters.locations,
    filters.legs,
  ].filter((values) => values.length > 0).length;
}

export function matchesFilters(
  row: GroomingRow,
  filters: GroomingFilters,
): boolean {
  if (
    filters.statuses.length &&
    !filters.statuses.includes(row.booking.status)
  ) {
    return false;
  }
  if (
    filters.locations.length &&
    !filters.locations.includes(row.booking.location ?? "in_store")
  ) {
    return false;
  }
  if (
    filters.legs.length &&
    !(row.booking.tripLeg && filters.legs.includes(row.booking.tripLeg))
  ) {
    return false;
  }
  if (
    filters.serviceIds.length &&
    !filters.serviceIds.includes(row.service.serviceId)
  ) {
    return false;
  }
  if (
    filters.groomerIds.length &&
    !row.groomers.some((who) => filters.groomerIds.includes(who._id))
  ) {
    return false;
  }

  return true;
}

/**
 * The cards that narrow the table when pressed. `unbilled` is finished work
 * nobody charged for (Antar-Jemput); `unpulled` is anything not yet at the
 * till or on a faktur (Grooming — see `isUnpulled`).
 */
export type GroomingLens = "all" | "unbilled" | "unpulled" | "working";

export function matchesLens(row: GroomingRow, lens: GroomingLens): boolean {
  if (lens === "unbilled") return row.billing === "unbilled";
  if (lens === "unpulled") return isUnpulled(row);
  if (lens === "working") return row.booking.status === "in_progress";

  return true;
}

export function matchesSearch(row: GroomingRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  return [
    row.booking.petName,
    row.booking.customerName,
    row.booking.bookingNumber,
    /* The animals in the van, on a ride — where `petName` is null and these
       are the only names there are (23 September 2026). */
    ...(row.booking.passengers ?? []).map((pet) => pet.name),
  ]
    .filter(Boolean)
    .some((text) => (text as string).toLowerCase().includes(needle));
}

function scheduleOf(row: GroomingRow): number {
  const at = new Date(row.booking.scheduledAt).getTime();
  return Number.isNaN(at) ? 0 : at;
}

/** Which amount the Nilai cell prints — `value` on Grooming, `net` on Antar-Jemput. */
export type GroomingMoney = "value" | "net";

export function sortRows(
  rows: GroomingRow[],
  sort: GroomingSort,
  money: GroomingMoney = "value",
): GroomingRow[] {
  const tieBreak = (a: GroomingRow, b: GroomingRow) =>
    scheduleOf(a) - scheduleOf(b) ||
    (a.booking.bookingNumber ?? "").localeCompare(b.booking.bookingNumber ?? "") ||
    (a.booking.petName ?? "").localeCompare(b.booking.petName ?? "");

  return [...rows].sort((a, b) => {
    if (sort === "value_asc" || sort === "value_desc") {
      const x = toMinor(a[money]) ?? 0n;
      const y = toMinor(b[money]) ?? 0n;
      if (x !== y) return (x < y ? -1 : 1) * (sort === "value_desc" ? -1 : 1);
      return tieBreak(a, b);
    }

    if (sort === "booking_asc" || sort === "booking_desc") {
      const x = a.booking.bookingNumber;
      const y = b.booking.bookingNumber;
      // A draft has no number: after every number, whichever way.
      if (!x || !y) return x ? -1 : y ? 1 : tieBreak(a, b);
      const diff = x.localeCompare(y, "id", { numeric: true });
      return (sort === "booking_desc" ? -diff : diff) || tieBreak(a, b);
    }

    return tieBreak(a, b);
  });
}

/* ─── Reading ─────────────────────────────────────────────────────────────── */

export { billingOf, clockOf, dayOf, formatMoneyShort, isoDate };
export type { BillingState };
