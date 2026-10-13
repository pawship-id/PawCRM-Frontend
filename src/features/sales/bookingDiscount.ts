import {
  divideRound,
  isPositive,
  subtractDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type {
  InvoiceDiscountMode,
  Booking,
  BookingAddon,
  BookingMainService,
  CustomerInvoiceItem,
  InvoiceBooking,
} from "@/types/api";

/**
 * A pulled booking's discounts, split the way the till shows them
 * (15 September 2026): each line's OWN discount on the line, and the booking's
 * share of "Diskon seluruh booking" once, in the totals under "Diskon baris".
 *
 * The server bills a booking line at `discountAmount` — own and share together —
 * so the invoice's line discount total is unchanged; this only says which part
 * is which. `discount.resolvedAmount` is the line's own; the share is the rest.
 */

type PriceLine = Pick<BookingMainService | BookingAddon, "price" | "discount" | "discountAmount">;

const ZERO = "0.0000";

const HUNDRED_MINOR = BigInt(100) * BigInt(10_000);

/**
 * What a line's own discount takes off `basisMinor` — the server's rule
 * (`utils/discount.js`): a percent half-up and never past 100, a rupiah amount
 * never past what it is taken from. Invalid or empty takes nothing.
 */
export function ownDiscountMinor(
  basisMinor: bigint,
  mode: InvoiceDiscountMode,
  value: string,
): bigint {
  const typed = value === "" ? null : toMinor(value.replace(",", "."));
  if (typed === null || typed <= BigInt(0) || basisMinor <= BigInt(0)) return BigInt(0);

  const off =
    mode === "percent"
      ? divideRound(basisMinor * (typed > HUNDRED_MINOR ? HUNDRED_MINOR : typed), HUNDRED_MINOR)
      : typed;

  return off > basisMinor ? basisMinor : off;
}

/**
 * WHAT THE SERVER STORES ON A PULLED BOOKING LINE whose own discount was typed:
 * the typed discount on the price less the booking's share, plus that share,
 * as one nominal figure (`#pulledLineDiscount`, and the edit's same rule).
 */
export function pulledLineDiscount(
  price: string,
  share: string,
  mode: InvoiceDiscountMode,
  value: string,
): { mode: "amount"; value: string } | null {
  const priceMinor = toMinor(price) ?? BigInt(0);
  const shareMinor = toMinor(share) ?? BigInt(0);
  const capped = shareMinor > priceMinor ? priceMinor : shareMinor;
  const whole = ownDiscountMinor(priceMinor - capped, mode, value) + capped;

  return whole > BigInt(0) ? { mode: "amount", value: toDecimalString(whole) } : null;
}

/** The line's own discount, or null. */
export function ownDiscountOfLine(line: PriceLine): string | null {
  const own = line.discount?.resolvedAmount ?? null;
  return own && isPositive(own) ? own : null;
}

/** The line's part of "Diskon seluruh booking" — never below zero. */
export function bookingShareOfLine(line: PriceLine): string {
  if (!line.discountAmount) return ZERO;

  const share = subtractDecimals(line.discountAmount, ownDiscountOfLine(line) ?? ZERO);
  return isPositive(share) ? share : ZERO;
}

const linesOf = (booking: Booking): PriceLine[] => [
  booking.service,
  ...(booking.service.addons ?? []),
];

/** The booking's whole share of "Diskon seluruh booking". */
export function bookingShareOf(booking: Booking): string {
  return sumDecimals(linesOf(booking).map(bookingShareOfLine));
}

/**
 * ON A SAVED INVOICE: how much of the item discount is the bookings' shares of
 * "Diskon seluruh booking".
 *
 * Each booked line is matched to its booking's service or add-on by catalogue
 * id, and its share is CAPPED at the discount the line actually carries — the
 * line discount can be changed when the invoice is edited, and a share larger
 * than what came off would show a discount nobody was given.
 */
export function invoiceBookingShares(
  items: InvoiceShareItem[],
  bookings: InvoiceBooking[],
): string {
  return sumDecimals(items.map((item) => invoiceBookingShareOf(item, bookings)));
}

type InvoiceShareItem = Pick<
  CustomerInvoiceItem,
  "bookingId" | "refId" | "parentServiceId" | "discount"
>;

/**
 * ONE saved invoice line's part of "Diskon seluruh booking", or null — the same
 * reading `invoiceBookingShares` totals, so a row and the recap never disagree.
 */
export function invoiceBookingShareOf(
  item: InvoiceShareItem,
  bookings: InvoiceBooking[],
): string | null {
  const booking = item.bookingId
    ? bookings.find((one) => String(one._id) === String(item.bookingId))
    : undefined;
  if (!booking) return null;

  /* Defensive: a booking view without its service simply has no share. */
  const service = booking.service;
  const line = item.parentServiceId
    ? (service?.addons ?? []).find((addon) => addon.serviceId === item.refId)
    : service?.serviceId === item.refId
      ? service
      : undefined;

  const share = line?.bookingShare ?? null;
  const off = item.discount?.resolvedAmount ?? null;
  if (!share || !off || !isPositive(share) || !isPositive(off)) return null;

  return isPositive(subtractDecimals(share, off)) ? off : share;
}

/** What the booking comes to after its lines' OWN discounts — before its share. */
export function afterOwnDiscounts(booking: Booking): string {
  const lines = linesOf(booking);

  return subtractDecimals(
    sumDecimals(lines.map((line) => line.price)),
    sumDecimals(lines.map(ownDiscountOfLine)),
  );
}
