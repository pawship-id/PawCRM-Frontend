import { Card } from "@/components";
import type { Booking } from "@/types/api";

import { bookingActorLabel } from "../format";
import { BOOKING_STATUS_LABELS } from "./BookingStatusBadge";

/**
 * WHAT HAS HAPPENED TO THIS BOOKING, newest first.
 *
 * ─── A TIMELINE, NOT A LIST ────────────────────────────────────────────────
 *
 * The dots and the line down the left say "these are one sequence" without a
 * word. It replaced a flat list of `Status → in_progress` lines that read as
 * four unrelated facts and printed the API's own values at a shop.
 *
 * ─── NEWEST FIRST, AND THE DIALOG IS OLDEST FIRST ──────────────────────────
 *
 * Deliberately opposite, because the two answer different questions. This card
 * sits open beside the work all day and is glanced at for "what just happened";
 * `BookingHistoryDialog` is opened on purpose to read the visit as a story, and
 * a story starts at the beginning.
 *
 * ─── THE CURRENT ENTRY IS MARKED IN NAVY, NOT ORANGE ───────────────────────
 *
 * The reference draws it orange. ui-rules §4 spends orange on one meaning — a
 * human must act — and on this page it is already spent: the status badge is
 * orange while an animal is on the table. Two orange things at once means one of
 * them is wrong, and "this is the most recent line" is not a call to action.
 *
 * ─── `Booking dibuat` IS SYNTHESISED, AND IS NOT A STATUS ──────────────────
 *
 * It comes from `createdAt` / `createdByName`, not from `statusHistory`, which
 * only records MOVES. Without it the trail begins at "Dikonfirmasi" and reads as
 * though the booking sprang into existence already confirmed. It is real
 * recorded data, not an invention — and it is why a booking whose trail predates
 * the feature still has one honest line instead of an empty card.
 */
export function BookingHistoryCard({ booking }: { booking: Booking }) {
  const entries = [
    ...[...(booking.statusHistory ?? [])].reverse().map((event) => ({
      key: `${event.status}-${event.at}`,
      title: `Status → ${BOOKING_STATUS_LABELS[event.status] ?? event.status}`,
      at: event.at,
      who: bookingActorLabel(event.byName, event.byRoleName),
      /*
        THE HONEST HALF OF A SKIPPED STEP. A receptionist taking an animal
        straight to check-in has confirmed the appointment by doing so, and the
        server records both at the same instant. Unlabelled, the two entries
        claim two separate decisions were taken in the same second.
      */
      implied: event.implied,
    })),
    {
      key: "created",
      title: "Booking dibuat",
      at: booking.createdAt,
      who: bookingActorLabel(booking.createdByName, booking.createdByRoleName),
      implied: false,
    },
  ];

  return (
    <Card
      title="Riwayat"
      /*
        THE COUNT SITS OPPOSITE THE TITLE, as in the reference — `description`
        would stack it underneath and push the first entry down a line.
      */
      action={
        <span className="text-sm text-muted">{entries.length} aktivitas</span>
      }
    >
      <ol className="flex flex-col">
        {entries.map((entry, index) => (
          <li key={entry.key} className="flex gap-3">
            {/*
              THE RAIL: a dot per entry and a line joining them. The line is on
              the SPACER under the dot rather than a border on the row, so it
              stops at the last entry instead of trailing into the card's padding.
            */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  index === 0 ? "border-primary" : "border-border"
                }`}
                aria-hidden
              >
                {index === 0 && (
                  <span className="size-1.5 rounded-full bg-primary" />
                )}
              </span>
              {/*
                `my-1` KEEPS THE LINE OFF THE DOTS. Running it flush into them
                turns the rail into one unbroken stroke, and the dots stop
                reading as separate moments on it.
              */}
              {index < entries.length - 1 && (
                <span className="my-1 w-0.5 flex-1 bg-border" aria-hidden />
              )}
            </div>

            {/*
              THE GAP BETWEEN ENTRIES, DRIVEN BY THE INDEX.

              This was `pb-4 last:pb-0`, which collapsed every gap to nothing:
              the content div is the only sibling of the rail, so it is ALWAYS
              its `<li>`'s last child and `last:pb-0` matched on every entry. The
              intent — no trailing gap after the final line — is about the last
              ENTRY, which is a fact about the list and not about the DOM.
            */}
            <div
              className={`min-w-0 ${index === entries.length - 1 ? "" : "pb-6"}`}
            >
              <p className="text-sm font-bold text-foreground">
                {entry.title}
                {entry.implied && (
                  <span className="font-normal text-muted"> · otomatis</span>
                )}
              </p>
              {/*
                `tabular-nums`, NOT `font-mono` — ui-rules §5: there are two
                typefaces in this product and mono is not one of them. Inter's
                tabular figures do the column-alignment job the reference's
                monospace was there for.
              */}
              <p className="mt-1 text-xs tabular-nums text-muted">
                {moment(entry.at)} · {entry.who}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * "3 Sep 10.20" — the day and the clock, no year.
 *
 * NOT `formatBookingMoment`, which carries the year: every entry in this card
 * belongs to one visit, so the year is the same on all of them and repeating it
 * five times crowds out the part that differs.
 */
function moment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";

  return at.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
