import type { GroomingRow } from "@/features/grooming/board";
import {
  divideRound,
  subtractDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import { rideOf } from "./ride";

/**
 * The Antar-Jemput board's own figures — the mockup's four cards.
 *
 * THE ROWS ARE GROOMING'S (`toGroomingRows`), read for this line: a ride is a
 * booking like any other, so the arithmetic that turns bookings into rows, and
 * narrows, sorts and searches them, is the one `features/grooming/board.ts`
 * already has. What differs is what the cards say.
 *
 * PURE, so it is tested without a DOM (`src/tests/antarJemputBoard.test.ts`).
 */
export interface RidePeriodSummary {
  /** Live rides — one direction each. */
  bookings: number;
  /** Before any discount. */
  gross: string;
  /** What the bills come to. */
  net: string;
  /** `gross − net`. */
  discount: string;
  /** Net over the live rides; null when there are none. */
  averagePerRide: string | null;
  unbilledCount: number;
  unbilledValue: string;
  /** Every animal carried, across the live rides. */
  animals: number;
  /** Distinct customers served. */
  customers: number;
}

/** CANCELLED RIDES COUNT FOR NOTHING — not in the money, not in the animals. */
export function summariseRides(rows: GroomingRow[]): RidePeriodSummary {
  const live = rows.filter((row) => row.booking.status !== "cancelled");
  const gross = sumDecimals(live.map((row) => row.value));
  const net = sumDecimals(live.map((row) => row.net));
  const unbilled = rows.filter((row) => row.billing === "unbilled");

  return {
    bookings: live.length,
    gross,
    net,
    discount: subtractDecimals(gross, net),
    averagePerRide: live.length
      ? toDecimalString(divideRound(toMinor(net) ?? 0n, BigInt(live.length)))
      : null,
    unbilledCount: unbilled.length,
    unbilledValue: sumDecimals(unbilled.map((row) => row.net)),
    animals: live.reduce((total, row) => total + rideOf(row.booking).animals, 0),
    customers: new Set(live.map((row) => row.booking.customerId)).size,
  };
}
