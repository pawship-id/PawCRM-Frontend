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

  /**
   * Whether this line may still be taken out of the basket (FR-3).
   *
   * ONLY A BOOKING THIS BASKET RAISED CAN LOCK IT. Removing such a line DELETES
   * the booking, so once the animal has checked in that would erase work already
   * happening — the server refuses it, and this is what stops a cashier pressing
   * the bin and being told no.
   *
   * A PULLED APPOINTMENT NEVER LOCKS THE LINE. The basket only claims it;
   * removing the line releases the claim and touches the document not at all.
   * That is also how a mis-pull is undone, so locking it would trap the cashier.
   *
   * The first version left `bookingOwned` out and locked every pulled line the
   * moment it landed — the bridge offers appointments in any status but
   * `cancelled`, and almost none of those is `draft` — so a pulled grooming
   * could be neither discounted nor taken back out.
   */
  const locked =
    item.bookingOwned &&
    item.bookingStatus !== null &&
    item.bookingStatus !== "draft";

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

          {/*
            SAID OUT LOUD, not only on hover. A till is touched, not pointed at,
            so the `title` above reaches nobody standing at one — and a greyed
            bin with no explanation is how somebody presses it three times.
          */}
          {locked && (
            <span className="mt-0.5 block text-xs text-warning">
              {item.bookingNumber
                ? `${item.bookingNumber} sudah dimulai`
                : "Layanannya sudah dimulai"}
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
            <Badge
              variant="outline"
              className="border-transparent bg-secondary"
            >
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
          {/*
            A DISCOUNT IS NEVER LOCKED. It changes what the customer pays, not
            what the animal is having — the booking behind the line stores the
            service and its list price, and neither moves. Greying this out was
            the same over-reach as locking the bin: it left a cashier unable to
            give 10% off a grooming that was already on the table.
          */}
          <PosDiscountPopover
            value={item.discount}
            disabled={disabled}
            label={`Diskon ${item.name}`}
            onApply={(discount) => onDiscountChange(index, discount)}
          />
          {/*
            WRAPPED, so the hint survives the disabled button. A disabled control
            swallows pointer events in several engines, and the hint would then
            never appear on the one occasion it is needed.
          */}
          <span
            title={
              locked
                ? "Layanannya sudah dimulai — tidak bisa dihapus dari kasir."
                : undefined
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-danger"
              disabled={disabled || locked}
              aria-label={`Hapus ${item.name}`}
              onClick={() => onRemove(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
