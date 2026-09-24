"use client";

import { useEffect } from "react";

import { Alert, CheckRow, CheckRowGroup, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useVisitBookings,
  visitLabel,
} from "@/features/booking/hooks/useVisitBookings";
import type { Booking, Branch, Customer, TripLeg } from "@/types/api";

import { LEG_CHOICES, LEG_LABEL } from "../ride";
import {
  defaultDrafts,
  resolveLeg,
  TripPointFields,
  type LegPoints,
} from "./TripPointFields";

/**
 * ─── WHICH WAY, BETWEEN WHICH TWO DOORS, AND FOR WHICH BOOKINGS ────────────
 *
 * The three questions an antar-jemput line has to answer before it has a price,
 * asked the same way wherever it is sold — the counter (24 September 2026) and
 * the invoice (the same day). The animals are NOT here: the two screens pick
 * them differently, and each already has a picker of its own.
 *
 * WRITTEN AS ONE COMPONENT rather than copied, because every rule below is a
 * decision somebody made and would have to make again: the direction filling in
 * its own two ends, Arah being answered by it rather than asked twice, a
 * booking being fetched once and taken home once, and a `per_pet` fare
 * following the bookings the van serves rather than the dogs in it.
 */

/** The journey, as a screen holds it while it is being filled in. */
export interface RideJourney {
  leg: TripLeg;
  points: LegPoints;
  /** Whether "Tautkan ke booking" is open at all. */
  linking: boolean;
  linkedBookingIds: string[];
}

export function blankJourney(leg: TripLeg = "pickup"): RideJourney {
  return { leg, points: defaultDrafts(leg), linking: false, linkedBookingIds: [] };
}

/**
 * THE DIRECTION FILLS IN ITS OWN TWO ENDS — a pickup starts at the customer's
 * door and a delivery finishes there. Both stay editable.
 *
 * ⚠️ IT ALSO CLEARS THE LINKS. "Sudah punya perjalanan jemput" is a fact about
 * ONE direction, so a booking that could not be ticked for a pickup may well be
 * fine for a delivery — and one ticked before the switch would otherwise
 * survive into a direction where the server refuses it.
 */
export function journeyForLeg(journey: RideJourney, leg: TripLeg): RideJourney {
  return { ...journey, leg, points: defaultDrafts(leg), linkedBookingIds: [] };
}

