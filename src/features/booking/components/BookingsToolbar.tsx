"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { FilterBar, FilterDateRange, FilterSelect, withAll } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { bookingService } from "@/services/booking.service";
import type {
  BookingOrigin,
  BookingStatus,
  GroomerAvailability,
} from "@/types/api";

import type { BookingsQuery } from "../hooks/useBookings";
import { BOOKING_STATUS_LABELS } from "./BookingStatusBadge";

/**
 * The statuses, spelled out rather than mapped from the union.
 *
 * The visible word is COPY (ui-rules §12) and copy that happens to match the
 * API's value is a coincidence, not a rule — `BOOKING_STATUS_LABELS` is the one
 * place that decides it, so the badge and this filter cannot drift apart.
 *
 * IN THE ORDER A BOOKING WALKS THEM, matching `BOOKING_LADDER_FULL` on the
 * server: confirmed before arrival, because an animal cannot arrive for an
 * appointment nobody agreed to. A picker listing a booking's life out of order
 * is one people have to read twice.
 *
 * BOTH TRIP LEGS ARE OFFERED even though most bookings never reach them. A
 * filter is a question about the WHOLE LIST — "which vans are out" is exactly
 * the kind of thing this control is for — and hiding an option because it is
 * rare would make it unaskable on the day it matters.
 *
 * `rescheduled` IS NOT HERE. Nothing is ever stored in it, so filtering by it
 * would return an empty list every time and teach people the filter is broken.
 */
const STATUSES = withAll<BookingsQuery["status"]>(
  (
    [
      "draft",
      "requested",
      "confirmed",
      "pickup",
      "arrived",
      "in_progress",
      "completed",
      "delivery",
      "return_to_pawrents",
      "cancelled",
    ] as BookingStatus[]
  ).map((status) => ({ value: status, label: BOOKING_STATUS_LABELS[status] })),
  "Semua status",
);

/**
 * Where a booking came from.
 *
 * WORTH FILTERING ON, and it is the question this screen exists to answer for a
 * shop owner: "berapa grooming bulan ini yang walk-in". An appointment somebody
 * made and a service rung up at the counter are both real bookings, and the only
 * thing telling them apart is `origin`.
 */
const ORIGINS = withAll<BookingsQuery["origin"]>(
  (
    [
      { value: "booking", label: "Dijadwalkan" },
      { value: "pos_adhoc", label: "Dari kasir" },
    ] as { value: BookingOrigin; label: string }[]
  ).map((option) => option),
  "Semua asal",
);

/**
 * The booking list's controls.
 *
 * NO SEARCH BOX. A booking has no name of its own — it is found by day, by
 * status, or by who it is for, and the first two are what a day sheet is read
 * by. A box that searched booking numbers would be a field nobody types into.
 *
 * "Booking baru" LIVES HERE rather than beside the heading, like every other
 * list screen's create button: the bar is the one row on a list that is not the
 * list, and a screen where the action sits somewhere new is a screen people have
 * to look at before they can use it.
 */
export function BookingsToolbar({
  query,
  onChange,
}: {
  query: BookingsQuery;
  onChange: (patch: Partial<BookingsQuery>) => void;
}) {
  /*
    THE STAFF WHO CAN BE BOOKED, FROM `bookings/availability` RATHER THAN THE
    USER REGISTER.

    `userService.list` would need `users:read`, which a receptionist has no
    reason to hold — and a filter that renders empty for the person who lives on
    this screen is worse than no filter. This endpoint rides on `bookings:read`,
    the same grant that opened the list, so the two can never disagree about who
    may see it.

    TODAY'S DATE IS ARBITRARY HERE. The endpoint answers "who may be booked on
    this day, and why not"; the filter wants only the names, and the reasons are
    ignored. Somebody off today is still somebody whose past bookings a shop
    looks up.
  */
  const [groomers, setGroomers] = useState<GroomerAvailability[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    bookingService
      .availability(new Date().toISOString().slice(0, 10))
      .then((rows) => {
        if (active) setGroomers(rows);
      })
      .catch(() => {
        /*
          SAID, NOT SWALLOWED — the same mistake the roster's service picker
          made. A silently empty list is indistinguishable from "nobody is
          marked", and the two need different fixes.
        */
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <FilterBar
      /*
        THE BAR CARRIES THE EXPLANATION, not the control — `FilterSelect` renders
        `disabledHint` only when it stands alone with its own label; inside a bar
        the caption belongs to the row, which is what `FilterBar.hint` is for.
        Passing it to the control here dropped it silently.
      */
      hint={
        groomers.length === 0
          ? error
            ? "Daftar groomer tidak bisa dimuat. Coba muat ulang halaman."
            : "Filter groomer mati: belum ada staf yang ditandai sebagai Groomer di Master Data › Staf."
          : undefined
      }
      actions={
        <>
          {/*
            LINKS, NOT HANDLERS — both destinations are pages now, so these are
            addresses somebody can bookmark, open in a new tab, or be sent to.

            THE CALENDAR RIDES ON `read`, the same grant that opened this list:
            it is something to LOOK at. Taking a booking is `create`, and the
            route behind that button carries the same gate — a hidden button is
            a courtesy, never the control.
          */}
          <Button asChild variant="secondary">
            <Link href="/dashboard/booking/kalender">Kalender</Link>
          </Button>

          <Can feature="bookings" action="create">
            <Button asChild>
              <Link href="/dashboard/booking/new">
                <Plus className="size-4" />
                Booking baru
              </Link>
            </Button>
          </Can>
        </>
      }
    >
      <FilterDateRange
        from={query.scheduledFrom}
        to={query.scheduledTo}
        ariaLabel="Filter tanggal booking"
        onApply={({ from, to }) =>
          onChange({ scheduledFrom: from, scheduledTo: to })
        }
      />
      <FilterSelect
        label="Status"
        ariaLabel="Filter status booking"
        value={query.status}
        options={STATUSES}
        onChange={(status) => onChange({ status })}
      />
      <FilterSelect
        label="Asal"
        ariaLabel="Filter asal booking"
        value={query.origin}
        options={ORIGINS}
        onChange={(origin) => onChange({ origin })}
      />
      {/*
        SHOWN AND DISABLED WHEN THERE IS NOBODY TO PICK — never hidden.

        It WAS hidden, on the reasoning that a dropdown with one dead option
        reads as broken. That was the wrong call and it cost a bug report: the
        list reads `users.isGroomer`, so a shop that has not ticked anybody gets
        an empty list — and a filter that simply is not there reads as a feature
        that does not work, with nothing on screen to say otherwise.

        `disabledHint` EXISTS FOR EXACTLY THIS. A dead control carries its own
        reason; a missing one carries nothing.
      */}
      <FilterSelect
        label="Groomer"
        ariaLabel="Filter groomer"
        value={query.groomerUserId}
        options={withAll(
          groomers.map((groomer) => ({
            value: groomer._id,
            label: groomer.fullName ?? "—",
          })),
          "Semua groomer",
        )}
        disabled={groomers.length === 0}
        onChange={(groomerUserId) => onChange({ groomerUserId })}
      />
    </FilterBar>
  );
}
