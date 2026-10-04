"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BILLING_BADGES, BookingStatusActions } from "@/features/booking";
import { clockOf, dayOf, type GroomingRow } from "@/features/grooming/board";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { antarJemputDetailPath } from "../paths";
import { LEG_LABEL, otherLeg, rideOf } from "../ride";

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
 * without reading anything else.
 *
 * THE MOCKUP'S "Roundtrip" IS "Antar Jemput" (ui-rules §12, renamed 23 September
 * 2026 on request — the shop's own name for it): the badge under
 * the number when the visit also has the other direction, naming its booking.
 */
export function AntarJemputBookingsTable({
  rows,
  loading,
  onChanged,
  emptyMessage,
}: {
  rows: GroomingRow[];
  loading: boolean;
  onChanged: (booking: Booking) => void;
  emptyMessage: ReactNode;
}) {
  const router = useRouter();

  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <Table className={cn("min-w-270", loading && "opacity-60")}>
        <TableHeader>
          <TableRow>
            <TableHead>Booking</TableHead>
            <TableHead>Pelanggan &amp; Hewan</TableHead>
            <TableHead>Arah</TableHead>
            <TableHead>Jam</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Nilai</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
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
              <TableRow
                key={row.key}
                className={cn(
                  "cursor-pointer align-top",
                  /* A draft is not a trip anybody is driving yet. */
                  booking.status === "draft" && "opacity-65",
                )}
                onClick={(event) => {
                  /*
                    The row opens the booking. Anything with its own job — the
                    number's link, the status control — is left alone.
                  */
                  const target = event.target as HTMLElement;
                  if (!event.currentTarget.contains(target)) return;
                  if (target.closest("a, button, input, label, select")) return;
                  router.push(antarJemputDetailPath(booking._id));
                }}
              >
                <TableCell>
                  <Link
                    href={antarJemputDetailPath(booking._id)}
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
                </TableCell>

                {/*
                    THE INTERNAL NOTE IS NOT ON THIS TABLE (23 September 2026, on
                    request). It sat in the Arah cell, moved here when that
                    column was cut back, and was cut again: a driver's note is
                    read on the booking's own page, not scanned down a list.
                  */}
                <TableCell className="whitespace-normal">
                  <span className="block text-sm font-semibold text-foreground">
                    {booking.customerName ?? "—"}
                  </span>
                  <span className="block text-xs text-muted">
                    {ride.names.join(", ") || "—"}
                    {ride.animals > 1 && ` · ${ride.animals} hewan`}
                  </span>
                </TableCell>

                {/*
                    ARAH, AND NOTHING ELSE (23 September 2026, on request). The
                    cell carried the zone, the address, the add-on tags and the
                    note; the addresses are two now and neither fits a column,
                    and the add-ons are a click away under Rincian.
                  */}
                <TableCell>
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
                </TableCell>

                <TableCell className="tabular-nums">
                  <span className="block text-sm font-semibold text-foreground">
                    {clockOf(booking.scheduledAt)}
                  </span>
                  <span className="block text-xs text-muted">
                    {dayOf(booking.scheduledAt)}
                  </span>
                </TableCell>

                <TableCell className="whitespace-normal">
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
                </TableCell>

                <TableCell>
                  <BookingStatusActions
                    booking={booking}
                    onChanged={onChanged}
                    variant="status"
                  />
                </TableCell>

                <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                  {formatMoney(row.net)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
