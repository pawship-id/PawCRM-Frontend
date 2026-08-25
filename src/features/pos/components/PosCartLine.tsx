"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { PosItem, PosDiscountMode } from "@/types/api";

import { PosDiscountPopover } from "./PosDiscountPopover";

/**
 * One line in the basket.
 *
 * QUANTITY IS STEPPED, NOT TYPED. A till is used with a finger, and −/+ on a
 * 44px target is faster and less wrong than a number field. A product's line is
 * also the only one that steps: a SERVICE is one line per animal (FR-3), so its
 * quantity is fixed at 1 and the stepper would be a control that does nothing.
 *
 * THE LINE SHOWS WHAT THE SERVER PRICED. `lineTotal` is read, never recomputed —
 * qty × price would round differently from the server's minor-unit arithmetic on
 * a 7,5% discount, and the receipt would then disagree with the screen.
 */
export function PosCartLine({
  item,
  index,
  onQtyChange,
  onRemove,
  onDiscountChange,
  disabled = false,
}: {
  item: PosItem;
  index: number;
  onQtyChange: (index: number, qty: string) => void;
  onRemove: (index: number) => void;
  onDiscountChange: (
    index: number,
    discount: { mode: PosDiscountMode; value: string } | null,
  ) => void;
  disabled?: boolean;
}) {
  const qty = Number(item.qty);
  const isService = item.kind === "service";

  return (
    <div className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {item.name}
          </span>

          {/*
            The animal and the groomer, when the line carries them. This is the
            traceability the PRD asks for made visible at the till: a cashier who
            can see "Bruno · Rina" on the line can catch the wrong pet before the
            receipt prints, which is the only moment it is cheap to catch.
          */}
          {(item.petName || item.groomerName) && (
            <span className="mt-0.5 block truncate text-xs text-muted">
              {[item.petName, item.groomerName].filter(Boolean).join(" · ")}
            </span>
          )}

          <span className="mt-0.5 block text-xs tabular-nums text-muted">
            {formatMoney(item.unitPrice)}
            {item.discount && (
              <>
                {" · "}
                <span className="text-success">
                  −{formatMoney(item.discount.resolvedAmount)}
                </span>
              </>
            )}
          </span>
        </div>

        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatMoney(item.lineTotal)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {isService ? (
            /* A word, not a bare "1" — §1.3. */
            <Badge variant="outline" className="border-transparent bg-secondary">
              Layanan
            </Badge>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={disabled}
                aria-label={`Kurangi ${item.name}`}
                onClick={() =>
                  qty <= 1
                    ? onRemove(index)
                    : onQtyChange(index, String(qty - 1))
                }
              >
                <Minus className="size-4" />
              </Button>

              <span className="w-8 text-center text-sm font-medium tabular-nums">
                {qty}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={disabled}
                aria-label={`Tambah ${item.name}`}
                onClick={() => onQtyChange(index, String(qty + 1))}
              >
                <Plus className="size-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <PosDiscountPopover
            value={item.discount}
            disabled={disabled}
            label={`Diskon ${item.name}`}
            onApply={(discount) => onDiscountChange(index, discount)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-danger"
            disabled={disabled}
            aria-label={`Hapus ${item.name}`}
            onClick={() => onRemove(index)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
