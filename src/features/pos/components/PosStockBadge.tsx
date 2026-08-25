"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PosStockState } from "@/types/api";

/**
 * Whether a thing can be sold right now (FR-1).
 *
 * NAMED TINT + SATURATED INK + TRANSPARENT BORDER, the one badge convention —
 * ui-rules §9. The tints are the `bg-tint-*` tokens rather than opacity
 * arithmetic, which goes muddy composited over a hovered row.
 *
 * ORANGE IS THE LOW ONE, and this is the one place the POS spends it: §4 gives
 * orange the meaning "a human must act", and a shelf about to run out is exactly
 * that. It is `text-warning`, not `text-secondary` — §1.2, orange is a fill and
 * never a text colour. `out` is red because the tile is unusable, not urgent.
 *
 * EVERY BADGE CARRIES A WORD — §1.3 — so "Habis" is legible to somebody who
 * cannot tell the tints apart.
 *
 * ITS OWN COMPONENT because two things draw it: the grid tile and the variant
 * picker. Two copies of a colour rule is how one of them ends up calling a
 * near-empty shelf green.
 */
const STOCK_STYLES: Record<PosStockState, string> = {
  ok: "bg-tint-success text-success",
  low: "bg-tint-warning text-warning",
  out: "bg-tint-danger text-danger",
};

function label(state: PosStockState, qty: string): string {
  if (state === "out") return "Habis";
  // Whole units: nobody sells a third of a sack at a till.
  return `${Math.floor(Number(qty))} tersisa`;
}

export function PosStockBadge({
  stock,
  className,
}: {
  /**
   * Null on a service, a parent and a bundle — and null is NOT the same as
   * `ok`. A badge saying "in stock" on a grooming invites the question of how
   * many are left.
   */
  stock: { qty: string; state: PosStockState } | null;
  className?: string;
}) {
  if (!stock) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border-transparent",
        STOCK_STYLES[stock.state],
        className,
      )}
    >
      {label(stock.state, stock.qty)}
    </Badge>
  );
}
