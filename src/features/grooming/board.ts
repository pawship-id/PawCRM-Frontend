import { hasCompletedWork } from "@/features/booking/statusFlow";
import type { BusinessLine } from "@/services/businessLine.service";
import type {
  Booking,
  BookingLocation,
  BookingPet,
  BookingPetService,
  BookingSession,
  BookingStatus,
} from "@/types/api";
import {
  divideRound,
  formatMoney,
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
 * `GET /bookings` cannot be asked for one line of business: a visit may hold a
 * grooming and a night in the hotel, and the line lives on each service row.
 * So the screen fetches every booking in the period and keeps the grooming rows
 * itself.
 *
 * THE UPSIDE IS THAT EVERY NUMBER COMES FROM THE SAME ROWS. A card saying
 * "4 belum ditagih" sits over a lens that lists exactly those four, because both
 * are computed from one array rather than one from the server and one from a
 * page of the list.
 *
 * PURE, so it is tested without a DOM (`src/tests/groomingBoard.test.ts`).
 */

/* ─── Which services are grooming ─────────────────────────────────────────── */

export interface GroomingScope {
  /**
   * Every service on the Grooming line, DELETED ONES INCLUDED — last month's
   * booking still names a service somebody has since retired.
   */
  serviceIds: ReadonlySet<string>;
  /**
   * The line's name, which a booking row snapshots into `serviceType`.
   *
   * THE FALLBACK FOR AN ID WE CANNOT SEE. A role that may read bookings but not
   * the catalogue gets no ids at all, and the snapshot is still on every row.
   */
  lineName: string;
}

/** The tenant's grooming line — named "Grooming" exactly, else the nearest. */
export function pickGroomingLine(lines: BusinessLine[]): BusinessLine | null {
  const named = (line: BusinessLine) => line.name.trim().toLowerCase();

  return (
    lines.find((line) => named(line) === "grooming") ??
    lines.find((line) => named(line).includes("groom")) ??
    null
  );
}

export function isGroomingService(
  service: Pick<BookingPetService, "serviceId" | "serviceType">,
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

export type GroomingPeriod = "today" | "week" | "month" | "custom";

/** Calendar dates, `yyyy-mm-dd`; `""` is an open end. */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * A date as the API takes it, from LOCAL parts — `toISOString()` is UTC and
 * shifts the day for everybody east of Greenwich, which is everybody here.
 */
export function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/** A week runs Monday to Sunday — the shop's week, not the calendar app's. */
export function periodRange(
  period: Exclude<GroomingPeriod, "custom">,
  today: Date = new Date(),
): DateRange {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());

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

/* ─── Rows ────────────────────────────────────────────────────────────────── */

/**
 * Where one animal's bill stands.
 *
 * `unbilled` IS NARROWER THAN THE SERVER'S `unbilled` FILTER, on purpose: the
 * board's card is "work that is FINISHED and nobody has charged for", while the
 * booking list's lens also counts an appointment for tomorrow. A dog still on
 * the table is not yet money the shop forgot.
 */
export type BillingState = "invoiced" | "paid" | "in_cart" | "unbilled" | "not_due";

export function billingOf(
  booking: Pick<
    Booking,
    "posTransactionId" | "pickupRequested" | "deliveryRequested"
  >,
  pet: Pick<BookingPet, "status" | "pulledToCartAt" | "pulledToInvoiceAt">,
): BillingState {
  if (pet.pulledToInvoiceAt) return "invoiced";
  /* A claim with no sale behind it is a basket still open — see BookingsTable. */
  if (pet.pulledToCartAt) return booking.posTransactionId ? "paid" : "in_cart";
  if (pet.status === "cancelled") return "not_due";

  return hasCompletedWork(pet, booking) ? "unbilled" : "not_due";
}

/**
 * ONE ANIMAL ON ONE VISIT, with only its grooming work.
 *
 * The mockup draws a row per booking because its bookings hold one animal; ours
 * have held several since PCR-040, and the status, the bill and the turns all
 * belong to the animal.
 */
export interface GroomingRow {
  /** `petItemId` — never `petId`, which repeats on pre-PCR-041 bookings. */
  key: string;
  booking: Booking;
  pet: BookingPet;
  services: BookingPetService[];
  addons: BookingPetService["addons"];
  /** Grooming services plus their add-ons, as a decimal string. */
  value: string;
  /** Null when not one of the services carries a duration. */
  durationMin: number | null;
  sessions: { service: BookingPetService; session: BookingSession }[];
  sessionsDone: number;
  /** Everybody on any grooming turn of this animal, once each. */
  groomers: { _id: string; name: string }[];
  billing: BillingState;
}

export function toGroomingRows(
  bookings: Booking[],
  scope: GroomingScope,
): GroomingRow[] {
  return bookings.flatMap((booking) =>
    (booking.pets ?? []).flatMap((pet): GroomingRow[] => {
      const services = (pet.services ?? []).filter((service) =>
        isGroomingService(service, scope),
      );
      if (services.length === 0) return [];

      const addons = services.flatMap((service) => service.addons ?? []);
      const sessions = services.flatMap((service) =>
        (service.sessions ?? []).map((session) => ({ service, session })),
      );

      const groomers = new Map<string, { _id: string; name: string }>();
      for (const { session } of sessions) {
        for (const who of session.groomers ?? []) {
          if (!groomers.has(who._id)) {
            groomers.set(who._id, { _id: who._id, name: who.name });
          }
        }
      }

      const minutes = [...services, ...addons]
        .map((line) => line.durationMin)
        .filter((value): value is number => value !== null);

      return [
        {
          key: pet.petItemId,
          booking,
          pet,
          services,
          addons,
          value: sumDecimals([
            ...services.map((service) => service.price),
            ...addons.map((addon) => addon.price),
          ]),
          durationMin: minutes.length
            ? minutes.reduce((total, value) => total + value, 0)
            : null,
          sessions,
          sessionsDone: sessions.filter(
            ({ session }) => session.status === "done",
          ).length,
          groomers: [...groomers.values()],
          billing: billingOf(booking, pet),
        },
      ];
    }),
  );
}

/* ─── The cards ───────────────────────────────────────────────────────────── */

export interface PeriodSummary {
  /** Distinct bookings with a live grooming row. */
  visits: number;
  /** Live grooming rows — one per animal per visit. */
  animals: number;
  /** Before any discount: a booking carries prices, not what was charged. */
  value: string;
  averagePerAnimal: string | null;
  /** Whole percent of animals with at least one add-on; null when none. */
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

/** CANCELLED ANIMALS COUNT FOR NOTHING — not in the value, not in the average. */
export function summarisePeriod(
  rows: GroomingRow[],
  today: Date = new Date(),
): PeriodSummary {
  const live = rows.filter((row) => row.pet.status !== "cancelled");
  const value = sumDecimals(live.map((row) => row.value));
  const unbilled = rows.filter((row) => row.billing === "unbilled");

  const oldest = unbilled.reduce<number | null>((max, row) => {
    const days = daysSince(row.booking.scheduledAt, today);
    if (days === null) return max;
    return max === null ? days : Math.max(max, days);
  }, null);

  return {
    visits: new Set(live.map((row) => row.booking._id)).size,
    animals: live.length,
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
    unbilledValue: sumDecimals(unbilled.map((row) => row.value)),
    oldestUnbilledDays: oldest,
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
  const working = rows.filter((row) => row.pet.status === "in_progress");
  const count = (statuses: BookingStatus[]) =>
    rows.filter((row) => statuses.includes(row.pet.status)).length;

  return {
    working: working.length,
    workingValue: sumDecimals(working.map((row) => row.value)),
    queued: count(QUEUED),
    finished: count(FINISHED),
    unconfirmed: count(UNCONFIRMED),
  };
}

/* ─── Narrowing ───────────────────────────────────────────────────────────── */

export type GroomingSort = "schedule_asc" | "schedule_desc" | "value_desc";

/** What the Filter panel holds. `sort` is in it and never counted (§8). */
export interface GroomingFilters {
  sort: GroomingSort;
  statuses: BookingStatus[];
  groomerIds: string[];
  serviceIds: string[];
  locations: BookingLocation[];
}

export const DEFAULT_FILTERS: GroomingFilters = {
  sort: "schedule_asc",
  statuses: [],
  groomerIds: [],
  serviceIds: [],
  locations: [],
};

export function countFilters(filters: GroomingFilters): number {
  return [
    filters.statuses,
    filters.groomerIds,
    filters.serviceIds,
    filters.locations,
  ].filter((values) => values.length > 0).length;
}

export function matchesFilters(
  row: GroomingRow,
  filters: GroomingFilters,
): boolean {
  if (filters.statuses.length && !filters.statuses.includes(row.pet.status)) {
    return false;
  }
  if (
    filters.locations.length &&
    !filters.locations.includes(row.booking.location ?? "in_store")
  ) {
    return false;
  }
  if (
    filters.serviceIds.length &&
    !row.services.some((service) =>
      filters.serviceIds.includes(service.serviceId),
    )
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

/** The two cards that narrow the table when pressed. */
export type GroomingLens = "all" | "unbilled" | "working";

export function matchesLens(row: GroomingRow, lens: GroomingLens): boolean {
  if (lens === "unbilled") return row.billing === "unbilled";
  if (lens === "working") return row.pet.status === "in_progress";

  return true;
}

export function matchesSearch(row: GroomingRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  return [row.pet.petName, row.booking.customerName, row.booking.bookingNumber]
    .filter(Boolean)
    .some((text) => (text as string).toLowerCase().includes(needle));
}

function scheduleOf(row: GroomingRow): number {
  const at = new Date(row.booking.scheduledAt).getTime();
  return Number.isNaN(at) ? 0 : at;
}

export function sortRows(rows: GroomingRow[], sort: GroomingSort): GroomingRow[] {
  const tieBreak = (a: GroomingRow, b: GroomingRow) =>
    (a.booking.bookingNumber ?? "").localeCompare(b.booking.bookingNumber ?? "") ||
    (a.pet.petName ?? "").localeCompare(b.pet.petName ?? "");

  return [...rows].sort((a, b) => {
    if (sort === "value_desc") {
      const x = toMinor(a.value) ?? 0n;
      const y = toMinor(b.value) ?? 0n;
      if (x !== y) return x > y ? -1 : 1;
      return scheduleOf(a) - scheduleOf(b) || tieBreak(a, b);
    }

    const diff = scheduleOf(a) - scheduleOf(b);
    return (sort === "schedule_desc" ? -diff : diff) || tieBreak(a, b);
  });
}

/* ─── Reading ─────────────────────────────────────────────────────────────── */

const ONE_DECIMAL = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/**
 * "Rp 3,1 jt" — for a card, where the full "Rp 3.145.000" does not fit and is
 * not what anybody reads a summary for. The table keeps the full amount.
 *
 * `Number` HERE IS DISPLAY ONLY. Every sum was taken in minor units first; this
 * rounds a finished figure to one decimal, which a double does exactly enough.
 */
export function formatMoneyShort(value: string | null | undefined): string {
  const minor = toMinor(value ?? "");
  if (minor === null) return "—";

  const rupiah = Number(minor) / 10_000;
  const size = Math.abs(rupiah);

  if (size >= 999_500_000) return `Rp ${ONE_DECIMAL.format(rupiah / 1e9)} M`;
  if (size >= 999_500) return `Rp ${ONE_DECIMAL.format(rupiah / 1e6)} jt`;
  if (size >= 1_000) return `Rp ${Math.round(rupiah / 1_000)} rb`;

  return formatMoney(value);
}

/** "09.00", in the shop's own clock — never through UTC. */
export function clockOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";

  return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

/** "13 Sep". */
export function dayOf(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "—" : DAY_FORMAT.format(at);
}
