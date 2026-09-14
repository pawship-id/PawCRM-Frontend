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
 * The booking list — ONE ROW PER BOOKING, and a booking is one animal and one
 * main service. A customer who brings two dogs has two rows, tied together by
 * `groupId` rather than merged into one.
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
 * The Layanan column printed every service of the booking — name over groomer —
 * inside a single table cell. It was the only cell whose height depended on the
 * booking, so a visit with three services made its row three times as tall and
 * pushed the next booking off the fold. It also repeated "Belum ditentukan" once
 * per service, which is the ordinary state of a booking taken over the phone.
 *
 * A booking holds exactly one main service now, so the height argument is
 * history. The column was NOT brought back as part of that change: whether it
 * should be is a question for the shop, not a tidy-up.
 *
 * WHAT IT ANSWERED IS STILL ANSWERED. `Hewan` names the animal and `Total` is
 * the service plus its add-ons; "which service, which groomer" is on the
 * booking's page — a click away, next to the prices and the sessions.
 *
 * THE EDITABLE SURFACE WAS NEVER HERE EITHER. Changing the service or swapping
 * the animal goes through `PATCH /bookings/:id` and wants a form, not a row.
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
          {bookings.map((booking) => {
            /*
              `?.` ON THE SERVICE AND `?? []` ON ITS ADD-ONS, and it is not
              defensive habit. The type says both are always sent, and the server
              always sends them — but a day sheet is the screen a shop leaves
              open all morning, and a browser holding a response from before a
              deploy would take the WHOLE TABLE down over one missing field. A
              dash in one cell is a row somebody can still open; a blank page is
              a shop that cannot see its day.
            */
            const service = booking.service;

            /*
              ⚠️ TWO FACTS, COMPOSED — NOT ONE BRANCH CHOOSING BETWEEN THEM. How
              much was paid and whether the work has started do not decide each
              other, and folding them into a single ladder is a mistake this
              column has made TWICE: the paid row loses "belum dikerjakan", which
              is the one row that needs explaining most. Kept apart, then joined.

              `posTransactionId` is the only thing that separates "in somebody's
              basket" from "paid for": the claim instant says a till holds this
              booking, the sale id says the till settled. A cart claim with no
              sale behind it is a basket still open.
            */
            const claim = booking.pulledToInvoiceAt
              ? "Sudah difakturkan"
              : booking.pulledToCartAt
                ? booking.posTransactionId
                  ? "Sudah dibayar"
                  : "Ada di keranjang"
                : null;

            /* `confirmed` is the only status that means "agreed, and nobody has
               started". */
            const work = booking.status === "confirmed" ? "belum dikerjakan" : null;

            return (
              <TableRow key={booking._id}>
                <TableCell className="align-top">
                  {/*
                    NULL WHILE IT IS A DRAFT — the number is earned by leaving
                    draft, and an invented placeholder would be a number somebody
                    could quote back across a counter.
                  */}
                  {/*
                    THE WAY IN, and it is the number rather than the whole row: a
                    clickable row around the kebab is two targets fighting for one
                    tap.

                    A DRAFT STILL READS "—", not "Draf". The badge beside it
                    already says draft, and repeating the word in the number
                    column would put the same fact on the row twice while telling
                    nobody what the column is for. The dash means "no number
                    yet", which is the true answer; `aria-label` is what makes the
                    link nameable for anybody who cannot see the row it sits in.
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
                </TableCell>

                <TableCell className="align-top text-right text-sm tabular-nums text-foreground">
                  {/*
                    ⚠️ ADD-ONS ARE IN IT. A perfume is its own price line, and a
                    total that summed only the service would read cheaper than the
                    bill the customer gets — the same omission `summarise` on the
                    server has already been caught making once.

                    Summed as DECIMAL STRINGS, never with `Number()`. This is the
                    one figure on the screen somebody might reconcile against a
                    sale, and `0.1 + 0.2` is the reason utils/decimal.ts exists.
                  */}
                  {service
                    ? formatMoney(
                        sumDecimals([
                          service.price,
                          ...(service.addons ?? []).map((addon) => addon.price),
                        ]),
                      )
                    : "—"}
                </TableCell>

                <TableCell className="align-top">
                  <BookingStatusBadge status={booking.status} />

                  {/*
                    ─── WHAT THE STATUS ALONE CANNOT SAY ───────────────────────

                    One badge covers three situations that look identical: nobody
                    has touched it, it is in a basket right now, or it has been
                    paid for and still has to be done. Reading the wrong one rings
                    a grooming up twice.

                    `completed` and `cancelled` are left out: one is finished and
                    the other is not owed, so neither is about to be rung up twice.
                  */}
                  {booking.status !== "completed" &&
                    booking.status !== "cancelled" &&
                    (claim || work) && (
                      <span className="mt-1 block text-xs text-muted">
                        {claim && work
                          ? `${claim} — ${work}`
                          : (claim ?? "Belum dikerjakan")}
                      </span>
                    )}
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
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
