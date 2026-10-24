"use client";

import { type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataTable, type DataTableColumn } from "@/components";
import { Badge } from "@/components/ui/badge";
import { BILLING_BADGES, BookingStatusActions } from "@/features/booking";
import {
  BOOKING_SORT_OPTIONS,
  clockOf,
  dayOf,
  type GroomingRow,
  type GroomingSort,
} from "@/features/grooming/board";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { antarJemputDetailPath } from "../paths";
import { LEG_LABEL, otherLeg, rideOf } from "../ride";

/** Keeps a click on a control inside the row from also opening the booking. */
const stop = (event: MouseEvent) => event.stopPropagation();

/**
 * The status cell's guard: a press on its control, or anywhere in the dialog or
 * menu it opens (portalled, so the target is outside the cell), is the
 * control's own — but a click on the plain badge a read-only role sees still
 * reaches the row, as it always did.
 */
function stopControl(event: MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (
    !event.currentTarget.contains(target) ||
    target.closest("a, button, input, label, select")
  ) {
    event.stopPropagation();
  }
}

/**
 * The Antar-Jemput board's table — one row per ride, from
 * `buloo-antar-jemput-v5.html`: Booking · Pelanggan & Hewan · Arah · Jam ·
 * Driver · Status · Nilai.
 *
 * NO FAKTUR COLUMN (23 September 2026, on request — the mockup has none, and a
 * table that matched Grooming's nine columns read as Grooming's table with
 * three headings swapped). What it is billed under is a BADGE UNDER THE NUMBER
 * instead, and it draws nothing at all while nothing is owed (`not_due`), so
 * the column of repeated words is gone rather than the fact.
 *
 * A ROW OPENS THE BOOKING'S PAGE (23 September 2026, on request) — it does NOT
 * expand in place the way Grooming's board does. A ride is read whole: its two
 * addresses, its stages, its bill and its history are a page, and half of them
 * never fitted in a drawer under the row. The stages (Mulai / Selesai / Ganti
 * PIC) are on that page, which is where BO's note 6 is answered now.
 *
 * The STATUS control stays in the row, because it is the one thing changed
 * without reading anything else. It (`stopControl`) and the number's link
 * (`stop`) STOP THEIR CLICKS, so using them never also opens the page — React
 * bubbles out of the status dialog's portal too.
 *
 * Drawn by the shared `DataTable` (ui-rules §10). SORTED FROM TWO HEADERS (BO,
 * 20 October 2026): Booking (the number, A first) and Nilai (the amount printed
 * — `net`, after discount — largest first); everything else is plain. The
 * screen sorts the whole loaded period and pages it itself; see
 * `BOOKING_SORT_OPTIONS` in `features/grooming/board.ts`.
 *
 * THE MOCKUP'S "Roundtrip" IS "Antar Jemput" (ui-rules §12, renamed 23 September
 * 2026 on request — the shop's own name for it): the badge under
 * the number when the visit also has the other direction, naming its booking.
 */
