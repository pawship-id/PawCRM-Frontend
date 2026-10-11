"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { House } from "lucide-react";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { formatMoney, isPositive, subtractDecimals } from "@/utils/decimal";
import type { Booking, OrphanTrip } from "@/types/api";

import {
  afterOwnDiscounts,
  bookingShareOf,
  ownDiscountOfLine,
} from "../bookingDiscount";
import { billedTripNote } from "@/features/booking/visitTrip";

/**
 * THE CUSTOMER'S BOOKINGS, ready to be billed on this invoice — PCR-034.
 *
 * WHY THE WINDOW IS 30 DAYS AND NOT TODAY. The till's bridge answers "what is
 * happening in front of me"; an invoice bills what has ALREADY happened — a
 * month of boarding, last week's grooming. A one-day window would leave this
 * panel empty for exactly the cases it exists to serve. Backwards only: an
 * appointment booked for next Friday has not been earned yet.
 *
 * ONE ROW PER BOOKING, which is one animal and one main service with its
 * add-ons. A bill for three cats has to say which three — the customer checking
 * it and the groomer reading it both need the names, and "Grooming ×3" tells
 * neither of them whose bath was missed.
 *
 * THE LIST IS ALREADY FILTERED BY THE SERVER to bookings this customer has not
 * been billed for — in a basket OR on another invoice — in any status but
 * `cancelled`. That is wider than it was: an invoice bills what has HAPPENED, so
 * a grooming that is finished or under way is the most ordinary row on it, and
 * requiring `confirmed` refused exactly those. Filtering here
 * would be a second definition of "already billed", and the two would eventually
 * disagree about whether a grooming had been paid for.
 *
 * A CHOSEN BOOKING LEAVES THIS LIST (17 September 2026, on request) and is
 * drawn in Baris faktur instead, so the total never counts something the rows
 * do not show. Removing it there brings it back here — this component keeps
 * every booking it read and only hides the chosen ones.
 *
 * IT DISAPPEARS WITHOUT A CUSTOMER, rather than showing an empty state. "Which
 * bookings" has no meaning until "whose" is answered, and an empty panel above
 * an unanswered question reads as "this customer has none".
 */
const WINDOW_DAYS = 30;

