"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canStartWork, hasCompletedWork } from "@/features/booking";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type {
  Booking,
  BookingSession,
  BookingWorkStatus,
  GroomerAvailability,
} from "@/types/api";

import { isoDate, type GroomingRow } from "../board";

/** Mirrors MAX_GROOMERS_PER_SESSION in booking.model.js. */
const MAX_GROOMERS = 4;

const WORK: Record<BookingWorkStatus, { label: string; className: string }> = {
  pending: { label: "Belum mulai", className: "bg-tint-neutral text-muted" },
  in_progress: {
    label: "Sedang dikerjakan",
    className: "bg-tint-warning text-warning",
  },
  done: { label: "Selesai", className: "bg-tint-success text-success" },
};

/** The move offered next, and nothing else — see BookingDetailScreen. */
const NEXT: Partial<
  Record<BookingWorkStatus, { to: BookingWorkStatus; label: string }>
> = {
  pending: { to: "in_progress", label: "Mulai" },
  in_progress: { to: "done", label: "Selesai" },
};

/**
 * One booking's grooming turns, inside its opened row on the board.
 *
 * ─── ON THE ROW, BY DECISION ───────────────────────────────────────────────
 *
 * The mockup puts Mulai / Selesai / Ganti PIC here, and on 13 September 2026 the
 * shop chose that over the list-reads-only rule `BookingsTable` follows. That
 * rule still holds on `/dashboard/booking`; this board is the day sheet at the
 * table, and the person reading it is the one with the dog.
 *
 * ─── WHAT IS STILL NOT HERE ────────────────────────────────────────────────
 *
 * "Buka lagi". The mockup has it and the server allows `done → in_progress`,
 * but the shop took it off the work page — a button that undoes "Selesai" beside
 * the one that presses it gets used as a toggle. The board follows the shop.
 *
 * The same two gates as the work page: a turn moves only once the BOOKING is
 * In Progress, and a turn nobody is on cannot start.
 */
export function GroomingSessionSteps({
  row,
  onChanged,
}: {
  row: GroomingRow;
  onChanged: (booking: Booking) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { booking } = row;

  const startable = canStartWork(booking);
  /* Re-crewing touches money once the work is completed — statusFlow. */
  const settled = hasCompletedWork(booking);
  const running = row.sessions.find(
    (session) => session.status === "in_progress",
  );

  async function move(session: BookingSession, to: BookingWorkStatus) {
    setBusy(session.sessionId);

    try {
      const updated = await bookingService.advanceSessionWork(
        booking._id,
        session.sessionId,
        to,
      );
      onChanged(updated);

      try {
        swalToast(`${session.sessionName}: ${WORK[to].label.toLowerCase()}.`);
      } catch {
        /* The row already shows it. */
      }
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? error.fullMessage
          : "Tahapan tidak bisa diubah. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Tahapan" className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-foreground">
        Tahapan
        {running && (
          <span className="font-normal text-muted">
            {" "}
            · sedang berjalan: {running.sessionName}
          </span>
        )}
      </h3>

      {row.sessions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted">
          Belum ada tahapan. Tahapan dan groomernya diatur di halaman detail
          booking ini.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {row.sessions.map((session) => {
            const next = NEXT[session.status];
            const unassigned = session.groomers.length === 0;

            return (
              <li
                key={session.sessionId}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border bg-surface px-3 py-2",
                  session.status === "in_progress"
                    ? "border-secondary"
                    : "border-border",
                )}
              >
                <Badge
                  variant="outline"
                  className={cn("border-transparent", WORK[session.status].className)}
                >
                  {WORK[session.status].label}
                </Badge>

                <div className="min-w-[8rem] flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {session.sessionName}
                  </p>
                  <p className="text-xs text-muted">
                    {unassigned
                      ? "Belum ada groomer"
                      : session.groomers
                          .map((who) =>
                            who.offReason
                              ? `${who.name} (${who.offReason.toLowerCase()})`
                              : who.name,
                          )
                          .join(", ")}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Can feature="bookings" action={["advanceStatus", "update"]}>
                    {next && (
                      <Button
                        size="sm"
                        disabled={
                          busy !== null ||
                          !startable ||
                          (session.status === "pending" && unassigned)
                        }
                        onClick={() => void move(session, next.to)}
                      >
                        {busy === session.sessionId ? "Menyimpan…" : next.label}
                      </Button>
                    )}
                  </Can>

                  {session.status !== "done" && !settled && (
                    <Can feature="bookings" action="update">
                      <CrewPicker
                        booking={booking}
                        session={session}
                        onChanged={onChanged}
                      />
                    </Can>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {row.sessions.length > 0 &&
        !startable &&
        booking.status !== "cancelled" &&
        !settled && (
          <p className="text-xs text-muted">
            Tahapan baru bisa dimulai kalau status booking-nya sudah In Progress
            — ubah lewat kolom Status.
          </p>
        )}
    </section>
  );
}

/**
 * "Ganti PIC" — who is on one turn.
 *
 * THE CREW IS SENT WHOLESALE on every tick (`setSessionCrew`), never as a delta,
 * so a swap cannot leave a running turn with nobody on it for a moment.
 *
 * THE ROSTER IS READ FOR THE BOOKING'S OWN DAY, when the menu opens: who is off
 * on the 20th is not the same answer as who is off today.
 */
function CrewPicker({
  booking,
  session,
  onChanged,
}: {
  booking: Booking;
  session: BookingSession;
  onChanged: (booking: Booking) => void;
}) {
  const [groomers, setGroomers] = useState<GroomerAvailability[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const crew = session.groomers.map((who) => who._id);

  function load(open: boolean) {
    if (!open || groomers !== null) return;

    setFailed(false);
    bookingService
      .availability(isoDate(new Date(booking.scheduledAt)))
      .then(setGroomers)
      .catch(() => setFailed(true));
  }

  async function toggle(groomerId: string, on: boolean) {
    setBusy(true);

    try {
      onChanged(
        await bookingService.setSessionCrew(booking._id, {
          sessionId: session.sessionId,
          groomerUserIds: on
            ? [...crew, groomerId]
            : crew.filter((id) => id !== groomerId),
        }),
      );
    } catch (error) {
      /* A 409 is a clash; it is reported, never forced — see SessionCrew. */
      swalToast(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Groomer tidak bisa disimpan. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={load}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          aria-label={`Ganti PIC ${session.sessionName}`}
        >
          <UserRound className="size-4" aria-hidden />
          Ganti PIC
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Groomer {session.sessionName}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {failed ? (
          <p className="px-2 py-1.5 text-sm font-semibold text-danger">
            Daftar groomer tidak bisa dimuat.
          </p>
        ) : groomers === null ? (
          <p className="px-2 py-1.5 text-sm text-muted">Memuat…</p>
        ) : groomers.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted">
            Belum ada staf yang ditandai Groomer.
          </p>
        ) : (
          groomers.map((groomer) => {
            const checked = crew.includes(groomer._id);

            return (
              <DropdownMenuCheckboxItem
                key={groomer._id}
                checked={checked}
                disabled={
                  busy ||
                  (!checked &&
                    (groomer.offReason !== null || crew.length >= MAX_GROOMERS))
                }
                // Stays open, so two people can be put on one turn in one visit.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(on) => void toggle(groomer._id, on === true)}
              >
                <span className="flex flex-col">
                  <span>{groomer.fullName}</span>
                  {groomer.offReason && (
                    <span className="text-xs text-muted">{groomer.offReason}</span>
                  )}
                </span>
              </DropdownMenuCheckboxItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
