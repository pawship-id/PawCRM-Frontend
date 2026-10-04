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
/**
 * How much of `discount` a MEMBERSHIP BENEFIT paid for (29 September 2026).
 *
 * The same shape as `bookingShareOf` above and for the same reason: the server
 * stores one combined figure on the line, and the till has to be able to show
 * the parts separately — a cashier looking at "Rp 265.000" needs to know which
 * of it was the card and which of it was theirs.
 */
export function membershipShareOf(
  item: Pick<PosItem, "membershipDiscount">,
): string | null {
  return item.membershipDiscount && isPositive(item.membershipDiscount)
    ? item.membershipDiscount
    : null;
}

/**
 * THE PART OF THE LINE'S DISCOUNT THE CASHIER ACTUALLY TYPED.
 *
 * Both shares come off: the booking's, and now the membership benefit's. This
 * is what the discount popover is seeded with and what is sent back on the next
 * write — feeding it the combined figure would make the till re-send the card's
 * benefit as a typed discount, and the server would then apply the benefit
 * again on top of it.
 */
export function ownDiscountOf(
  item: Pick<PosItem, "discount" | "bookingDiscount" | "membershipDiscount">,
): PosDiscount | null {
  const share = bookingShareOf(item);
  const benefit = membershipShareOf(item);

  if ((!share && !benefit) || !item.discount) return item.discount;

  let own = item.discount.resolvedAmount;
  if (share) own = subtractDecimals(own, share);
  if (benefit) own = subtractDecimals(own, benefit);

  if (!isPositive(own)) return null;

  return {
    mode: "amount",
    value: trimDecimal(own),
    resolvedAmount: own,
    approvedBy: item.discount.approvedBy,
  };
}
