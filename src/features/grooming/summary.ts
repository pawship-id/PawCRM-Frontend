import { isoDate, type DateRange, type GroomingRow } from "./board";

/**
 * Grooming › Ringkasan — the period's performance, from `buloo-navigation-v3`
 * (`groomingRingkasan`). Pure functions over the board's rows, so every figure
 * can be checked without a server.
 *
 * WHY "HISTORY" EXISTS. Three of the mockup's questions reach outside the
 * period somebody picked — rebooking, who stopped coming, and which animals
 * are new. They are answered from one longer read (`HISTORY_BACK_DAYS` back,
 * `HISTORY_AHEAD_DAYS` ahead), so each is bounded by that window and says so.
 */

/** How far back the history read reaches. */
export const HISTORY_BACK_DAYS = 365;
/**
 * How far ahead — an upcoming booking is what makes a customer "coming back",
 * and what counts as a rebook for a visit near the end of its window.
 */
export const HISTORY_AHEAD_DAYS = 90;

/** "Rebook rate (30 hari)" — the mockup's fixed window. */
export const REBOOK_DAYS = 30;

/** The "belum kembali ≥ X hari" choices, and where it opens. */
export const DORMANT_CHOICES = [15, 30, 45, 60, 75, 90] as const;
export const DEFAULT_DORMANT_DAYS = 45;

const DAY_MS = 86_400_000;

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** The history read's range, around `today`. */
export function historyRange(today: Date = new Date()): DateRange {
  return {
    from: isoDate(addDays(today, -HISTORY_BACK_DAYS)),
    to: isoDate(addDays(today, HISTORY_AHEAD_DAYS)),
  };
}

const live = (row: GroomingRow) => row.booking.status !== "cancelled";
const at = (row: GroomingRow) => new Date(row.booking.scheduledAt).getTime();

export interface RebookRate {
  /** Animals with a visit in the cohort window. */
  animals: number;
  /** Of those, the ones booked again within `REBOOK_DAYS` of that visit. */
  rebooked: number;
  /** Whole percent; null when there was nobody to ask about. */
  percent: number | null;
}

/**
 * REBOOK RATE (30 HARI) — of the animals groomed between 60 and 30 days ago,
 * how many were booked for grooming again within 30 days of their LAST visit
 * in that window.
 *
 * THE COHORT IS A FIXED WINDOW, not the period above, and ends 30 days ago:
 * an animal groomed last week has not had its 30 days yet, and counting it
 * would drag the rate down for no reason but the calendar. Booked-ahead visits
 * count — a booking made for next week is a rebook already.
 */
export function rebookRate(
  history: GroomingRow[],
  now: Date = new Date(),
): RebookRate {
  const end = addDays(now, -REBOOK_DAYS).getTime();
  const start = addDays(now, -REBOOK_DAYS * 2).getTime();

  const byPet = new Map<string, number[]>();
  for (const row of history) {
    const petId = row.booking.petId;
    if (!petId || !live(row)) continue;
    const list = byPet.get(petId) ?? [];
    list.push(at(row));
    byPet.set(petId, list);
  }

  let animals = 0;
  let rebooked = 0;
  for (const times of byPet.values()) {
    const inCohort = times.filter((t) => t >= start && t < end);
    if (inCohort.length === 0) continue;

    animals += 1;
    const last = Math.max(...inCohort);
    const limit = last + REBOOK_DAYS * DAY_MS;
    if (times.some((t) => t > last && t <= limit)) rebooked += 1;
  }

  return {
    animals,
    rebooked,
    percent: animals ? Math.round((rebooked / animals) * 100) : null,
  };
}

export interface DormantCustomer {
  customerId: string;
  name: string;
  /** The last grooming visit — the latest live booking already past. */
  lastAt: string;
  days: number;
}

/**
 * "PELANGGAN GROOMING BELUM KEMBALI ≥ X HARI" — customers whose last grooming
 * visit is at least `days` ago and who have nothing booked since.
 *
 * GROOMING ONLY: a customer who came in for the hotel last week but has not
 * been groomed for two months is on this list, which is the point of having
 * it here rather than Pelanggan's all-line one.
 *
 * Bounded by the history read — somebody last seen more than a year ago is
 * not here.
 */
export function dormantCustomers(
  history: GroomingRow[],
  days: number,
  now: Date = new Date(),
): DormantCustomer[] {
  const nowMs = now.getTime();
  const last = new Map<string, { name: string; at: number }>();
  const upcoming = new Set<string>();

  for (const row of history) {
    if (!live(row)) continue;
    const id = row.booking.customerId;
    const time = at(row);
    if (time > nowMs) {
      upcoming.add(id);
      continue;
    }
    const seen = last.get(id);
    if (!seen || time > seen.at) {
      last.set(id, { name: row.booking.customerName ?? "Tanpa nama", at: time });
    }
  }

  const today = addDays(now, 0).getTime();
  return [...last.entries()]
    .filter(([id]) => !upcoming.has(id))
    .map(([customerId, seen]) => {
      const day = new Date(seen.at);
      const since = Math.round(
        (today -
          new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()) /
          DAY_MS,
      );
      return {
        customerId,
        name: seen.name,
        lastAt: new Date(seen.at).toISOString(),
        days: since,
      };
    })
    .filter((customer) => customer.days >= days)
    .sort((a, b) => b.days - a.days);
}

export interface NewPet {
  petId: string;
  petName: string;
  customerId: string;
  customerName: string;
  /** 1 or 2 — which grooming visit of its life the period holds. */
  visit: 1 | 2;
}

/**
 * "HEWAN BARU DI GROOMING (KUNJUNGAN KE-1 ATAU KE-2)" — animals booked in the
 * period whose grooming visits, counted over their whole life, are one or two.
 *
 * PER ANIMAL, not per customer: an old customer's new puppy is here.
 *
 * Counted from the animal's FIRST grooming ever (`GET /bookings/first-visits`)
 * and the history read. An animal whose first visit lies before that read is
 * left out rather than guessed at — its count is not known, and it has been
 * coming for over a year anyway.
 */
export function newPets(
  period: GroomingRow[],
  history: GroomingRow[],
  firstAtByPet: ReadonlyMap<string, string>,
  historyFrom: string,
  periodTo: string,
): NewPet[] {
  const end = periodTo
    ? new Date(`${periodTo}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;
  const from = new Date(`${historyFrom}T00:00:00`).getTime();

  const pets = new Map<string, GroomingRow>();
  for (const row of period) {
    const petId = row.booking.petId;
    if (petId && live(row) && !pets.has(petId)) pets.set(petId, row);
  }

  const out: NewPet[] = [];
  for (const [petId, row] of pets) {
    const first = firstAtByPet.get(petId);
    if (!first || new Date(first).getTime() < from) continue;

    const visits = history.filter(
      (h) => h.booking.petId === petId && live(h) && at(h) <= end,
    ).length;
    if (visits !== 1 && visits !== 2) continue;

    out.push({
      petId,
      petName: row.booking.petName ?? "Tanpa nama",
      customerId: row.booking.customerId,
      customerName: row.booking.customerName ?? "Tanpa nama",
      visit: visits,
    });
  }

  return out.sort((a, b) => a.visit - b.visit || a.petName.localeCompare(b.petName, "id-ID"));
}
