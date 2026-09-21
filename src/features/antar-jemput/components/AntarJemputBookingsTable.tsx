"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BILLING_BADGES,
  BookingSessionSteps,
  BookingStatusActions,
} from "@/features/booking";
import { clockOf, dayOf, type GroomingRow } from "@/features/grooming/board";
import { RowBreakdown } from "@/features/grooming/components/GroomingBookingsTable";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { LEG_LABEL, otherLeg, rideOf } from "../ride";

/**
 * The Antar-Jemput board's table — one row per ride, from
 * `buloo-antar-jemput-v5.html`: Booking · Pelanggan & Hewan · Arah & Alamat ·
 * Jam · Driver · Faktur · Status · Nilai.
 *
 * THE GROOMING TABLE'S BEHAVIOUR, ITS OWN COLUMNS. The status control sits in
 * the row and the opened row carries the tahapan (Mulai / Selesai / Ganti PIC)
 * beside the bill — BO's note 6 asks for exactly Grooming's PIC flow. What a
 * ride shows that a bath does not is where the van goes and who is in it.
 *
 * THE MOCKUP'S "Roundtrip" IS "Pulang-pergi" (ui-rules §12): the badge under
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
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
            <TableHead className="w-12">
              <span className="sr-only">Rincian</span>
            </TableHead>
            <TableHead>Booking</TableHead>
            <TableHead>Pelanggan &amp; Hewan</TableHead>
            <TableHead>Arah &amp; Alamat</TableHead>
            <TableHead>Jam</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Faktur</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Nilai</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const { booking, service } = row;
            const expanded = open.has(row.key);
            const detailId = `ride-detail-${row.key}`;
            const billing = BILLING_BADGES[row.billing];
            const ride = rideOf(booking);
            /* The other direction of the same visit — the "Pulang-pergi" pair. */
            const pair = ride.leg
              ? (booking.trips ?? []).find((trip) => trip.tripLeg === otherLeg(ride.leg!))
              : undefined;

            return (
              <Fragment key={row.key}>
                <TableRow
                  className={cn(
                    "cursor-pointer align-top",
                    expanded && "bg-surface-hover",
                  )}
                  onClick={(event) => {
                    /* Only clicks in the row itself — see GroomingBookingsTable. */
                    const target = event.target as HTMLElement;
                    if (!event.currentTarget.contains(target)) return;
                    if (target.closest("a, button, input, label")) return;
                    toggle(row.key);
                  }}
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      aria-label={`${expanded ? "Tutup" : "Buka"} rincian ${booking.bookingNumber ?? "booking draf"}`}
                      onClick={() => toggle(row.key)}
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    </Button>
                  </TableCell>

                  <TableCell>
                    <Link
                      href={`/dashboard/booking/${booking._id}`}
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
                        Pulang-pergi · {pair.bookingNumber ?? "draf"}
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

                  <TableCell className="whitespace-normal">
                    <span className="block text-sm font-semibold text-foreground">
                      {booking.customerName ?? "—"}
                    </span>
                    <span className="block text-xs text-muted">
                      {ride.names.join(", ") || "—"}
                      {ride.animals > 1 && ` · ${ride.animals} hewan`}
                    </span>
                  </TableCell>

                  <TableCell className="max-w-88 whitespace-normal">
                    <span className="flex flex-wrap gap-1">
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
                        {service.zone?.name && ` · ${service.zone.name}`}
                      </Badge>
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {ride.address ?? "Alamat tersimpan pelanggan"}
                    </span>

                    {row.addons.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {row.addons.map((addon) => (
                          <span
                            key={addon.itemId}
                            className="rounded-md bg-tint-neutral px-2 py-0.5 text-xs text-muted"
                          >
                            + {addon.name}
                          </span>
                        ))}
                      </span>
                    )}

                    {/* Staff-facing only — the customer's note is not a warning. */}
                    {booking.internalNotes && (
                      <span className="mt-2 flex items-start gap-1.5 rounded-md bg-tint-warning px-2 py-1.5 text-xs text-foreground">
                        <TriangleAlert
                          className="mt-px size-4 flex-none text-warning"
                          aria-hidden
                        />
                        {booking.internalNotes}
                      </span>
                    )}
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
                    {billing ? (
                      <Badge
                        variant="outline"
                        className={cn("border-transparent", billing.className)}
                      >
                        {billing.label}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
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

                {expanded && (
                  <TableRow
                    id={detailId}
                    className="bg-surface-hover hover:bg-surface-hover"
                  >
                    <TableCell colSpan={9} className="whitespace-normal p-4">
                      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                        <BookingSessionSteps booking={booking} onChanged={onChanged} />
                        <RowBreakdown row={row} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