export function RideJourneyFields({
  journey,
  onChange,
  customerId,
  petIds,
  customer,
  branch,
  perAnimal = false,
  /** The bookings the basket or bill is already carrying — marked, not closed. */
  alreadyHere = [],
  /*
    WHAT TO CALL THIS DOCUMENT on those rows. A till says keranjang and a bill
    says faktur; "dokumen ini" is what a form says when nobody decided.
  */
  alreadyHereLabel = "Sudah ada di dokumen ini.",
  disabled = false,
  idPrefix = "ride",
}: {
  journey: RideJourney;
  onChange: (next: RideJourney) => void;
  customerId: string;
  /** The animals in the van — the list of bookings follows them. */
  petIds: readonly string[];
  customer: Pick<Customer, "name" | "address" | "location"> | null;
  branch: Pick<Branch, "name" | "address" | "location"> | null;
  /** Whether the fare follows the bookings the van serves. */
  perAnimal?: boolean;
  alreadyHere?: readonly string[];
  alreadyHereLabel?: string;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const { leg, points, linking, linkedBookingIds } = journey;

  /*
    ASKED ONLY ONCE THE SWITCH IS ON. Most antar-jemput is a trip of its own —
    somebody dropping a dog off on their way to work — and a request for a month
    of the customer's diary on every one of them would be paid for by all of
    them.

    NARROWED TO THE ANIMALS IN THE VAN (on request, 24 September 2026): a
    customer with three dogs has three dogs' worth of bookings, and offering
    Coco's grooming under a van carrying Bruno is a mis-tick nobody would notice.

    DRAFTS ARE IN IT, which is the point: a grooming added to this basket or
    bill a moment ago is a booking the server has already raised, and it is the
    one whoever is typing most often means.
  */
  const visits = useVisitBookings(
    linking && petIds.length > 0 ? customerId : null,
    null,
    { petIds, excludeRides: true },
  );

  /*
    ─── A BOOKING IS FETCHED ONCE, AND TAKEN HOME ONCE ───────────────────────

    BO's rule: a grooming that already has a jemput cannot be given a second
    one, and the same for antar. The server refuses it in those words
    (`#assertLinkedBookings`) — this closes the row with the reason instead,
    because a refusal that arrives after the document is built names a booking
    whoever typed it no longer remembers ticking.

    PER DIRECTION, never "already linked, so no more": an Antar Jemput is a
    pickup AND a delivery, both serving that grooming.

    ⚠️ IT CANNOT SEE ANOTHER TILL'S BASKET, which is why the server keeps the
    guard. `trips` is what the booking knew when this list was read.
  */
  const rideAlready = (booking: Booking): TripLeg | null =>
    (booking.trips ?? []).some((trip) => trip.tripLeg === leg) ? leg : null;

  const here = new Set(alreadyHere.map(String));

  /*
    ─── A LINK THE PICKER CAN NO LONGER OFFER IS DROPPED ─────────────────────

    An animal taken out of the van takes its bookings out of the list with it,
    and a link left behind would be saved anyway — the server refuses it as a
    booking for an animal that is not riding. Same for a booking cancelled
    while the form was open.

    ⚠️ ONLY ONCE THE LIST HAS LANDED. While it is in flight `bookings` is empty,
    and pruning against it would untick everything on every re-read.

    ONLY WHAT IS MISSING, never all of them: taking Coco out must not untick the
    grooming the van is still fetching for Bruno.
  */
  useEffect(() => {
    if (!linking || visits.loading || visits.failed) return;

    const offered = new Set(visits.bookings.map((one) => one._id));
    const kept = linkedBookingIds.filter((id) => offered.has(id));

    if (kept.length !== linkedBookingIds.length) {
      onChange({ ...journey, linkedBookingIds: kept });
    }
  });

  const resolved = resolveLeg(points, customer, branch);

  function toggleLink(id: string) {
    onChange({
      ...journey,
      linkedBookingIds: linkedBookingIds.includes(id)
        ? linkedBookingIds.filter((one) => one !== id)
        : [...linkedBookingIds, id],
    });
  }

  return (
    <>
      {/*
        ─── WHICH WAY THE VAN IS GOING ──────────────────────────────────────

        A REAL CONTROL, not a "Dipilih staf" select. The Arah option is still
        what carries the price — it is the owner's variant option (BO,
        21 September 2026), and `choicesForLeg` answers it from what is pressed
        here — but the direction is also what the booking STORES as `tripLeg`,
        and what the board, the driver's row and the status ladder all read. Two
        controls asking one question is two answers to keep in step.

        TWO VALUES, NOT THREE. The diary offers "Antar Jemput" as a third, which
        saves two bookings; elsewhere that is the line added twice, and it keeps
        a second pair of addresses off a form that can only show one at a time.
      */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-muted">Arah</legend>
        <div className="flex flex-wrap gap-2">
          {LEG_CHOICES.filter((choice) => choice.value !== "both").map((choice) => (
            <Button
              key={choice.value}
              type="button"
              size="sm"
              className="h-11"
              variant={leg === choice.value ? "default" : "secondary"}
              aria-pressed={leg === choice.value}
              disabled={disabled}
              onClick={() => onChange(journeyForLeg(journey, choice.value as TripLeg))}
            >
              {choice.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {LEG_CHOICES.find((choice) => choice.value === leg)?.hint}
        </p>
      </fieldset>

      {/*
        ─── AND BETWEEN WHICH TWO DOORS ─────────────────────────────────────

        The two registers a shop already keeps are offered before the keyboard,
        because they carry a pin somebody has already checked.

        BOTH ENDS STAY EDITABLE. A van may start at another branch or at a
        groomer's house (23 September 2026), which is why the booking stores
        both rather than inferring one from the direction.
      */}
      <div className="flex flex-col gap-3">
        <TripPointFields
          label="Asal"
          draft={points.origin}
          point={resolved.origin}
          customer={customer}
          branch={branch}
          disabled={disabled}
          onChange={(next) =>
            onChange({ ...journey, points: { ...points, origin: next } })
          }
        />
        <TripPointFields
          label="Tujuan"
          draft={points.destination}
          point={resolved.destination}
          customer={customer}
          branch={branch}
          disabled={disabled}
          onChange={(next) =>
            onChange({ ...journey, points: { ...points, destination: next } })
          }
        />
      </div>

      {/*
        ─── TAUTKAN KE BOOKING ──────────────────────────────────────────────

        BEHIND A SWITCH, because most antar-jemput is a trip of its own. Off,
        this costs nothing — the diary is not even read.
      */}
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor={`${idPrefix}-link`}>Tautkan ke booking</Label>
            <p className="mt-1 text-xs text-muted">
              Nyalakan kalau perjalanan ini menjemput atau mengantar booking yang
              sudah ada.
            </p>
          </div>
          <Switch
            id={`${idPrefix}-link`}
            checked={linking}
            disabled={disabled}
            onCheckedChange={(next) =>
              onChange({
                ...journey,
                linking: next,
                linkedBookingIds: next ? linkedBookingIds : [],
              })
            }
          />
        </div>

        {linking &&
          (visits.loading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Memuat booking…
            </p>
          ) : visits.failed ? (
            <Alert variant="error">
              Daftar booking pelanggan ini tidak bisa dimuat.
            </Alert>
          ) : visits.bookings.length === 0 ? (
            <p className="text-sm text-muted">
              Belum ada booking hewan yang dipilih yang bisa ditautkan.
              Antar-jemput ini jalan sendiri.
            </p>
          ) : (
            <>
              <CheckRowGroup>
                {visits.bookings.map((booking) => {
                  const busyLeg = rideAlready(booking);
                  const on = linkedBookingIds.includes(booking._id);

                  return (
                    <CheckRow
                      key={booking._id}
                      label={visitLabel(booking)}
                      description={
                        busyLeg
                          ? `Sudah punya perjalanan ${LEG_LABEL[busyLeg].toLowerCase()}.`
                          : here.has(booking._id)
                            ? alreadyHereLabel
                            : undefined
                      }
                      checked={on}
                      /* Never closed while ticked — it has to be undoable. */
                      disabled={disabled || (busyLeg !== null && !on)}
                      onCheckedChange={() => toggleLink(booking._id)}
                    />
                  );
                })}
              </CheckRowGroup>
              <p className="text-xs text-muted">
                {perAnimal
                  ? "Tarifnya dihitung per booking yang ditautkan."
                  : "Tarifnya tetap sekali per perjalanan, berapa pun booking yang ditautkan."}
              </p>
            </>
          ))}
      </div>
    </>
  );
}
