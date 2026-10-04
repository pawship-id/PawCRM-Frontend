"use client";

import {
  afterOwnDiscounts,
  bookingShareOf,
  ownDiscountOfLine,
} from "@/features/sales/bookingDiscount";
import { formatMoney, isPositive, sumDecimals } from "@/utils/decimal";
import type {
  Booking,
  BookingAddon,
  BookingMainService,
  VariantChoiceSnapshot,
} from "@/types/api";

/**
 * WHAT IS BEING CHARGED, AND WHAT COMES OFF IT — one booking's money, drawn
 * the same way wherever a booking is read.
 *
 * ─── WHY IT IS A COMPONENT (24 September 2026, on request) ──────────────────
 *
 * It was written inside `BookingDetailScreen` and the shop asked for the same
 * block on a ride's page ("buat seperti digambar"), which had a plainer card of
 * its own: a name, a figure, and a green number under it. Two cards adding up
 * one booking is two places for the discount rules to drift — and they had
 * already drifted, since only this one knew about "Diskon booking".
 *
 * ─── THE SHAPE, AND WHY EACH LINE IS WHERE IT IS ────────────────────────────
 *
 *   Basic Grooming  [Grooming]                      Rp 120.000
 *   Sedang · Bulu pendek · 70 mnt          ← `facts`, the caller's sentence
 *   Lokasi: Di Rumah · Zona A · 2 km · 30 mnt
 *                          ↑ what it was priced on, stored, then `tail`
 *     Diskon item                                   − Rp 5.000
 *     │ + Extra Handling · +1 mnt                   Rp 20.000
 *   ─────────────────────────────────────────────────────────
 *   Subtotal                                        Rp 135.000
 *   Diskon booking                                  − Rp 2.547
 *   ═════════════════════════════════════════════════════════
 *   Total                                           Rp 132.453
 *
 * An ADD-ON HANGS OFF the service it was added to, behind a rule, instead of
 * sitting beside it as though somebody had chosen "Parfum" on its own.
 *
 * "DISKON BOOKING" IS THIS BOOKING'S SHARE of a discount typed across the whole
 * visit, shown ONCE under a subtotal of the lines after their own discounts —
 * the same split the till and the invoice show (16 September 2026). It is drawn
 * only when there is one, so an ordinary booking keeps two lines, not four.
 *
 * ⚠️ EVERY REDUCTION CARRIES ITS WORD. "Diskon item" and "Diskon booking" are
 * not decoration on a green figure: §1.3 does not let a colour say "this comes
 * off", and a bare second number is read as part of the price.
 */
