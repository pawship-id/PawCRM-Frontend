"use client";

import { useState } from "react";
import { CalendarClock, EllipsisVertical, History } from "lucide-react";

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
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingPet, BookingStatus } from "@/types/api";

import {
  BOOKING_STATUS_ACTIONS,
  canReschedule,
  canCancel,
  forwardStatuses,
  impliedStatuses,
} from "../statusFlow";
import { BOOKING_STATUS_LABELS } from "./BookingStatusBadge";
import { BookingHistoryDialog } from "./BookingHistoryDialog";
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
  pet,
  onChanged,
  variant = "compact",
}: {
  booking: Booking;
  /**
   * THE ANIMAL THIS CONTROL MOVES — PCR-042.
   *
   * The status is a fact about one animal: a visit where Mochi has arrived and
   * Coco has not is in two states, and a single control for the pair could only
   * be right about one of them. Every screen that shows this now shows one per
   * animal.
   *
   * ⚠️ IT DECIDES BOTH WHAT IS OFFERED AND WHAT IS SENT. `pet.status` builds the
   * menu; `pet.petId` goes on the wire, so the server moves this animal and
   * leaves its neighbours where they are.
   */
  pet: BookingPet;
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
   * the trail, cancelling). Built for the per-animal work page, where this is
   * the one booking-level action on the whole screen.
   *
   * BOTH VARIANTS SHARE EVERY LINE OF STATE BELOW THIS POINT — the confirm
   * dialog, the implied-rungs note, the cancel reason, the error handling.
   * Only the trigger markup differs; duplicating the dialog logic for a second
   * look is exactly the "two sources of truth" shape this module keeps
   * producing bugs from.
   */
  variant?: "compact" | "prominent";
}) {
  const [next, setNext] = useState<BookingStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  /*
    THE BOOKING, NOT ITS STATUS. Which rung comes next depends on whether anybody
    asked to be fetched or driven home — a menu built from the status alone would
    offer "Mulai penjemputan" on a visit with no van booked.
  */
  const forward = forwardStatuses(pet, booking);
  const cancellable = canCancel(pet, booking);
  /*
    MOVING THE DATE IS NOT A RUNG, so it is not in `forward`. It sits beside
    cancellation as the other thing that can happen to an appointment which is
    not it advancing — and like cancellation it needs a second piece of
    information, so it opens a dialog rather than firing on click.
  */
  const reschedulable = canReschedule(pet, booking);

  /*
    WHAT A HUMAN CALLS THIS ROW — the ANIMAL, since one visit now carries several
    of these controls. "BK-260910-001 · Mochi" is what a toast has to say for
    somebody to know which of the two dogs just moved.
  */
  const label =
    [booking.bookingNumber, pet.petName].filter(Boolean).join(" · ") ||
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
        /* THIS ANIMAL, never the whole visit — see the `pet` prop. */
        pet.petId,
      );

      setNext(null);
      setReason("");
      onChanged(updated);
      swalToast(`${label} · ${BOOKING_STATUS_LABELS[next]}.`);
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

  const implied = next ? impliedStatuses(pet, booking, next) : [];

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {variant === "prominent" && primaryMove && (
          <Can feature="bookings" action={["advanceStatus", "update"]}>
            <Button size="lg" onClick={() => setNext(primaryMove)}>
              {BOOKING_STATUS_ACTIONS[primaryMove]} →
            </Button>
          </Can>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {variant === "prominent" ? (
              <Button variant="secondary" size="lg">
                Other statuses ▾
              </Button>
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
                    {BOOKING_STATUS_ACTIONS[status]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </Can>
            )}

            {/* Ungated: the trail is a read, and seeing the row is the only grant
              reading its history needs. */}
            <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
              <History />
              Status history
            </DropdownMenuItem>

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
      </div>

      {next && (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>{BOOKING_STATUS_ACTIONS[next]}</DialogTitle>
              <DialogDescription>
                {/*
                  ⚠️ `booking.petName` USED TO BE APPENDED HERE, and it was a lie
                  about scope. It is every animal's name joined — "Cici, Cilang" —
                  left over from when one control moved the whole visit. The move
                  has named ONE animal since PCR-042, so the dialog read
                  "BK-… · Cici · Cici, Cilang — statusnya menjadi Confirmed" and
                  invited somebody to believe both dogs were about to move.

                  `label` ALREADY CARRIES THE NUMBER AND THE ANIMAL, which is
                  exactly the scope of what is about to happen.
                */}
                {label} — statusnya menjadi {BOOKING_STATUS_LABELS[next]}.
                Perpindahan status tidak bisa dibatalkan.
                {/*
                  SAID OUT LOUD ONLY WHEN THERE IS SOMETHING TO SAY. On a
                  one-animal visit "hewan lain tidak ikut" answers a question
                  nobody asked; on a visit with two it is the first thing
                  somebody wants to know before pressing.
                */}
                {booking.pets.length > 1 && (
                  <> Hewan lain di booking ini tidak ikut berubah.</>
                )}
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
                    .map((status) => BOOKING_STATUS_LABELS[status])
                    .join(" dan ")}
                </b>{" "}
                pada jam yang sama.
              </p>
            )}

            {next === "completed" && (
              /*
                COMPLETING IS NOT BEING PAID. The till stamps the sale when money
                lands; marking it here only says the work is done, and a
                completed booking is no longer offered to the kasir — so anybody
                doing this to a job that has not been paid for should know they
                have just taken it off the counter's list.
              */
              <p className="text-sm text-muted">
                Menandai selesai di sini tidak mencatat pembayaran. Booking yang
                sudah selesai tidak muncul lagi di kasir.
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

      <BookingHistoryDialog
        booking={booking}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      {/*
        MOUNTED ONLY WHILE OPEN, unlike the history dialog beside it. It seeds
        its two fields from `booking.scheduledAt` on first render, so a dialog
        that stayed mounted would keep showing the old date after a reschedule
        until the whole screen remounted.
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
