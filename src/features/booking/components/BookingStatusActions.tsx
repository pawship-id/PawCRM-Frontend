"use client";

import { useState } from "react";
import { EllipsisVertical, History } from "lucide-react";

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
import type { Booking, BookingStatus } from "@/types/api";

import {
  BOOKING_STATUS_ACTIONS,
  canCancel,
  forwardStatuses,
  impliedStatuses,
} from "../statusFlow";
import { BOOKING_STATUS_LABELS } from "./BookingStatusBadge";
import { BookingHistoryDialog } from "./BookingHistoryDialog";

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
}: {
  booking: Booking;
  /** Called after a successful move so the list can re-ask the server. */
  onChanged: () => void;
}) {
  const [next, setNext] = useState<BookingStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const forward = forwardStatuses(booking.status);
  const cancellable = canCancel(booking.status);

  /** What a human calls this row. A draft has no number yet. */
  const label = booking.bookingNumber ?? "booking ini";

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
      await bookingService.changeStatus(
        booking._id,
        next,
        // Stored only on a cancellation, and only when there was something to
        // say — a mandatory field with nothing in it gets filled with "-".
        next === "cancelled" && reason.trim() !== "" ? reason.trim() : null,
      );

      setNext(null);
      setReason("");
      onChanged();
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

  const implied = next ? impliedStatuses(booking.status, next) : [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            // The icon carries no name, so the label says which row this menu
            // belongs to — twenty identical "Aksi" buttons teach a screen-reader
            // user nothing.
            aria-label={`Aksi untuk ${label}`}
          >
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          {forward.length > 0 && (
            /*
              EITHER GRANT, matching the API. `advanceStatus` is the groomer's —
              check a dog in, mark it done — and `update` is the stronger one a
              receptionist already holds. Gating on the narrow one alone would
              have hidden these items from every role that has only ever had
              `update`.
            */
            <Can feature="bookings" action={["advanceStatus", "update"]}>
              {forward.map((status) => (
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
            Riwayat status
          </DropdownMenuItem>

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

      {next && (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>{BOOKING_STATUS_ACTIONS[next]}</DialogTitle>
              <DialogDescription>
                {label}
                {booking.petName ? ` · ${booking.petName}` : ""} — statusnya
                menjadi {BOOKING_STATUS_LABELS[next]}. Perpindahan status tidak
                bisa dibatalkan.
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
    </>
  );
}
