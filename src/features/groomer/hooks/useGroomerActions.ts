"use client";

import { useCallback, useState } from "react";

import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { BookingWorkStatus } from "@/types/api";

/**
 * The four things a groomer does, shared by the list and the detail screen.
 *
 * EVERY ACTION RELOADS the screen it ran from rather than patching it locally.
 * Taking a job, starting one and marking the dog arrived each move something on
 * the server (the visit's status, the open list, the clock) that the phone cannot
 * work out by itself, and a screen that guessed would show a job as taken that
 * somebody else had just taken.
 *
 * A REFUSAL IS A TOAST, in the server's own words ("Job ini sudah dipegang
 * groomer lain") — they were written to be read on a phone — and the screen is
 * reloaded after it too, because a refusal usually means it was stale.
 *
 * `busy` is a KEY, not a flag: a session id for a session action, `arrive:<id>`
 * for the dog, so only the control that was pressed shows a spinner.
 */
export function useGroomerActions(reload: () => Promise<void> | void) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = useCallback(
    async (key: string, run: () => Promise<unknown>, success: string) => {
      setBusy(key);
      try {
        await run();
        swalToast(success);
      } catch (caught) {
        swalToast(
          caught instanceof ApiError ? caught.message : "Tidak berhasil. Coba lagi.",
          "error",
          5000,
        );
      } finally {
        await reload();
        setBusy(null);
      }
    },
    [reload],
  );

  const claim = useCallback(
    (bookingId: string, sessionId: string, petName: string | null) =>
      act(
        sessionId,
        () => bookingService.claimSession(bookingId, sessionId),
        `Sesi ${petName ?? ""} diambil`.replace("  ", " "),
      ),
    [act],
  );

  const move = useCallback(
    (bookingId: string, sessionId: string, to: BookingWorkStatus, success: string) =>
      act(sessionId, () => bookingService.advanceSessionWork(bookingId, sessionId, to), success),
    [act],
  );

  const arrive = useCallback(
    (bookingId: string, petName: string | null) =>
      act(
        `arrive:${bookingId}`,
        () => bookingService.changeStatus(bookingId, "arrived"),
        `${petName ?? "Hewan"} ditandai sudah datang`,
      ),
    [act],
  );

  return { busy, claim, move, arrive };
}
