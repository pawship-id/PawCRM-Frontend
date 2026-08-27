"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatMoney, formatQty } from "@/utils/decimal";
import type { PosItem } from "@/types/api";

/** One line's answer: how many come back, and whether they go on the shelf. */
export interface ReturnDraftLine {
  qty: number;
  returnToStock: boolean;
}

/**
 * Choosing what comes back (FR-11).
 *
 * A RETURN IS PARTIAL BY DEFAULT — every line starts at zero, and the cashier
 * counts up what is actually in the bag. Starting at the full quantity would
 * make "return everything" the one-tap answer and "return one of three" the
 * careful one, which is backwards: most returns are one item out of a basket.
 *
 * `returnToStock` IS PER LINE, because one bag holds both an unopened sack and a
 * chewed toy. A single answer for the whole return would either restock
 * something unsellable or write off something perfectly good.
 *
 * A SERVICE HAS NO CHECKBOX. A grooming that already happened is not on a shelf;
 * the server forces the flag to false whatever is sent, and offering a control
 * that does nothing is worse than offering none.
 *
 * NO REFUND FIGURE IS SHOWN PER LINE. What a line gives back is what was PAID
 * for it, net of its share of the basket discount — arithmetic the server owns
 * and this component would have to duplicate to display. A figure computed here
 * that disagreed with the refund would be discovered by a customer.
 */
export function ReturnItemsPicker({
  items,
  remaining,
  draft,
  onChange,
  disabled = false,
}: {
  items: PosItem[];
  /** How many of each line are still returnable, after earlier returns. */
  remaining: number[];
  draft: Record<number, ReturnDraftLine>;
  onChange: (index: number, line: ReturnDraftLine) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => {
        const left = remaining[index] ?? 0;
        const line = draft[index] ?? { qty: 0, returnToStock: true };
        const isService = item.kind === "service";

        return (
          <li key={`${item.refId}-${index}`} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.name}
                </span>
                <span className="block text-xs tabular-nums text-muted">
                  {formatQty(item.qty)} × {formatMoney(item.unitPrice)}
                  {left <= 0 && " · sudah diretur semua"}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  disabled={disabled || line.qty <= 0}
                  aria-label={`Kurangi ${item.name}`}
                  onClick={() =>
                    onChange(index, { ...line, qty: line.qty - 1 })
                  }
                >
                  <Minus className="size-4" />
                </Button>

                <span className="w-8 text-center text-sm font-medium tabular-nums">
                  {line.qty}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  disabled={disabled || line.qty >= left}
                  aria-label={`Tambah ${item.name}`}
                  onClick={() =>
                    onChange(index, { ...line, qty: line.qty + 1 })
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Only asked once something on this line is actually coming back. */}
            {line.qty > 0 && !isService && (
              <div className="mt-2 flex items-center gap-2">
                <Checkbox
                  id={`restock-${index}`}
                  checked={line.returnToStock}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(index, {
                      ...line,
                      returnToStock: checked === true,
                    })
                  }
                />
                <Label
                  htmlFor={`restock-${index}`}
                  className="text-sm font-normal text-muted"
                >
                  Masih layak jual, kembalikan ke stok
                </Label>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
