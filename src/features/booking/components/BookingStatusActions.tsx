"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, EllipsisVertical } from "lucide-react";

import { Alert, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can, usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingStatus } from "@/types/api";

import {
  BOOKING_STATUS_ACTIONS,
  bookingStatusAction,
  canReschedule,
  canCancel,
  forwardStatuses,
  impliedStatuses,
} from "../statusFlow";
import {
  BookingStatusBadge,
  bookingStatusLabel,
} from "./BookingStatusBadge";
import { BookingRescheduleDialog } from "./BookingRescheduleDialog";

/** Mirrors NOTES_MAX_LENGTH in booking.model.js. */
const REASON_MAX_LENGTH = 500;

/**
 * Moving a booking along, from the day sheet.
 *
 * WHY THE LIST GETS THIS AT ALL. The till moves a booking when money changes
 * hands, and that is the only mover this screen used to have — which left the
 * whole first half of a booking's life unrecordable: an animal arrives, a
 * groomer starts, and nothing anywhere says so until somebody pays. The
 * receptionist watching the door is the person who knows, and this is the screen
 * they have open.
 *
 * SINCE AMANDEMEN PCR-021/022/023 IT IS ALSO THE ONLY WAY WORK GETS CLOSED. The
 * till now leaves a paid booking `confirmed` rather than `completed`, because
 * paying is not being groomed — so "Tandai selesai" here is no longer a tidy-up
 * for the rare case, it is the click that makes "sudah dikerjakan" mean
 * anything at all.
 *
 * EVERY MOVE CONFIRMS, including the ordinary ones, because NO MOVE CAN BE
 * UNDONE: the state machine only runs forward, so a mis-tapped "Selesai" is not
 * a click somebody takes back. The dialog is also where the two things worth
 * saying fit — which rungs the jump fills in behind it, and that completing here
 * is not the same as being paid for.
 *
 * IT DOES NOT OFFER GOING BACK, and that is the server's rule showing through
 * rather than an omission here: `BOOKING_TRANSITIONS` has no downward edge. A
 * booking checked in by mistake is cancelled and made again.
 */
