"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, sumDecimals } from "@/utils/decimal";
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
  addons = [],
  onQtyChange,
  onRemove,
  onDiscountChange,
  disabled = false,
}: {
  item: PosItem;
  index: number;
  /**
   * The add-ons attached to THIS service, drawn inside its line rather than
   * beside it.
   *
   * "Extra Handling" is not a third thing the customer bought — it is something
   * done to the bath — and a basket that lists it as a line of its own asks the
   * cashier to check three rows against two services. Each still carries its own
   * price and its own controls, because each is still billed and may still be
   * taken off.
   *
   * EMPTY FOR EVERYTHING ELSE: retail lines, add-ons themselves (nesting is one
   * deep by construction — see the booking model), and a service nobody attached
   * anything to.
   */
  addons?: Array<{ item: PosItem; index: number }>;
  onQtyChange: (index: number, qty: string) => void;
  /**
   * Takes lines out — a LIST when a service goes, because its add-ons go with
   * it. They have no bin of their own, so a service removed on its own would
   * leave them in the basket as lines nothing can reach: `nestAddons` stands an
   * add-on whose parent is gone back up as a top-level line, and that line has
   * no way to be removed either.
   */
  onRemove: (index: number | number[]) => void;
  onDiscountChange: (
    index: number,
    discount: { mode: PosDiscountMode; value: string } | null,
  ) => void;
  disabled?: boolean;
}) {
  const qty = Number(item.qty);
  const isService = item.kind === "service";

  /**
   * WHAT THIS SERVICE COMES TO — its own line plus every add-on under it.
   *
   * The figure on the right of a line answers "how much for this?", and once the
   * add-ons moved inside the line, "this" stopped being the bath alone. It read
   * Rp 120.000 beside a block that plainly totalled 140.000, and the only way to
   * get the real number was to add two figures the screen had already put next
   * to each other.
   *
   * GROSS, like `lineTotal` itself. Each discount is still shown as its own
   * subtraction on the line that earned it — netting them off here would make a
   * discount disappear from the one place it is explained.
   *
   * SUMMED IN MINOR UNITS, never with `Number(a) + Number(b)`. Every one of
   * these figures reached the screen as a decimal string precisely so it never
   * passed through a float; adding them back up in JavaScript numbers
   * reintroduces the error at the last possible moment, in the one place a
   * cashier is guaranteed to look. What is added is what the SERVER priced — no
   * line's own total is recomputed here.
   */
  const subtotal = sumDecimals([
    item.lineTotal,
    ...addons.map((addon) => addon.item.lineTotal),
  ]);

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
          {formatMoney(subtotal)}
        </span>
      </div>

      {/*
        UNDER THE SERVICE, INDENTED, and with no border of its own — the whole
        point is that this does not read as another purchase. The left rule ties
        the run to the service above it, which is what the cashier is checking:
        "the bath, plus handling".

        EACH KEEPS ITS PRICE, because the service's figure above is now their
        sum and a total nobody can break down is a total nobody can check. What
        each does NOT keep is a control of its own — see below.
      */}
      {addons.length > 0 && (
        <ul className="mt-1.5 ml-1 flex flex-col gap-1 border-l border-border pl-2">
          {addons.map(({ item: addon, index: addonIndex }) => (
            <li
              key={`${addon.refId}-${addonIndex}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-foreground">
                  {/* A plus, not a bullet: it says "on top of", which is what an
                      add-on is and what its price is doing to the total. */}
                  {`+ ${addon.name}`}
                </span>
                {addon.discount && (
                  <span className="block text-xs tabular-nums text-success">
                    −{formatMoney(addon.discount.resolvedAmount)}
                  </span>
                )}
              </span>

              {/*
                NO CONTROLS OF ITS OWN — the discount and the bin belong to the
                SERVICE, and an add-on is priced and taken off with the thing it
                is attached to. Two icon buttons per add-on put four controls in
                a block that sells one grooming, and the two that mattered got
                harder to find.
              */}
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {formatMoney(addon.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      )}

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
              onClick={() =>
                onRemove([index, ...addons.map((addon) => addon.index)])
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
