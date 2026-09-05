"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Booking } from "@/types/api";

import { bookingActorLabel, formatBookingMoment } from "../format";
import { BookingStatusBadge } from "./BookingStatusBadge";

/**
 * When this booking reached each status, and who took it there.
 *
 * WHY IT EXISTS: `status` says where a booking stands and nothing about how it
 * got there, and `updatedAt` answers only the last move — the next one
 * overwrites it. The questions asked afterwards are "jam berapa hewannya
 * datang", "sudah dikonfirmasi sebelum datang atau langsung check-in", and
 * "siapa yang membatalkan", and none of them survive without the trail.
 *
 * OLDEST FIRST, the order the server stores it in and the order the day
 * happened in. Newest-first is right for a list of documents and wrong for one
 * document's life, which is read as a story.
 */
export function BookingHistoryDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const history = booking.statusHistory ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          {/*
            THE SAME WORDS AS THE MENU ROW THAT OPENS IT. A row reading "Status
            history" that opens a dialog titled "Riwayat status" is the
            translation step the English exception exists to remove — the title
            NAMES the thing, and names follow the status vocabulary (ui-rules
            §12). What is inside it stays Bahasa: the empty state, "Sistem",
            "otomatis" and Tutup are sentences.
          */}
          <DialogTitle>Status history</DialogTitle>
          <DialogDescription>
            {booking.bookingNumber ?? "Booking ini"}
            {booking.petName ? ` · ${booking.petName}` : ""}
          </DialogDescription>
        </DialogHeader>

        {history.length === 0 ? (
          /*
            NOT "never moved". Bookings made before the trail existed carry an
            empty one, and inventing an instant for them would be worse than
            saying nothing — so the empty state says which of the two it is.
          */
          <p className="py-8 text-sm text-muted">
            Perpindahan status booking ini tidak tercatat. Riwayat baru dicatat
            untuk perubahan sejak fitur ini ada.
          </p>
        ) : (
          <ol className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {history.map((event, index) => (
              <li
                // Position, not status: the key has to survive a trail that
                // somehow holds the same status twice rather than throwing.
                key={`${event.status}-${index}`}
                className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <BookingStatusBadge status={event.status} />
                  <span className="text-sm text-muted">
                    {/*
                      WHO, WITH THEIR ROLE — "Fitria (ops)". A trail is read by
                      somebody who was not there, and a bare name assumes they
                      know who Fitria is. "Sistem" when nothing human did it: a
                      booking settled by a paid sale moves without anybody
                      choosing to, and a blank reads as a field that failed.

                      Shared with the work page's timeline card, because two
                      formatters for one label would drift.
                    */}
                    {bookingActorLabel(event.byName, event.byRoleName)}
                    {event.implied && (
                      /*
                        Two entries stamped at the same second would otherwise
                        claim two separate decisions. This says which one
                        somebody actually made — the other came with it.
                      */
                      <span className="text-muted"> · otomatis</span>
                    )}
                  </span>
                </span>

                <span className="shrink-0 text-sm tabular-nums text-foreground">
                  {formatBookingMoment(event.at)}
                </span>
              </li>
            ))}
          </ol>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