export function BookingStatusActions({
  booking,
  onChanged,
  variant = "compact",
  dense = false,
}: {
  /** ONE booking — one animal, one service — and the status is its own. */
  booking: Booking;
  /**
   * Called after a successful move, WITH THE BOOKING THE SERVER JUST RETURNED.
   *
   * ⚠️ THE ARGUMENT IS THE POINT. `PATCH /status` answers with the same document
   * `GET /bookings/:id` would — `#named` on the server builds both — so a screen
   * showing one booking can put the answer straight into state instead of
   * re-asking. A list still ignores it and re-queries; a detail page that
   * re-queried was re-fetching the customer, the animal and the branch to learn
   * something it had already been told, and paying for it with a full-page
   * loading flash on every press.
   *
   * A `() => void` handler is still assignable here, so the list call sites are
   * unchanged.
   */
  onChanged: (booking: Booking) => void;
  /**
   * "compact" (default) — the ellipsis menu used on the day sheet and the
   * booking overview, where a whole row of these sits per line.
   *
   * "prominent" — a big primary button for the very next rung, plus a
   * secondary "Other statuses" trigger for everything else (skip-ahead moves,
   * cancelling). Built for the booking's own page, where this is the one
   * status action on the whole screen.
   *
   * "status" — the current status badge IS the trigger, with a chevron: the
   * Grooming board's Status column (`buloo-grooming-v3.html`), where the badge
   * and the control sit in one cell. With nothing to offer it is the bare badge
   * — a chevron that opens onto nothing reads as broken (see `hasMenu`).
   *
   * EVERY VARIANT SHARES EVERY LINE OF STATE BELOW THIS POINT — the confirm
   * dialog, the implied-rungs note, the cancel reason, the error handling.
   * Only the trigger markup differs; duplicating the dialog logic for a second
   * look is exactly the "two sources of truth" shape this module keeps
   * producing bugs from.
   */
  variant?: "compact" | "prominent" | "status";
  /**
   * "prominent" AT 32 PX INSTEAD OF 40, so its two buttons sit on ONE line in a
   * side panel — Hari Ini's rail is 21 rem, and at `lg` the pair wraps onto two
   * rows with a ragged edge under the heading.
   *
   * ONLY THE SIZE CHANGES. The primary is still the next rung and the secondary
   * still opens the rest; a panel that offered different moves from the
   * booking's own page would be a second state machine to keep in step.
   */
  dense?: boolean;
}) {
  const [next, setNext] = useState<BookingStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  /*
    THE BOOKING, NOT ITS STATUS. Which rung comes next depends on whether anybody
    asked to be fetched or driven home — a menu built from the status alone would
    offer "Mulai penjemputan" on a visit with no van booked.
  */
  const forward = forwardStatuses(booking);
  const cancellable = canCancel(booking);
  /* Read here as well as through `Can`, and only to decide whether the trigger
     that OPENS the menu is worth drawing — see `hasMenu`. */
  const { can, canAny } = usePermissions();
  /*
    MOVING THE DATE IS NOT A RUNG, so it is not in `forward`. It sits beside
    cancellation as the other thing that can happen to an appointment which is
    not it advancing — and like cancellation it needs a second piece of
    information, so it opens a dialog rather than firing on click.
  */
  const reschedulable = canReschedule(booking);

  /*
    WHAT A HUMAN CALLS THIS ROW — the number and the animal. A day sheet lists
    Mochi's and Coco's bookings one under the other, and "BK-260910-001 · Mochi"
    is what a toast has to say for somebody to know which one just moved.
  */
  const label =
    [booking.bookingNumber, booking.petName].filter(Boolean).join(" · ") ||
    "booking ini";

  function close() {
    // Never close mid-write: nobody would be told whether the move landed.
    if (busy) return;
    setNext(null);
    setReason("");
    setError(null);
  }

  async function submit() {
    if (!next || busy) return;

    setBusy(true);
    setError(null);

    try {
      const updated = await bookingService.changeStatus(
        booking._id,
        next,
        // Stored only on a cancellation, and only when there was something to
        // say — a mandatory field with nothing in it gets filled with "-".
        next === "cancelled" && reason.trim() !== "" ? reason.trim() : null,
      );

      setNext(null);
      setReason("");
      onChanged(updated);
      swalToast(`${label} · ${bookingStatusLabel(next, booking)}.`);
    } catch (caught) {
      /*
        `reason` FIRST. A 409 here is the interesting failure — somebody else
        moved it, or it is already final — and the backend puts the state it
        actually found in `reason` while `message` is only the headline.
      */
      setError(
        caught instanceof ApiError
          ? (caught.reason ?? caught.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const implied = next ? impliedStatuses(booking, next) : [];

  /*
    THE VERY NEXT RUNG, for the prominent variant's primary button.

    `forward` IS ALREADY IN LADDER ORDER — `transitionsFor` slices the booking's
    own ladder, arrived before in_progress before completed — so its first entry
    is the one rung directly ahead. The rest are
    the skip-ahead moves the ladder also allows (PCR's "a status skipped is
    still one the booking passed through"), and belong in the menu, not the
    headline button.
  */
  const [primaryMove, ...laterMoves] = forward;
  const menuMoves = variant === "prominent" ? laterMoves : forward;

  /*
    ─── NO TRIGGER FOR AN EMPTY MENU ───────────────────────────────────────────

    A booking that has finished has no rungs left — `transitionsFor` returns
    nothing past the end of the ladder — and cannot be rescheduled, so
    "Other statuses ▾" opened onto nothing at all. A control that answers a
    click with a blank panel reads as broken, and it invited the press twice:
    once to find out, once to be sure.

    ⚠️ IT ASKS THE PERMISSIONS TOO, not just the ladder. Both groups inside the
    menu are wrapped in `Can`, so a role that may only READ saw a trigger with
    moves behind it that never rendered. Counting the rows the LADDER offers
    would have left that case exactly as it was — which is the whole reason this
    reads `usePermissions` rather than the arrays alone.

    THE "Status history" ROW USED TO PAPER OVER THIS. It was ungated and always
    present, so the menu was never empty; removing it is what made an empty one
    reachable.
  */
  const hasMenu =
    (menuMoves.length > 0 && canAny("bookings", ["advanceStatus", "update"])) ||
    (reschedulable && can("bookings", "update")) ||
    (cancellable && can("bookings", "cancel"));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {variant === "prominent" && primaryMove && (
          <Can feature="bookings" action={["advanceStatus", "update"]}>
            <Button
              size={dense ? "sm" : "lg"}
              onClick={() => setNext(primaryMove)}
            >
              {bookingStatusAction(primaryMove, booking)} →
            </Button>
          </Can>
        )}

        {variant === "status" && !hasMenu && (
          <BookingStatusBadge status={booking.status} tripLeg={booking.tripLeg} />
        )}

        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {variant === "prominent" ? (
                <Button variant="secondary" size={dense ? "sm" : "lg"}>
                  Other statuses ▾
                </Button>
              ) : variant === "status" ? (
                <button
                  type="button"
                  aria-label={`Status ${label}: ${bookingStatusLabel(booking.status, booking)}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full pr-1.5 transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <BookingStatusBadge status={booking.status} tripLeg={booking.tripLeg} />
                  <ChevronDown className="size-4 text-muted" aria-hidden />
                </button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  // The icon carries no name, so the label says which row this
                  // menu belongs to — twenty identical "Aksi" buttons teach a
                  // screen-reader user nothing.
                  aria-label={`Aksi untuk ${label}`}
                >
                  <EllipsisVertical className="size-4" />
                </Button>
              )}
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              {menuMoves.length > 0 && (
                /*
                EITHER GRANT, matching the API. `advanceStatus` is the
                groomer's — check a dog in, mark it done — and `update` is the
                stronger one a receptionist already holds. Gating on the
                narrow one alone would have hidden these items from every role
                that has only ever had `update`.
              */
                <Can feature="bookings" action={["advanceStatus", "update"]}>
                  {menuMoves.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onSelect={() => setNext(status)}
                    >
                      {bookingStatusAction(status, booking)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </Can>
              )}

              {/*
            `update`, NOT `cancel`. Rearranging a day is an edit to what was
            agreed; gating it on the cancel grant would mean a receptionist who
            may move bookings cannot, while one who may only end them can.
          */}
              {reschedulable && (
                <Can feature="bookings" action="update">
                  <DropdownMenuItem onSelect={() => setRescheduleOpen(true)}>
                    <CalendarClock />
                    Reschedule
                  </DropdownMenuItem>
                </Can>
              )}

              {cancellable && (
                <Can feature="bookings" action="cancel">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setNext("cancelled")}
                  >
                    {BOOKING_STATUS_ACTIONS.cancelled}
                  </DropdownMenuItem>
                </Can>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {next && (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>{bookingStatusAction(next, booking)}</DialogTitle>
              <DialogDescription>
                {/* `label` CARRIES THE NUMBER AND THE ANIMAL — exactly the scope
                    of what is about to happen. */}
                {label} — statusnya menjadi {bookingStatusLabel(next, booking)}.
                Perpindahan status tidak bisa dibatalkan.
              </DialogDescription>
            </DialogHeader>

            {error && <Alert variant="error">{error}</Alert>}

            {/*
              WHAT ELSE THIS RECORDS. Nobody hands over a dog for an appointment
              that was never agreed, so a jump straight to check-in confirms it
              by doing so — and the trail says both, at the same minute. Said
              here because a log that gains an entry nobody chose is a log
              somebody will distrust the first time they read it.
            */}
            {implied.length > 0 && (
              <p className="text-sm text-muted">
                Sekalian tercatat sebagai{" "}
                <b className="font-medium text-foreground">
                  {implied
                    .map((status) => bookingStatusLabel(status, booking))
                    .join(" dan ")}
                </b>{" "}
                pada jam yang sama.
              </p>
            )}

            {next === "completed" && (
              /*
                COMPLETING IS NOT BEING PAID, and it is not the end of the line
                at the counter either. The till stamps the sale when money lands;
                marking it here only says the work is done.

                ⚠️ THIS USED TO SAY THE BOOKING WOULD LEAVE THE KASIR'S LIST, and
                that has not been true since the bridge started offering every
                status but `cancelled` — see `useBookingBridge` and the row
                comment in `BookingBridgeDialog`, which lists "one already
                finished" among what a cashier sees. The warning named the wrong
                consequence, so somebody checking it against the till found the
                booking still there and learnt to skip the note.

                WHAT ACTUALLY CLOSES is the money: `hasCompletedWork` freezes the
                service, the price and the crew, because commission is computed
                from here (booking.service.js — `updateBooking`,
                `#assertCrewEditable`, `assignGroomer`). That is the thing worth
                saying before somebody presses the button.
              */
              <p className="text-sm text-muted">
                {booking.tripLeg
                  ? "Menandai sampai di sini tidak mencatat pembayaran — perjalanannya tetap ada di daftar kasir. Yang berubah: layanan, harga dan drivernya tidak bisa diubah lagi."
                  : "Menandai selesai di sini tidak mencatat pembayaran — booking-nya tetap ada di daftar kasir. Yang berubah: layanan, harga dan groomernya tidak bisa diubah lagi."}
              </p>
            )}

            {next === "cancelled" && (
              <TextareaField
                label="Alasan"
                name="cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={REASON_MAX_LENGTH}
                placeholder="mis. pelanggan menjadwalkan ulang"
                hint="Boleh dikosongkan."
                disabled={busy}
                rows={3}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={close}
                disabled={busy}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant={next === "cancelled" ? "destructive" : "default"}
                onClick={submit}
                disabled={busy}
              >
                {busy ? "Menyimpan…" : BOOKING_STATUS_ACTIONS[next]}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/*
        MOUNTED ONLY WHILE OPEN. It seeds its two fields from
        `booking.scheduledAt` on first render, so a dialog that stayed mounted
        would keep showing the old date after a reschedule until the whole
        screen remounted.
      */}
      {rescheduleOpen && (
        <BookingRescheduleDialog
          booking={booking}
          open
          onOpenChange={setRescheduleOpen}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
