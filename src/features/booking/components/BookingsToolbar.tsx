"use client";

import { Plus } from "lucide-react";

import { FilterBar, FilterDateRange, FilterSelect, withAll } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { BookingOrigin, BookingStatus } from "@/types/api";

import type { BookingsQuery } from "../hooks/useBookings";
import { BOOKING_STATUS_LABELS } from "./BookingStatusBadge";

/**
 * The statuses, spelled out rather than mapped from the union.
 *
 * The visible word is COPY (ui-rules §12) and copy that happens to match the
 * API's value is a coincidence, not a rule — `BOOKING_STATUS_LABELS` is the one
 * place that decides it, so the badge and this filter cannot drift apart.
 */
const STATUSES = withAll<BookingsQuery["status"]>(
  (
    ["draft", "confirmed", "in_progress", "completed", "cancelled"] as BookingStatus[]
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
  onCreate,
}: {
  query: BookingsQuery;
  onChange: (patch: Partial<BookingsQuery>) => void;
  onCreate: () => void;
}) {
  return (
    <FilterBar
      actions={
        <Can feature="bookings" action="create">
          <Button type="button" onClick={onCreate}>
            <Plus className="size-4" />
            Booking baru
          </Button>
        </Can>
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
    </FilterBar>
  );
}
