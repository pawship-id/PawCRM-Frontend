"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft, Dog, RefreshCw } from "lucide-react";

import { Alert, Button, Spinner } from "@/components";
import { useGroomerActions } from "../hooks/useGroomerActions";
import { useGroomerBooking } from "../hooks/useGroomerBooking";
import { useNow } from "../hooks/useNow";
import { BookingHead } from "./BookingHead";
import { RecordSheet } from "./RecordSheet";
import { SessionRow } from "./SessionRow";

/**
 * One booking, in full — the animal, every session, and the notes and photos of
 * the sessions that are the groomer's.
 *
 * ─── WHY A SCREEN AND NOT A SHEET ──────────────────────────────────────────
 * A booking can have three or four sessions, each with two notes and two photo
 * rows. That does not fit in a sheet over a list, and a groomer who is mid-bath
 * wants to come back to exactly this place with the back button.
 *
 * `?foto=after&sesi=<id>` is how the list sends someone who pressed Selesaikan
 * with no "after" photo: the sheet for that session opens on its own, with the
 * reason.
 */
export function GroomerBookingScreen() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();

  const { data, loading, error, reload } = useGroomerBooking(id);
  const { busy, claim, move, arrive } = useGroomerActions(reload);

  /** The session whose sheet is open, and whether it opened to ask for the photo. */
  const [sheet, setSheet] = useState<{ sessionId: string; needAfter: boolean } | null>(() => {
    const sessionId = search.get("sesi");
    return sessionId && search.get("foto") === "after" ? { sessionId, needAfter: true } : null;
  });

  const booking = data?.booking;
  const running = Boolean(booking?.sessions.some((one) => one.mine && one.status === "in_progress"));
  const now = useNow(running);
  const sheetSession = sheet ? booking?.sessions.find((one) => one.sessionId === sheet.sessionId) : undefined;
  const petName = booking?.pet.name ?? null;

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-3">
      <Link
        href="/groomer"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Kembali
      </Link>

      {loading && !data && (
        <div className="flex justify-center py-16 text-primary">
          <Spinner size={28} />
        </div>
      )}

      {error && (
        <div className="mt-3 space-y-3">
          <Alert variant="error">
            {error.status === 404 ? "Booking ini tidak ada di daftarmu." : error.message}
          </Alert>
          {error.status !== 404 && (
            <Button variant="secondary" className="min-h-11" onClick={() => void reload()}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Muat ulang
            </Button>
          )}
        </div>
      )}

      {booking && (
        <div className="mt-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <BookingHead booking={booking} />

          {booking.canMarkArrived && (
            <Button
              variant="secondary"
              fullWidth
              className="mt-3 min-h-11"
              onClick={() => void arrive(booking.bookingId, petName)}
              loading={busy === `arrive:${booking.bookingId}`}
            >
              <Dog className="size-4" aria-hidden="true" />
              Hewan sudah datang
            </Button>
          )}

          <h2 className="mb-2 mt-5 text-sm font-semibold text-muted">Sesi</h2>
          <ul className="space-y-2">
            {booking.sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                now={now}
                busy={busy === session.sessionId}
                showClaim
                onStart={() =>
                  void move(booking.bookingId, session.sessionId, "in_progress", `${petName ?? "Sesi"} dimulai`)
                }
                onFinish={() => {
                  if ((session.afterCount ?? 0) === 0) {
                    setSheet({ sessionId: session.sessionId, needAfter: true });
                    return;
                  }
                  void move(booking.bookingId, session.sessionId, "done", `${petName ?? "Sesi"} selesai`);
                }}
                onClaim={() => void claim(booking.bookingId, session.sessionId, petName)}
                onRecord={() => setSheet({ sessionId: session.sessionId, needAfter: false })}
                recordLabel={session.notesSession || (session.media?.length ?? 0) > 0 ? "Lihat catatan & foto" : "Catatan & foto"}
              />
            ))}
          </ul>
        </div>
      )}

      {booking && sheet && sheetSession?.mine && (
        <RecordSheet
          key={sheetSession.sessionId}
          booking={booking}
          session={sheetSession}
          needAfter={sheet.needAfter}
          onClose={() => setSheet(null)}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}
