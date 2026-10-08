"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Dog } from "lucide-react";

import { Button } from "@/components";
import { cn } from "@/lib/utils";
import type { GroomerBooking } from "@/types/groomer";
import { BookingHead } from "./BookingHead";
import { Pill } from "./Pill";
import { SessionRow } from "./SessionRow";

/**
 * One booking in the list — the animal once, its sessions as rows.
 *
 * `kind` decides what the rows offer: on Job Saya and Selesai a groomer works
 * their own sessions; on Open Job the rows nobody holds get "Ambil"; a booking
 * held entirely by others (`lain`) is drawn dashed and has no control.
 *
 * NOTES AND PHOTOS ARE NOT HERE. A card is for the quick things — arrive, start,
 * finish, take — and writing a note over a wet dog on a list is the wrong place
 * for it; "Catatan & foto" goes to the detail screen. Finishing a session with no
 * "after" photo goes there too, for the same reason.
 */
export function BookingCard({
  booking,
  kind,
  now,
  busyKey,
  onArrive,
  onStart,
  onFinish,
  onClaim,
}: {
  booking: GroomerBooking;
  kind: "saya" | "open" | "selesai" | "lain";
  now: number;
  busyKey: string | null;
  onArrive: () => void;
  onStart: (sessionId: string) => void;
  onFinish: (sessionId: string, afterCount: number) => void;
  onClaim: (sessionId: string) => void;
}) {
  const detail = `/groomer/booking/${booking.bookingId}`;
  const panelId = useId();

  /*
    FOLDED UNLESS SOMETHING IS RUNNING. A booking with three sessions is a tall
    card, and a day of them is a long scroll; the animal, the hour and a one-line
    state are what a groomer scans for. A session that is under way is the one
    thing that should never be hidden — it has the stopwatch and the finish
    button — so it opens the card by itself. It is initial state only: a card the
    groomer folds stays folded when the list reloads after an action.
  */
  const [open, setOpen] = useState(() =>
    booking.sessions.some((one) => one.mine && one.status === "in_progress"),
  );

  const total = booking.sessions.length;
  const done = booking.sessions.filter((one) => one.status === "done").length;
  const running = booking.sessions.filter(
    (one) => one.status === "in_progress",
  ).length;
  const free = booking.sessions.filter((one) => one.open).length;

  return (
    <li
      className={cn(
        "rounded-xl border p-4 shadow-sm",
        kind === "lain"
          ? "border-dashed border-border bg-background"
          : "border-border bg-surface",
      )}
    >
      <BookingHead booking={booking} showHandling={open} />

      {kind !== "lain" && booking.canMarkArrived && (
        <Button
          variant="secondary"
          fullWidth
          className="mt-3 min-h-11"
          onClick={onArrive}
          loading={busyKey === `arrive:${booking.bookingId}`}
        >
          <Dog className="size-4" aria-hidden="true" />
          Hewan sudah datang
        </Button>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
      >
        <span className="flex-1 text-sm font-semibold">
          {open ? "Sembunyikan sesi" : `Lihat sesi (${total})`}
        </span>
        {!open && (
          <span className="flex flex-wrap justify-end gap-1.5">
            {running > 0 && <Pill tone="warning">{running} berjalan</Pill>}
            {done > 0 && (
              <Pill tone="success">
                {done}/{total} selesai
              </Pill>
            )}
            {kind === "open" && free > 0 && (
              <Pill tone="info">{free} belum ada groomer</Pill>
            )}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-4 flex-none text-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      <div id={panelId} hidden={!open}>
        <ul
          className="mt-2 space-y-2"
          aria-label={`Sesi ${booking.pet.name ?? ""}`}
        >
          {booking.sessions.map((session) => (
            <SessionRow
              key={session.sessionId}
              session={session}
              now={now}
              busy={busyKey === session.sessionId}
              showClaim={kind === "open"}
              onStart={() => onStart(session.sessionId)}
              onFinish={() =>
                onFinish(session.sessionId, session.afterCount ?? 0)
              }
              onClaim={() => onClaim(session.sessionId)}
              onRecord={() => undefined}
              recordLabel="Catatan & foto"
              linkTo={detail}
            />
          ))}
        </ul>
      </div>

      {open && kind !== "lain" && (
        <Link
          href={detail}
          className="mt-3 flex min-h-11 items-center justify-center gap-1 rounded-lg text-sm font-semibold text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
        >
          Buka detail
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}