export function BookingPriceBreakdown({
  booking,
  facts,
  tail,
}: {
  booking: Booking;
  /**
   * The muted line under the name — what the caller knows and this component
   * cannot: an animal's size and coat on a grooming. Anything the BOOKING
   * stored (the cards, the zone) is read here instead.
   */
  facts?: string | null;
  /**
   * THE END OF THE PRICED-ON LINE, not a line of its own (24 September 2026,
   * on request: "menitnya samping kanan jarak"). A ride's minutes and its
   * `per booking × n` belong beside the zone and the distance they were quoted
   * with — alone on a line above, they read as a second, unrelated fact.
   *
   * Stands as its own line when the booking stored nothing to be priced on.
   */
  tail?: string | null;
}) {
  const service = booking.service;

  if (!service) return null;

  const addons = service.addons ?? [];
  const priced = [pricedOn(service), tail].filter(Boolean).join(" · ") || null;
  const total =
    booking.netAmount ??
    booking.totalAmount ??
    sumDecimals([service.price, ...addons.map((addon) => addon.price)]);

  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">
          {service.name}
          {/* THE KIND OF WORK, from the booking's own snapshot. */}
          {service.serviceType && (
            <span className="ml-2 rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-normal text-muted">
              {service.serviceType}
            </span>
          )}
        </span>
        <span className="font-semibold tabular-nums text-foreground">
          {formatMoney(service.price)}
        </span>
      </div>

      {facts && <p className="text-xs text-muted">{facts}</p>}

      {/*
        WHAT IT WAS PRICED ON BEYOND THE ANIMAL (17 September 2026) — the
        staff's choices and the zone, as the booking stored them, and whatever
        the caller adds to the end of it. Never today's catalogue: a card
        renamed since does not change what was charged.
      */}
      {priced && <p className="text-xs text-muted tabular-nums">{priced}</p>}

      {/* THE SERVICE'S OWN DISCOUNT, on its row. */}
      {ownDiscountOfLine(service) && (
        <div className="flex justify-between gap-3 pl-3 text-sm">
          <span className="text-success">Diskon item</span>
          <span className="font-semibold tabular-nums text-success">
            − {formatMoney(ownDiscountOfLine(service)!)}
          </span>
        </div>
      )}

      {addons.length > 0 && (
        <ul className="mt-2 border-l-2 border-border pl-3">
          {addons.map((addon) => (
            <li
              key={addon.itemId}
              className="flex flex-wrap justify-between gap-x-3 py-1 text-sm"
            >
              <span className="text-muted">
                + {addon.name}
                {addon.durationMin ? ` · +${addon.durationMin} mnt` : ""}
                {/* Only an add-on's OWN choices — an inherited one repeats the service's. */}
                {ownChoicesOf(addon, service) && (
                  <span className="block text-xs">{ownChoicesOf(addon, service)}</span>
                )}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(addon.price)}
              </span>
              {ownDiscountOfLine(addon) && (
                <span className="flex w-full justify-between gap-3 pl-3">
                  <span className="text-success">Diskon item</span>
                  <span className="font-semibold tabular-nums text-success">
                    − {formatMoney(ownDiscountOfLine(addon)!)}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isPositive(bookingShareOf(booking)) && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex justify-between gap-3 py-1 text-sm">
            <span className="text-muted">Subtotal</span>
            <span className="tabular-nums text-muted">
              {formatMoney(afterOwnDiscounts(booking))}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-1 text-sm">
            <span className="text-success">Diskon booking</span>
            <span className="font-semibold tabular-nums text-success">
              − {formatMoney(bookingShareOf(booking))}
            </span>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between gap-3 border-t-2 border-foreground pt-2 text-sm">
        <span className="font-extrabold">Total</span>
        <span className="text-lg font-extrabold tabular-nums">{formatMoney(total)}</span>
      </div>
    </div>
  );
}

/** "Lokasi: Di Rumah" — a line's staff choices, as it stored them. */
function choicesWords(choices: readonly VariantChoiceSnapshot[] | undefined): string | null {
  const words = (choices ?? []).map((choice) => `${choice.name}: ${choice.label}`);
  return words.length > 0 ? words.join(" · ") : null;
}

/** "Lokasi: Di Rumah · Zona A · 2 km" — what the main service was priced on beyond the pet. */
function pricedOn(service: Pick<BookingMainService, "variantChoices" | "zone">): string | null {
  const zone = service.zone
    ? `${service.zone.name}${
        service.zone.distanceKm === null
          ? ""
          : ` · ${String(service.zone.distanceKm).replace(".", ",")} km`
      }`
    : null;
  const words = [choicesWords(service.variantChoices), zone].filter(Boolean);
  return words.length > 0 ? words.join(" · ") : null;
}

/** An add-on's choices, only where they are not the main service's. */
function ownChoicesOf(
  addon: Pick<BookingAddon, "variantChoices">,
  service: Pick<BookingMainService, "variantChoices">,
): string | null {
  const inherited = new Set(
    (service.variantChoices ?? []).map((choice) => `${choice.optionId}|${choice.code}`),
  );
  return choicesWords(
    (addon.variantChoices ?? []).filter(
      (choice) => !inherited.has(`${choice.optionId}|${choice.code}`),
    ),
  );
}
