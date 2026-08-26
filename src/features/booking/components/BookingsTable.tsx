"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { BookingStatusBadge } from "./BookingStatusBadge";

/**
 * When it is scheduled, to the minute.
 *
 * THE TIME MATTERS HERE, unlike on a receipt's due date: a day sheet is read as
 * "who is at ten", and a date with no clock on it cannot answer that.
 */
function scheduledLabel(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";

  return at.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The booking list.
 *
 * READ-ONLY, deliberately. Every way a booking legitimately changes today runs
 * through the till — pulled into a basket, completed by a payment, released by a
 * void — and each of those carries rules this table has no way to enforce.
 * Buttons here that bypassed them would be a second, weaker authority over the
 * same documents.
 *
 * WHAT IT IS FOR is seeing that any of it happened at all. Until this screen
 * existed the only way to check a booking was to open the database.
 */
export function BookingsTable({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        Belum ada booking yang cocok dengan filter ini.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nomor</TableHead>
            <TableHead>Jadwal</TableHead>
            <TableHead>Pelanggan</TableHead>
            <TableHead>Hewan</TableHead>
            <TableHead>Layanan</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {bookings.map((booking) => (
            <TableRow key={booking._id}>
              <TableCell className="align-top">
                <span className="block text-sm tabular-nums text-foreground">
                  {booking.bookingNumber}
                </span>
                {/*
                  WHERE IT CAME FROM, and only when it is the unusual one. Every
                  booking made the ordinary way would otherwise carry a badge
                  saying so, which is a column of noise — ui-rules §1.3: a badge
                  earns its place by being the exception.
                */}
                {booking.origin === "pos_adhoc" && (
                  <Badge
                    variant="outline"
                    className="mt-1 border-transparent bg-tint-neutral text-muted"
                  >
                    Dari kasir
                  </Badge>
                )}
              </TableCell>

              <TableCell className="align-top text-sm tabular-nums text-foreground">
                {scheduledLabel(booking.scheduledAt)}
              </TableCell>

              <TableCell className="align-top text-sm text-foreground">
                {booking.customerName ?? "—"}
              </TableCell>

              <TableCell className="align-top text-sm text-foreground">
                {booking.petName ?? "—"}
              </TableCell>

              <TableCell className="align-top">
                {booking.items.map((item) => (
                  <span key={item.serviceId} className="block">
                    <span className="block text-sm text-foreground">
                      {item.name}
                    </span>
                    {/* Never blank — the server names an unassigned slot. */}
                    <span className="block text-xs text-muted">
                      {item.groomerName}
                    </span>
                  </span>
                ))}
              </TableCell>

              <TableCell className="align-top text-right text-sm tabular-nums text-foreground">
                {/*
                  Summed as DECIMAL STRINGS, never with `Number()`. This is the
                  one figure on the screen somebody might reconcile against a
                  sale, and `0.1 + 0.2` is the reason utils/decimal.ts exists.
                */}
                {formatMoney(sumDecimals(booking.items.map((item) => item.price)))}
              </TableCell>

              <TableCell className="align-top">
                <BookingStatusBadge status={booking.status} />
                {/*
                  A booking sitting in somebody's basket right now is neither
                  confirmed-and-waiting nor sold, and the status alone cannot
                  say so. Without this a cashier at the second till reads
                  "Dikonfirmasi" and rings it up again.
                */}
                {booking.pulledToCartAt && booking.status === "confirmed" && (
                  <span className="mt-1 block text-xs text-muted">
                    Ada di keranjang
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
