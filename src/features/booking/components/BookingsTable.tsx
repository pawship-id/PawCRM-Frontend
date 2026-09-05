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
import { EllipsisVertical, SquareArrowOutUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { formatBookingMoment } from "../format";
import { BookingStatusBadge } from "./BookingStatusBadge";

/**
 * The booking list.
 *
 * ─── IT READS, AND IT DOES NOT MOVE ANYTHING ───────────────────────────────
 *
 * The status menu used to be in the action column — every forward rung, cancel,
 * reschedule and the trail, on every row. It was taken out on 5 September 2026
 * and the column is one link to the booking.
 *
 * WHY: the ladder outgrew the row. Nine rungs, two of them conditional on the
 * booking, guards that refuse `completed` until every session is finished — the
 * menu had grown to seven items and was answering questions ("can this one be
 * handed over yet?", "which sessions are still open?") whose evidence is on the
 * detail page and nowhere near the row. Moving a booking from a list is a
 * decision taken without looking at the thing being decided about.
 *
 * IT ALSO MADE THE COMMONEST MISTAKE THE EASIEST ONE. The kebab sits under the
 * pointer at the end of every row; "Tandai selesai dikerjakan" on the wrong row
 * fires commission for the wrong visit, and the ladder only runs forward — there
 * is no undo, only a cancellation and a new booking.
 *
 * THE KEBAB ITSELF STAYED. What was wrong was what it held, not that it was
 * there: every other table in this app ends in the same button, and a booking
 * row that ended in a bare link would be the one row somebody has to look at
 * twice to find the actions on. It now holds one item — Detail booking.
 *
 * ─── AND IT NO LONGER LISTS THE SERVICES ──────────────────────────────────
 *
 * The Layanan column printed every row of the booking — name over groomer, one
 * pair per service — inside a single table cell. It was the only cell whose
 * height depended on the booking, so a visit with three services made its row
 * three times as tall and pushed the next booking off the fold; a day sheet
 * where you can see six bookings is worth more than one where you can see two
 * and their service lists.
 *
 * IT ALSO REPEATED "Belum ditentukan" ONCE PER SERVICE, which is the ordinary
 * state of a booking taken over the phone — so the column that took the most
 * vertical space was mostly saying the same three words over and over.
 *
 * WHAT IT ANSWERED IS STILL ANSWERED. `Hewan` names the animals and `Total` is
 * the sum of exactly these rows; "which services" is a question about one
 * booking, and it is on that booking's page — a click away, next to the prices,
 * the groomers and the sessions it belongs with.
 *
 * THE EDITABLE SURFACE WAS NEVER HERE EITHER. Changing services or swapping an
 * animal goes through `PATCH /bookings/:id` and wants a form, not a row.
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
                      {/*
                        ─── "PAID" IS NOT ENOUGH SINCE PCR-040 ─────────────────

                        `posTransactionId` is stamped on the HEADER by any sale
                        that touched the booking, and a sale may cover ONE of two
                        animals. This read "Sudah dibayar" over a visit half of
                        which had never been charged for — the screen agreeing
                        with money the shop had lost.

                        The detail page had it right from the start, because it
                        shows the ROWS. The list shows one line for the whole
                        visit, so the line has to carry the difference itself.
                      */}
                      {/*
                        TWO FACTS, COMPOSED — not one branch choosing between
                        them. How much was paid and whether the work has started
                        are independent, and the first version folded them into a
                        single ladder: a half-paid booking lost the "belum
                        dikerjakan" half that every other row carries, so the one
                        row that needed the most explanation carried the least.
                      */}
                      {booking.billingState === "partial"
                        ? "Sudah dibayar sebagian"
                        : "Sudah dibayar"}
                      {booking.status === "confirmed" && " — belum dikerjakan"}
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
                  {/*
                    THE KEBAB STAYS, AND HOLDS ONE THING.

                    The status moves left this menu (see the header); what did
                    not change is the SHAPE of the column — every other table in
                    this app ends in the same button, and a booking row that
                    ended in a plain link instead would be the one row somebody
                    has to look at twice to find the actions on.

                    VERTICAL DOTS, matching every other table in this app.

                    THE NUMBER IN THE FIRST COLUMN OPENS THE SAME PAGE, and the
                    duplication is deliberate: the number is what somebody
                    reading the row clicks, this is what somebody scanning the
                    right-hand edge for "what can I do with this" finds.
                  */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        // The icon carries no name, so the label says which row
                        // this menu belongs to — twenty identical "Aksi" buttons
                        // teach a screen-reader user nothing.
                        aria-label={`Aksi untuk ${booking.bookingNumber ?? "booking draf"}`}
                      >
                        <EllipsisVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      {/*
                        `asChild`, so the row is a real link: middle-click and
                        "open in new tab" work, which is how somebody working a
                        day sheet actually opens three bookings.
                      */}
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/booking/${booking._id}`}>
                          <SquareArrowOutUpRight />
                          Detail booking
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
