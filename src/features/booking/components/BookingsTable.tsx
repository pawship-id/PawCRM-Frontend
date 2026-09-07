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

        {/*
          ─── ONE `<tbody>` PER BOOKING, WHICH IS WHAT MAKES HOVER WORK ────────

          `TableRow` carries `hover:bg-muted/50`, and a hover on a `<tr>` reaches
          that row and nothing else — so a visit split across two rows lit up
          half of itself, which reads as two unrelated bookings rather than one.

          CSS CANNOT REACH A SIBLING ROW, and a `<table>` may hold ANY NUMBER of
          `<tbody>` elements — that is what they are for. Grouping each visit in
          its own gives the browser something to hover, and
          `[&:hover>tr]:bg-muted/50` lights every row of it at once. The colour
          is the same one `TableRow` already uses, so the two rules agree rather
          than fight.

          THE OPEN MENU NEEDS THE SAME TREATMENT, for the same reason. `TableRow`
          also carries `has-aria-expanded:bg-muted/50`, so a row stays lit while
          its kebab is open — but the trigger sits in the FIRST row's cell, the
          one that spans downwards, so only that row knew. Raised to the body
          alongside the hover rule: while the menu is open the whole visit is
          lit, which is what says WHICH booking the menu is about.

          NO REACT STATE. A `hoveredBookingId` would re-render the list on every
          mouse move across a day sheet of fifty rows, to do what two selectors
          do for nothing.

          ⚠️ THE SEPARATOR MOVES TO THE BODY, AND NOT BY ACCIDENT.

          `TableBody` carries `[&_tr:last-child]:border-0` — right when there was
          one body for the whole list, and wrong now: every booking's last row
          loses its border, so the table would have no separators at all.

          THE OBVIOUS FIX IS A TRAP. Re-adding `[&_tr:last-child]:border-b` here
          collides with that rule at EXACTLY equal specificity (both are one
          class, one pseudo-class and one type), so which one wins is decided by
          the order Tailwind happens to emit two border utilities in — a visual
          detail resting on a build detail, and `!important` to settle it is a
          hammer the next person has to work around.

          SO THE LINE GOES ON THE BODY INSTEAD, as a TOP border on every visit
          but the first. Different element, different property: nothing to
          collide with, and the last visit ends without a trailing rule exactly
          as the list did before.
        */}
        {bookings.map((booking) => {
          /*
              ─── ONE ROW PER ANIMAL, WITH THE VISIT'S OWN CELLS MERGED ────────

              A booking is one arrival and several animals, and the two halves of
              a row answer to different things: the number, the time, the customer
              and the actions belong to the VISIT, while the name, the money and
              the status belong to one dog. Rendering all of it on one line meant
              "Cici, Cilang" in one cell, one total covering both, and a stack of
              badges beside them — three columns the reader had to line up by eye.

              `rowSpan` ON THE FIRST ROW ONLY. The shared cells are written once
              and stretch down; the animal rows that follow carry only their own
              three. That is what a table is for, and it is why this is not two
              nested tables or a card list.

              THE BORDER IS SUPPRESSED BETWEEN AN ANIMAL AND THE NEXT, so a visit
              reads as one block rather than as two unrelated bookings that happen
              to share a customer.

              A BOOKING WITH NO ANIMALS STILL GETS A ROW. It is reachable while an
              edit is mid-flight, and a booking that vanishes from the list is
              worse than one that reads "—": the second can be opened and fixed.
            */
          const pets = booking.pets.length > 0 ? booking.pets : [null];

          return (
            <TableBody
              key={booking._id}
              className="has-aria-expanded:[&>tr]:bg-muted/50 [&:hover>tr]:bg-muted/50 [&:not(:first-of-type)]:border-t"
            >
              {pets.map((pet, index) => (
                <TableRow
                  key={pet?.petItemId ?? booking._id}
                  className={index < pets.length - 1 ? "border-b-0" : undefined}
                >
                  {/* THE VISIT'S OWN CELLS — written once, stretched down. */}
                  {index === 0 && (
                    <TableCell className="align-top" rowSpan={pets.length}>
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
                  )}

                  {index === 0 && (
                    <TableCell
                      className="align-top text-sm tabular-nums text-foreground"
                      rowSpan={pets.length}
                    >
                      {formatBookingMoment(booking.scheduledAt)}
                    </TableCell>
                  )}

                  {index === 0 && (
                    <TableCell
                      className="align-top text-sm text-foreground"
                      rowSpan={pets.length}
                    >
                      {booking.customerName ?? "—"}
                    </TableCell>
                  )}

                  {/*
                ONE ANIMAL, ON ITS OWN LINE.

                The joined "Cici, Cilang" and the "2 hewan" badge under it are
                both gone: the row count says how many there are, and each name
                now sits beside the money and the status that belong to it.
              */}
                  <TableCell className="align-top text-sm text-foreground">
                    {pet?.petName ?? "—"}
                  </TableCell>

                  <TableCell className="align-top text-right text-sm tabular-nums text-foreground">
                    {/*
                  THIS ANIMAL'S SHARE, not the visit's.

                  ⚠️ ADD-ONS ARE IN IT. A perfume is its own price line, and a
                  total that summed only `services` would read cheaper than the
                  bill the customer gets — the same omission `summarise` on the
                  server has already been caught making once.

                  Summed as DECIMAL STRINGS, never with `Number()`. This is the
                  one figure on the screen somebody might reconcile against a
                  sale, and `0.1 + 0.2` is the reason utils/decimal.ts exists.
                */}
                    {pet
                      ? formatMoney(
                          sumDecimals(
                            /*
                            `?? []` ON BOTH LEVELS, and it is not defensive
                            habit. The type says these arrays are always sent,
                            and the server always sends them — but a day sheet is
                            the screen a shop leaves open all morning, and a
                            browser holding a response from before a deploy would
                            take the WHOLE TABLE down over one missing field. A
                            dash in one cell is a row somebody can still open; a
                            blank page is a shop that cannot see its day.
                          */
                            (pet.services ?? []).flatMap((service) => [
                              service.price,
                              ...(service.addons ?? []).map(
                                (addon) => addon.price,
                              ),
                            ]),
                          ),
                        )
                      : "—"}
                  </TableCell>

                  <TableCell className="align-top">
                    {pet ? <BookingStatusBadge status={pet.status} /> : "—"}

                    {/*
                  ─── WHAT THE STATUS ALONE CANNOT SAY, NOW PER ANIMAL ─────────

                  One badge covers three situations that look identical: nobody
                  has touched it, it is in a basket right now, or it has been paid
                  for and still has to be done. Reading the wrong one rings a
                  grooming up twice.

                  ⚠️ IT ASKS THE ANIMAL. Until the rows were split this read the
                  header's `billingState` and `posTransactionId` — a sale that
                  covered ONE of two animals stamped both, so a visit half of
                  which had never been charged for read "Sudah dibayar". The
                  claim is the animal's since PCR-042, and now so is the line
                  that reports it.

                  `posTransactionId` IS STILL THE HEADER'S, and it is the only
                  thing that separates "in somebody's basket" from "paid for":
                  the claim instant says a till holds this animal, the sale id
                  says the till settled. A cart claim with no sale behind it is a
                  basket still open.

                  `completed` and `cancelled` are left out: one is finished and
                  the other is not owed, so neither is about to be rung up twice.
                */}
                    {pet &&
                      pet.status !== "completed" &&
                      pet.status !== "cancelled" &&
                      (() => {
                        /*
                        ⚠️ TWO FACTS, COMPOSED — NOT ONE BRANCH CHOOSING BETWEEN
                        THEM. How much was paid and whether the work has started
                        do not decide each other, and folding them into a single
                        ladder is a mistake this column has now made TWICE: the
                        paid row loses "belum dikerjakan", which is the one row
                        that needs explaining most. Kept apart, then joined.
                      */
                        const claim = pet.pulledToInvoiceAt
                          ? "Sudah difakturkan"
                          : pet.pulledToCartAt
                            ? booking.posTransactionId
                              ? "Sudah dibayar"
                              : "Ada di keranjang"
                            : null;

                        /* `confirmed` is the only status that means "agreed, and
                         nobody has started". */
                        const work =
                          pet.status === "confirmed"
                            ? "belum dikerjakan"
                            : null;

                        if (!claim && !work) return null;

                        return (
                          <span className="mt-1 block text-xs text-muted">
                            {claim && work
                              ? `${claim} — ${work}`
                              : (claim ?? "Belum dikerjakan")}
                          </span>
                        );
                      })()}
                  </TableCell>

                  {index === 0 && (
                    <TableCell className="align-top" rowSpan={pets.length}>
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
                  )}
                </TableRow>
              ))}
            </TableBody>
          );
        })}
      </Table>
    </div>
  );
}
