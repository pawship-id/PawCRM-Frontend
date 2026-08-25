"use client";

import { Plus, Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { PosCatalogItem, PosStockState } from "@/types/api";

/**
 * The stock badge (FR-1).
 *
 * NAMED TINT + SATURATED INK + TRANSPARENT BORDER, the one badge convention —
 * ui-rules §9. The tints are the `bg-tint-*` tokens rather than opacity
 * arithmetic, which goes muddy composited over a selected row.
 *
 * ORANGE IS THE LOW ONE, and this is the one place the POS spends it: §4 gives
 * orange the meaning "a human must act", and a shelf about to run out is exactly
 * that. It is `text-warning`, not `text-secondary` — §1.2, orange is a fill and
 * never a text colour. `out` is red because the tile is unusable, not urgent.
 *
 * EVERY BADGE CARRIES A WORD — §1.3 — so "Habis" is legible to somebody who
 * cannot tell the tints apart.
 */
const STOCK_STYLES: Record<PosStockState, string> = {
  ok: "bg-tint-success text-success",
  low: "bg-tint-warning text-warning",
  out: "bg-tint-danger text-danger",
};

function stockLabel(state: PosStockState, qty: string): string {
  if (state === "out") return "Habis";
  // Whole units: nobody sells a third of a sack at a till.
  return `${Math.floor(Number(qty))} tersisa`;
}

/**
 * One tile in the till grid.
 *
 * THREE SHAPES BEHIND ONE CARD. A sellable product shows a price and a stock
 * badge; a PARENT shows "N varian" and opens a picker instead of adding; a
 * SERVICE shows a price and no badge at all — a badge saying "in stock" on a
 * grooming invites the question of how many are left.
 *
 * AN EMPTY SHELF DISABLES THE BUTTON rather than hiding the tile. FR-1 is
 * explicit, and it is the right call: a cashier looking for something needs to
 * see that the shop stocks it and has run out, not that it does not exist.
 *
 * Hand-rolled rather than `<Card>` — not an oversight of ui-rules §2. Card's
 * `px-6` is drawn for a page panel; on a tile two-to-a-row on a narrow till it
 * would leave almost no room for the name it exists to show.
 */
export function PosProductCard({
  item,
  onAdd,
  onExpand,
  disabled = false,
}: {
  item: PosCatalogItem;
  onAdd: (item: PosCatalogItem) => void;
  /** Called for a parent — the variant picker opens instead of adding. */
  onExpand: (item: PosCatalogItem) => void;
  disabled?: boolean;
}) {
  const isParent = item.variantCount !== null;
  const soldOut = item.stock?.state === "out";

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium text-foreground">
            {item.name}
          </span>
          {item.stock && (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 border-transparent",
                STOCK_STYLES[item.stock.state],
              )}
            >
              {stockLabel(item.stock.state, item.stock.qty)}
            </Badge>
          )}
        </div>

        {item.code && (
          <span className="mt-0.5 block truncate text-xs tabular-nums text-muted">
            {item.code}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {/* A parent quotes no price — its variants carry them. */}
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {isParent ? `${item.variantCount} varian` : formatMoney(item.price)}
        </span>

        {isParent ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onExpand(item)}
            disabled={disabled}
            aria-label={`Pilih varian ${item.name}`}
          >
            <Layers className="size-4" />
            Pilih
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => onAdd(item)}
            disabled={disabled || soldOut}
            aria-label={`Tambah ${item.name}`}
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