export function InvoiceBookingPanel({
  customerId,
  branchId,
  selected,
  onChange,
  droppedTrips,
  selectedTrips = [],
  onTripsChange,
  disabled = false,
}: {
  customerId: string;
  /** Trips left behind already chosen for this bill (11 October 2026). */
  selectedTrips?: string[];
  /** Reports the trips left behind the bill now carries — added only, like bookings. */
  onTripsChange?: (trips: OrphanTrip[]) => void;
  /** Trips the form took off this bill — not "already on it" (11 October 2026). */
  droppedTrips?: Set<string>;
  /**
   * The branch the invoice is being raised for. Only that branch's bookings are
   * offered: a grooming done at Barat billed on a Timur invoice would book its
   * revenue to Timur while the work and the commission stay Barat's.
   */
  branchId?: string;
  /** Booking ids currently on the invoice. */
  selected: string[];
  /**
   * Reports the CHOSEN BOOKINGS, not just their ids.
   *
   * The form sends ids and nothing else — the server reads each booking's own
   * frozen prices — but it still has to SHOW what the bill comes to before
   * anybody approves it. Handing the whole booking up is what lets the recap add
   * them in; passing ids alone left it reading Rp 0 with two groomings ticked.
   */
  onChange: (bookings: Booking[]) => void;
  disabled?: boolean;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  /* Trips left behind — best effort; a failed read is simply none. */
  const [orphans, setOrphans] = useState<OrphanTrip[]>([]);
  /*
    STARTS LOADING, rather than being switched on inside the effect. The
    component remounts per customer, so "loading" IS its initial state — and a
    synchronous `setLoading(true)` in an effect is a cascading render for a value
    that was always going to be true.
  */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
    NO SYNCHRONOUS RESET FOR A CHANGED CUSTOMER, because there is nothing to
    reset: the form gives this component `key={customerId}`, so a different
    customer is a different component with fresh state. Clearing the rows inside
    the effect instead would be a cascading render, and it is also the shape that
    leaves one customer's bookings on screen for a moment under another's name.
  */
  useEffect(() => {
    // Nothing to ask for yet. No state is touched here — the guard that was
    // removed set state synchronously, which is the cascading render the lint
    // rule catches; a bare return is not.
    if (!customerId) return;

    let active = true;

    /* Best effort — wrapped, so a missing answer is simply no trips. */
    Promise.resolve(bookingService.bridgeTrips(customerId, branchId || undefined))
      .then((rows) => {
        if (active) setOrphans(rows ?? []);
      })
      .catch(() => {
        if (active) setOrphans([]);
      });

    bookingService
      .bridge(customerId, WINDOW_DAYS, branchId || undefined)
      .then((rows) => {
        if (active) setBookings(rows);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBookings([]);
        /*
          SHOWN, NOT SWALLOWED — but it does not take down the form. `bookings:read`
          is a separate grant, and a role that raises invoices without seeing the
          schedule is an ordinary arrangement rather than a misconfiguration. The
          invoice can still be typed by hand.
        */
        setError(
          err instanceof ApiError && err.status === 403
            ? "Role Anda tidak punya akses ke Booking, jadi daftarnya tidak bisa dimuat."
            : "Daftar booking gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId, branchId]);

  if (!customerId) return null;

  /* Adds only — taking a booking off is done from its row in Baris faktur. */
  function choose(id: string) {
    const next = [...selected, id];

    onChange(bookings.filter((booking) => next.includes(booking._id)));
  }

  const offered = bookings.filter((booking) => !selected.includes(booking._id));
  /* Trips whose fee a booking already on this faktur brings along. */
  const tripsOnInvoice = new Set(
    bookings
      .filter((booking) => selected.includes(booking._id))
      .flatMap((booking) =>
        booking.visitTrip?.state === "unbilled" && !droppedTrips?.has(booking.visitTrip.key)
          ? [booking.visitTrip.key]
          : [],
      ),
  );

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Memuat booking pelanggan…
        </p>
      )}

      {error && <Alert variant="warning">{error} Faktur tetap bisa dibuat.</Alert>}

      {!loading && !error && bookings.length === 0 && (
        <p className="text-sm text-muted">
          Tidak ada booking pelanggan ini dalam {WINDOW_DAYS} hari terakhir yang
          belum ditagih.
        </p>
      )}

      {!loading && !error && bookings.length > 0 && offered.length === 0 && (
        <p className="text-sm text-muted">
          Semua booking pelanggan ini sudah masuk ke baris faktur.
        </p>
      )}

      {offered.map((booking) => {
        const id = booking._id;
        /*
          THE LINES AFTER THEIR OWN DISCOUNTS, then the booking's share of
          "Diskon seluruh booking" at the foot of the card (16 September 2026) —
          Total at the foot is what this booking bills, after both. The
          recap still totals the shares once, as "Diskon booking".
        */
        /*
          THE HOME-VISIT FEE IS LEFT OUT OF THE CARD (11 October 2026): it pays
          for the trip, which is said under the card instead — owed and coming
          along, already on this faktur, or billed with another booking.
        */
        const own = {
          ...booking,
          service: {
            ...booking.service,
            addons: booking.service.addons.filter((addon) => !addon.visitFee),
          },
        };
        const subtotal = afterOwnDiscounts(own);
        const share = bookingShareOf(own);
        const hasShare = isPositive(share);
        const total = hasShare ? subtractDecimals(subtotal, share) : subtotal;
        const trip = booking.visitTrip ?? null;
        const tripNote =
          trip?.state === "unbilled"
            ? tripsOnInvoice.has(trip.key)
              ? "Biaya perjalanan sudah ada di faktur ini"
              : `+ Perjalanan home grooming ${formatMoney(trip.amount)} ikut ditagih${
                  trip.petNames.length > 0 ? ` (untuk ${trip.petNames.join(", ")})` : ""
                }`
            : billedTripNote(trip);
        const mainOwn = ownDiscountOfLine(booking.service);

        return (
          <label
            key={id}
            htmlFor={`booking-${id}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:bg-surface-hover"
          >
            <Checkbox
              id={`booking-${id}`}
              checked={false}
              onCheckedChange={() => choose(id)}
              disabled={disabled}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              {/* THE ANIMAL LEADS, not the booking number: somebody billing a
                  grooming thinks in pets, and the number is what they quote
                  afterwards. The total sits at the foot of the card. */}
              <span className="block font-medium">
                {booking.petName ?? "Hewan terhapus"}
              </span>
              <span className="block text-xs text-muted">
                {booking.bookingNumber ?? "—"}
              </span>
              {/*
                PRICED LINE BY LINE, AS THE TILL DRAWS A PULLED BOOKING — each
                line's price, and its own discount under it as "Diskon item".
              */}
              <ul className="mt-1.5 flex flex-col gap-1 text-xs">
                <li className="flex flex-col">
                  <span className="flex justify-between gap-2">
                    <span className="text-foreground">
                      {booking.service.name}
                      {/* Never null — the server resolves an unassigned slot to
                          "Belum ditentukan" once, rather than three screens each
                          inventing their own word for it. */}
                      {booking.groomerName ? ` · ${booking.groomerName}` : ""}
                    </span>
                    <span className="tabular-nums text-muted">
                      {formatMoney(booking.service.price)}
                    </span>
                  </span>
                  {mainOwn && (
                    <span className="flex justify-between gap-2 text-success">
                      <span>Diskon item</span>
                      <span className="tabular-nums">−{formatMoney(mainOwn)}</span>
                    </span>
                  )}
                </li>
                {/* Under the service they came with — nobody chose "Parfum"
                    by itself. */}
                {own.service.addons.map((addon) => {
                  const ownOff = ownDiscountOfLine(addon);

                  return (
                    <li
                      key={addon.itemId}
                      className="ml-1 flex flex-col border-l border-border pl-2"
                    >
                      <span className="flex justify-between gap-2">
                        <span className="text-foreground">+ {addon.name}</span>
                        <span className="tabular-nums text-muted">
                          {formatMoney(addon.price)}
                        </span>
                      </span>
                      {ownOff && (
                        <span className="flex justify-between gap-2 text-success">
                          <span>Diskon item</span>
                          <span className="tabular-nums">−{formatMoney(ownOff)}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <span className="mt-1.5 flex flex-col gap-1 border-t border-border pt-1.5 text-xs">
                {hasShare && (
                  <>
                    <span className="flex justify-between gap-2">
                      <span className="text-muted">Subtotal</span>
                      <span className="tabular-nums text-muted">
                        {formatMoney(subtotal)}
                      </span>
                    </span>
                    <span className="flex justify-between gap-2">
                      <span className="text-success">Diskon booking</span>
                      <span className="tabular-nums text-success">
                        −{formatMoney(share)}
                      </span>
                    </span>
                  </>
                )}
                <span className="flex justify-between gap-2 text-sm">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatMoney(total)}
                  </span>
                </span>
              </span>
              {tripNote && (
                <span data-panel-trip className="mt-1.5 block text-xs text-muted">
                  {tripNote}
                </span>
              )}
            </span>
          </label>
        );
      })}

      {/*
        ─── TRIPS LEFT BEHIND (11 October 2026) ─────────────────────────────

        Every booking of the trip was billed, the trip was not. Nothing above
        can bring it, so it is offered on its own, and leaves this list once
        chosen — the way a booking does.
      */}
      {orphans
        .filter((trip) => !selectedTrips.includes(trip.tripId))
        .map((trip) => (
          <label
            key={`orphan-${trip.tripId}`}
            htmlFor={`orphan-${trip.tripId}`}
            data-orphan-trip
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:bg-surface-hover"
          >
            <Checkbox
              id={`orphan-${trip.tripId}`}
              checked={false}
              onCheckedChange={() =>
                onTripsChange?.(
                  orphans.filter(
                    (one) => selectedTrips.includes(one.tripId) || one.tripId === trip.tripId,
                  ),
                )
              }
              disabled={disabled || !onTripsChange}
              className="mt-0.5"
            />
            <House className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Perjalanan belum ditagih</span>
              <span className="flex justify-between gap-2 text-xs">
                <span className="text-foreground">{trip.name}</span>
                <span className="tabular-nums text-muted">{formatMoney(trip.amount)}</span>
              </span>
              <span className="block text-xs text-muted">
                {[
                  trip.petNames.length > 0 ? `Untuk ${trip.petNames.join(", ")}` : null,
                  trip.bookingNumbers.length > 0
                    ? `booking ${trip.bookingNumbers.join(", ")} sudah ditagih`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </label>
        ))}
    </div>
  );
}
