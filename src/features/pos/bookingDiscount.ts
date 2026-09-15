import { isPositive, subtractDecimals, trimDecimal } from "@/utils/decimal";
import type { PosDiscount, PosItem } from "@/types/api";

/**
 * A basket line's discount, split into the two things the till shows apart
 * (15 September 2026).
 *
 * The server keeps `discount` as the WHOLE line discount — the totals, the sale
 * and the journal read that — and `bookingDiscount` as the part of it the
 * booking's "Diskon seluruh booking" brought. The till draws the line's own part
 * on the line, the booking's share under the booking, and sends the OWN part
 * back on every write; the server adds the share again from the booking, so it
 * is never counted twice.
 */

/** The booking's share inside this line's discount, or null. */
export function bookingShareOf(item: Pick<PosItem, "bookingDiscount">): string | null {
  return item.bookingDiscount && isPositive(item.bookingDiscount)
    ? item.bookingDiscount
    : null;
}

/**
 * The line's OWN discount — what the cashier sees on the line and edits.
 *
 * Without a share it is `discount` as stored, mode and all. With one it is the
 * remainder, as whole rupiah: the stored figure is nominal by then, and the
 * popover takes a rupiah amount without decimals.
 */
export function ownDiscountOf(
  item: Pick<PosItem, "discount" | "bookingDiscount">,
): PosDiscount | null {
  const share = bookingShareOf(item);

  if (!share || !item.discount) return item.discount;

  const own = subtractDecimals(item.discount.resolvedAmount, share);

  if (!isPositive(own)) return null;

  return {
    mode: "amount",
    value: trimDecimal(own),
    resolvedAmount: own,
    approvedBy: item.discount.approvedBy,
  };
}
