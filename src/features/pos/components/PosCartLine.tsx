"use client";

import { Minus, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { PosItem } from "@/types/api";

import { ownDiscountOf } from "../bookingDiscount";
import { variantDetailOf } from "../variantDetail";
import { PosBenefitChip } from "./PosBenefitChip";
import { PosLinePrice } from "./PosLinePrice";
import { PosLineTotal } from "./PosLineTotal";

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
  onEdit,
  onPriceChange,
  maySetPrice = false,
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
  /**
   * Opens the line dialog — discount, lot and note live there (8 October 2026),
   * not on the row. Pressing the name block or the pencil both land here.
   */
  onEdit: (index: number) => void;
  /**
   * Typing a price over the catalogue's — `null` puts the line back to it.
   *
   * ABSENT MEANS THE PRICE IS READ-ONLY, which is how every caller that has
   * nothing to do with re-pricing keeps the line exactly as it was.
   */
  onPriceChange?: (index: number, unitPrice: string | null) => void;
  /** `posTransactions:setPrice`. See PosLinePrice. */
  maySetPrice?: boolean;
  disabled?: boolean;
}) {
  const qty = Number(item.qty);
  /*
    ONLY A PRODUCT IS STEPPED. Stated as a positive rather than as "not a
    service", because the list of kinds grew on 29 September 2026 and a negative
    test does not grow with it: a MEMBERSHIP line fell into the product branch
    and got a −/+ stepper, while the server forces one package per line — a
    control that did nothing, on the screen where every pixel is read at speed.
  */
  const stepsQty = item.kind === "product";
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
  const detail = variantDetailOf(item);
  const addonDetail = (addon: PosItem) => {
    const own = variantDetailOf(addon);
    return own !== detail ? own : null;
  };

  const locked =
    item.bookingOwned &&
    item.bookingStatus !== null &&
    item.bookingStatus !== "draft";

  return (
    <div className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        {/*
          THE WHOLE NAME BLOCK OPENS THE DIALOG — a bigger target for a finger
          than the pencil. No role of its own: the pencil below is the keyboard
          and screen-reader route, and a second button with the same name would
          only make the row announce itself twice.
        */}
        <div
          className="min-w-0 cursor-pointer"
          onClick={() => !disabled && onEdit(index)}
        >
          {/*
            THE ANIMAL IN THE TITLE — "Cici - Basic Grooming", the same as the
            printed sheet.

            It was a sub-line of its own, so on a two-dog visit the two things a
            cashier pairs up — whose grooming, and how much — sat a row apart.
            Named here, the top row answers both, and the basket and the struk
            read the same way.

            A RETAIL LINE HAS NO ANIMAL and keeps its own name.
          */}
          <span className="block truncate text-sm font-medium text-foreground">
            {item.petName ? `${item.petName} - ${item.name}` : item.name}
          </span>

          {/*
            WHAT IT WAS PRICED ON BEYOND THE ANIMAL — "Lokasi: Di Rumah · Zona
            A". Two groomings for one dog can differ by 50.000 on where they are
            done, and the figure below cannot say which one this is.
          */}
          {detail && (
            <span className="mt-0.5 block truncate text-xs text-muted">
              {detail}
            </span>
          )}

          {/*
            ─── WHERE THE VAN ACTUALLY GOES (24 September 2026) ──────────────

            The line above already says the direction — "Arah: Jemput" is a
            priced variant like any other — and a direction is not an
            instruction: two jemput lines on one basket, for two doors, are
            indistinguishable without the addresses.

            ONE LINE, BOTH ENDS, truncated. A basket row is not the place to
            read a full address; it is the place to notice that this one is the
            wrong house.
          */}
          {item.trip && (
            <span className="mt-0.5 block truncate text-xs text-muted">
              {item.trip.origin?.address ?? "Alamat asal"} →{" "}
              {item.trip.destination?.address ?? "Alamat tujuan"}
            </span>
          )}

          {/* WHAT THE FARE WAS MULTIPLIED BY. Silent on a ride serving one
              booking or none — there is no arithmetic to explain. */}
          {(item.linkedBookingIds?.length ?? 0) > 1 && (
            <span className="mt-0.5 block text-xs text-muted">
              Menangani {item.linkedBookingIds?.length} booking
            </span>
          )}

          {/*
            NO GROOMER HERE. Who is doing the work lives on the booking's detail
            screen, which is where it is decided and where it can be changed; a
            till line is what is being CHARGED for, and the animal is the only
            part of the attribution a cashier has to check against the customer
            in front of them.

            THE NAME IS STILL ON THE LINE — `groomerName` is snapshotted onto
            the sale and travels with it, so commission and attribution are
            untouched. This is the basket's rendering only, and the receipt drops
            it too.
          */}

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

          {/* The lot the cashier chose, and the line's note — read-only here,
              edited in the dialog the row opens. */}
          {(item.lots?.length ?? 0) > 0 && (
            <span className="mt-0.5 block truncate text-xs text-muted">
              Batch{" "}
              {item.lots
                ?.map((lot) => `${lot.batchCode ?? "—"} ×${Number(lot.qty)}`)
                .join(", ")}
            </span>
          )}
          {item.note && (
            <span className="mt-0.5 block truncate text-xs italic text-muted">
              “{item.note}”
            </span>
          )}

          <span
            className="mt-0.5 block text-xs tabular-nums text-muted"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <PosLinePrice
              item={item}
              label={`Harga ${item.name}`}
              editable={maySetPrice && onPriceChange !== undefined}
              disabled={disabled}
              onChange={(unitPrice) => onPriceChange?.(index, unitPrice)}
            />
            {/*
              ITS OWN DISCOUNT ONLY — the booking's share of "Diskon seluruh
              booking" is shown once, under the booking (see `PosCart`).
            */}
            {ownDiscountOf(item) && (
              <>
                {" · "}
                <span className="text-success">
                  −{formatMoney(ownDiscountOf(item)!.resolvedAmount)}
                </span>
              </>
            )}
          </span>
        </div>

        {/*
          ITS OWN PRICE, NOT THE PAIR'S — the same rule as the struk. The
          add-on carries its own figure directly below, so adding it in here
          would show the same 20.000 twice: once inside this number and once
          under it. The two screens now agree, and both add up to the same
          subtotal.
        */}
        <PosLineTotal item={item} />
      </div>

      {/*
        UNDER THE SERVICE, INDENTED, and with no border of its own — the whole
        point is that this does not read as another purchase. The left rule ties
        the run to the service above it, which is what the cashier is checking:
        "the bath, plus handling".

        EACH KEEPS ITS PRICE, and that price is not folded into the service's
        figure above — see there. What each does NOT keep is a control of its
        own: the discount and the bin belong to the service.
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
                {/* Only when it differs from the service's — an add-on
                    inherits the main line's choices, and repeating them under
                    every add-on is noise. */}
                {addonDetail(addon) && (
                  <span className="block truncate text-xs text-muted">
                    {addonDetail(addon)}
                  </span>
                )}
                {ownDiscountOf(addon) && (
                  <span className="block text-xs tabular-nums text-success">
                    −{formatMoney(ownDiscountOf(addon)!.resolvedAmount)}
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
          {!stepsQty ? (
            /*
              A WORD, NOT A BARE "1" — §1.3. Both unstepped kinds get one, and
              each says which it is: a cashier scanning the basket has to be
              able to tell a grooming from a year of membership without reading
              the name twice.
            */
            <Badge
              variant="outline"
              className="border-transparent bg-secondary"
            >
              {isService ? "Layanan" : "Membership"}
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

          {/*
            BESIDE "LAYANAN" (1 October 2026, on request) — both are marks about
            the line rather than controls on it, so they sit together on the
            side that names what this row is, not the side that acts on it.
          */}
          {item.discount?.source === "membership" && (
            <PosBenefitChip
              applied={{
                benefitLabel: item.discount.benefitLabel ?? null,
                amount: item.membershipDiscount ?? "0",
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          {/*
            THE DISCOUNT MOVED INTO THE LINE DIALOG (8 October 2026, on
            request), together with the lot and the note — one place to adjust
            a line instead of a control per thing. A discount is still never
            locked by a started booking: it changes what is paid, not what the
            animal is having.

            The button still SHOWS the discount — "−10%" — so a cashier
            scanning the basket sees it without opening anything.
          */}
          <Button
            type="button"
            variant={ownDiscountOf(item) ? "default" : "secondary"}
            size="sm"
            disabled={disabled}
            aria-label={`Ubah ${item.name}`}
            onClick={() => onEdit(index)}
          >
            <Pencil className="size-4" />
            {ownDiscountOf(item) &&
              `−${formatMoney(ownDiscountOf(item)!.resolvedAmount)}`}
          </Button>
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
