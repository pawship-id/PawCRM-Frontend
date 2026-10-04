"use client";

import { formatMoney, isPositive, subtractDecimals } from "@/utils/decimal";
import type { PosItem } from "@/types/api";

/**
 * What a line bills, after everything taken off it.
 *
 * `lineTotal` IS THE PRICE BEFORE ANY DISCOUNT — qty × unit price, as the
 * server stores it — and `discount.resolvedAmount` is everything taken off
 * together: the cashier's, the booking's share, and a membership benefit's.
 * Subtracting gives what this line actually adds to the basket.
 *
 * NEVER BELOW ZERO. The server already caps a benefit at the line's own total
 * (`benefitMinor > lineTotal - share ? lineTotal - share : …`), so this is a
 * floor against arithmetic, not a rule of its own.
 */
export function netOf(
  item: Pick<PosItem, "lineTotal" | "discount">,
): string {
  const off = item.discount?.resolvedAmount ?? null;
  if (!off || !isPositive(off)) return item.lineTotal;

  const net = subtractDecimals(item.lineTotal, off);
  return isPositive(net) ? net : "0.0000";
}

/**
 * The line's figure — struck through with what it comes to under it when
 * something was taken off (1 October 2026, on request).
 *
 * ─── WHY THE STRUCK PRICE, AND WHY HERE ────────────────────────────────────
 *
 * The saving used to be a small green "−Rp 150.000" beside the unit price on
 * the left, while the bold figure on the right went on reading the price BEFORE
 * it. A cashier reading a free grooming saw "Rp 150.000" in the largest type on
 * the row and the nought nowhere — they had to do the subtraction to find out
 * what they were charging.
 *
 * So the row now says the same thing a shop window does: the old price crossed
 * out, the price being charged under it.
 *
 * EVERY DISCOUNT, not only a benefit's. A line cut to nothing by a card and one
 * cut to nothing by a cashier bill the same, and two ways of drawing one fact
 * is how a screen stops being read.
 */
export function PosLineTotal({ item }: { item: PosItem }) {
  const net = netOf(item);
  const discounted = net !== item.lineTotal;

  if (!discounted) {
    return (
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {formatMoney(item.lineTotal)}
      </span>
    );
  }

  return (
    <span className="shrink-0 text-right">
      <span className="block text-xs tabular-nums text-muted line-through">
        {formatMoney(item.lineTotal)}
      </span>
      {/*
        `text-warning`, not the success green the saving used to use: this is
        the figure being CHARGED, and green on a till reads as "paid".
      */}
      <span className="block text-sm font-semibold tabular-nums text-warning">
        {formatMoney(net)}
      </span>
    </span>
  );
}