export function AntarJemputBookingsTable({
  rows,
  loading,
  sort,
  onSortChange,
  onChanged,
  emptyMessage,
}: {
  rows: GroomingRow[];
  loading: boolean;
  sort: GroomingSort;
  onSortChange: (next: GroomingSort) => void;
  onChanged: (booking: Booking) => void;
  emptyMessage: ReactNode;
}) {
  const router = useRouter();

  const columns: DataTableColumn<GroomingRow>[] = [
    {
      id: "booking",
      header: "Booking",
      cell: (row) => {
        const { booking } = row;
        const billing = BILLING_BADGES[row.billing];
        const ride = rideOf(booking);
        /* The other direction of the same visit — the "Antar Jemput" pair. */
        const pair = ride.leg
          ? (booking.trips ?? []).find(
              (trip) => trip.tripLeg === otherLeg(ride.leg!),
            )
          : undefined;

        return (
          <>
            <Link
              href={antarJemputDetailPath(booking._id)}
              onClick={stop}
              aria-label={`Buka ${booking.bookingNumber ?? "booking draf"}`}
              className="rounded text-sm font-semibold tabular-nums text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {booking.bookingNumber ?? "—"}
            </Link>
            {pair && (
              <Badge
                variant="outline"
                className="mt-1 block w-fit border-transparent bg-tint-brand tabular-nums text-primary"
              >
                Antar Jemput · {pair.bookingNumber ?? "draf"}
              </Badge>
            )}
            {billing && (
              <Badge
                variant="outline"
                className={cn(
                  "mt-1 block w-fit border-transparent",
                  billing.className,
                )}
              >
                {billing.label}
              </Badge>
            )}
            {booking.origin === "pos_adhoc" && (
              <Badge
                variant="outline"
                className="mt-1 block w-fit border-transparent bg-tint-neutral text-muted"
              >
                Dari kasir
              </Badge>
            )}
          </>
        );
      },
    },
    /*
      THE INTERNAL NOTE IS NOT ON THIS TABLE (23 September 2026, on request).
      It sat in the Arah cell, moved here when that column was cut back, and
      was cut again: a driver's note is read on the booking's own page, not
      scanned down a list.
    */
    {
      id: "customer",
      header: "Pelanggan & Hewan",
      cellClassName: "whitespace-normal",
      cell: ({ booking }) => {
        const ride = rideOf(booking);
        return (
          <>
            <span className="block text-sm font-semibold text-foreground">
              {booking.customerName ?? "—"}
            </span>
            <span className="block text-xs text-muted">
              {ride.names.join(", ") || "—"}
              {ride.animals > 1 && ` · ${ride.animals} hewan`}
            </span>
          </>
        );
      },
    },
    /*
      ARAH, AND NOTHING ELSE (23 September 2026, on request). The cell carried
      the zone, the address, the add-on tags and the note; the addresses are two
      now and neither fits a column, and the add-ons are a click away under
      Rincian.
    */
    {
      id: "leg",
      header: "Arah",
      cell: ({ booking }) => {
        const ride = rideOf(booking);
        return (
          <Badge
            variant="outline"
            className={cn(
              "border-transparent",
              ride.leg === "pickup"
                ? "bg-tint-info text-info"
                : "bg-tint-brand text-primary",
            )}
          >
            {ride.leg ? LEG_LABEL[ride.leg] : "Arah belum diisi"}
          </Badge>
        );
      },
    },
    {
      id: "time",
      header: "Jam",
      cellClassName: "tabular-nums",
      cell: ({ booking }) => (
        <>
          <span className="block text-sm font-semibold text-foreground">
            {clockOf(booking.scheduledAt)}
          </span>
          <span className="block text-xs text-muted">
            {dayOf(booking.scheduledAt)}
          </span>
        </>
      ),
    },
    {
      id: "driver",
      header: "Driver",
      cellClassName: "whitespace-normal",
      cell: (row) => (
        <>
          <span
            className={cn(
              "block text-sm",
              row.groomers.length ? "text-foreground" : "text-muted",
            )}
          >
            {row.groomers.length
              ? row.groomers.map((who) => who.name).join(", ")
              : "Belum ditentukan"}
          </span>
          <span className="block text-xs tabular-nums text-muted">
            {row.sessions.length
              ? `${row.sessionsDone}/${row.sessions.length} tahap`
              : "Belum ada tahap"}
          </span>
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ booking }) => (
        <div onClick={stopControl}>
          <BookingStatusActions
            booking={booking}
            onChanged={onChanged}
            variant="status"
          />
        </div>
      ),
    },
    {
      id: "value",
      header: "Nilai",
      align: "right",
      cellClassName: "text-sm font-semibold text-foreground",
      cell: (row) => formatMoney(row.net),
    },
  ];

  return (
    <DataTable<GroomingRow, GroomingSort>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      sort={{ value: sort, options: BOOKING_SORT_OPTIONS, onChange: onSortChange }}
      loading={loading}
      loadingLabel="Memuat booking antar-jemput…"
      empty={
        <div className="px-6 py-12 text-center text-sm text-muted">
          {emptyMessage}
        </div>
      }
      tableClassName="min-w-270"
      rowClassName={(row) =>
        cn(
          "align-top",
          /* A draft is not a trip anybody is driving yet. */
          row.booking.status === "draft" && "opacity-65",
        )
      }
      onRowClick={(row) => router.push(antarJemputDetailPath(row.booking._id))}
    />
  );
}
