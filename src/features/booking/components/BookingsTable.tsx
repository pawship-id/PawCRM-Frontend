"use client";

import Link from "next/link";

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

import { formatBookingMoment } from "../format";
import { BookingStatusActions } from "./BookingStatusActions";
import { BookingStatusBadge } from "./BookingStatusBadge";

/**
 * The booking list.
 *
 * IT MOVES BOOKINGS NOW, and that is a reversal of how it was first built. The
 * argument for read-only was that every legitimate change ran through the till;
 * what that missed is that the till only ever sees the END of a booking. An
 * animal arriving and a groomer starting are facts nobody was able to record at
 * all, and the person who knows them is the one with this screen open — so the
 * moves live here, behind the same state machine the server enforces (see
 * `BookingStatusActions`).
 *
 * THE EDITABLE SURFACE IS STILL NOT HERE. Rescheduling, changing the services or
 * swapping the animal go through `PATCH /bookings/:id` and want a form, not a
 * row; this table moves a booking along and nothing else.
 */
export function BookingsTable({
  bookings,
  onChanged,
}: {
  bookings: Booking[];
  /** Called after a row action, so the screen can re-ask the server. */
  onChanged: () => void;
}) {
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
            {/* Never empty: every reader may open a row's trail, whatever else
                their role allows. */}
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {bookings.map((booking) => (
            <TableRow key={booking._id}>
              <TableCell className="align-top">
                {/*
                  NULL WHILE IT IS A DRAFT — the number is earned by leaving
                  draft, and an invented placeholder would be a number somebody
                  could quote back across a counter.
                */}
                {/*
                  THE WAY IN, and it is the number rather than the whole row: a
                  row carries a status control of its own, and a clickable row
                  around a button is two targets fighting for one tap.

                  A DRAFT STILL READS "—", not "Draf". The badge beside it
                  already says draft, and repeating the word in the number column
                  would put the same fact on the row twice while telling nobody
                  what the column is for. The dash means "no number yet", which
                  is the true answer; `aria-label` is what makes the link
                  nameable for anybody who cannot see the row it sits in.
                */}
                <Link
                  href={`/dashboard/booking/${booking._id}`}
                  aria-label={`Buka ${booking.bookingNumber ?? "booking draf"}`}
                  className="block text-sm tabular-nums text-primary underline-offset-2 hover:underline"
                >
                  {booking.bookingNumber ?? "—"}
                </Link>
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
                {formatBookingMoment(booking.scheduledAt)}
              </TableCell>

              <TableCell className="align-top text-sm text-foreground">
                {booking.customerName ?? "—"}
              </TableCell>

              <TableCell className="align-top text-sm text-foreground">
                {booking.petName ?? "—"}
                {/*
                  A VISIT MAY BRING SEVERAL ANIMALS since PCR-040, and the names
                  above are joined into one string. The count is repeated as a
                  badge because "Mochi, Coco" reads as one long name at a glance
                  and a number does not.
                */}
                {booking.petCount > 1 && (
                  <span className="mt-1 block text-xs text-muted">
                    {booking.petCount} hewan
                  </span>
                )}
              </TableCell>

              <TableCell className="align-top">
                {booking.items.map((item) => (
                  <span key={item._id} className="block">
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
                  WHAT THE STATUS ALONE CANNOT SAY, and since Amandemen
                  PCR-021/022/023 there are TWO such things rather than one.

                  A paid booking used to read "Selesai", so "Dikonfirmasi" could
                  only mean waiting. Now paying leaves it CONFIRMED — because
                  paying is not being groomed — and one badge covers three
                  different situations: nobody has touched it, it is in a basket
                  right now, or it has been paid for and still has to be done.
                  Reading the wrong one rings a grooming up twice.

                  PAID WINS over "in a basket", because both are true at once
                  after a sale: the basket that claimed it is the one that paid.
                  Showing "Ada di keranjang" there would send a cashier looking
                  for an open basket that has already been settled.
                */}
                {/*
                  NOT ONLY ON `confirmed` ANY MORE. The till used to be able to
                  pull a confirmed booking and nothing else, so this line only
                  ever had one status to explain. Now a grooming can be paid for
                  while it is at check-in or on the table — payment leaves those
                  where they are — and the row would go on reading as though
                  nobody had touched it.

                  `completed` and `cancelled` are left out: one is finished and
                  the other is not owed, so neither is about to be rung up twice.
                */}
                {booking.status !== "completed" &&
                  booking.status !== "cancelled" &&
                  (booking.posTransactionId ? (
                    <span className="mt-1 block text-xs text-muted">
                      {booking.status === "confirmed"
                        ? "Sudah dibayar — belum dikerjakan"
                        : "Sudah dibayar"}
                    </span>
                  ) : (
                    /*
                      THREE STATES SINCE PCR-040, not two. A visit can be
                      half-billed — Coco went home ungroomed and Mochi was paid
                      for — and a badge that only knew "billed or not" would
                      report the whole visit as settled.
                    */
                    booking.billingState !== "unbilled" && (
                      <span className="mt-1 block text-xs text-muted">
                        {booking.billingState === "partial"
                          ? "Sebagian sudah ditagih"
                          : "Ada di keranjang"}
                      </span>
                    )
                  ))}
              </TableCell>

              <TableCell className="align-top">
                <div className="flex justify-end">
                  <BookingStatusActions
                    booking={booking}
                    onChanged={onChanged}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
