"use client";

import { useState } from "react";

import { Alert } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking } from "@/types/api";

import { formatBookingMoment } from "../format";

/**
 * MOVING AN APPOINTMENT TO ANOTHER TIME.
 *
 * ─── WHY IT IS NOT THE EDIT FORM ──────────────────────────────────────────
 *
 * The edit form can change `scheduledAt` and will go on doing so — that is
 * correcting a typo made while writing the booking down. This is the other
 * thing: the customer rang and cannot come on Thursday. Only one of the two
 * belongs in the trail, and a shop asking "how often do we get moved" cannot
 * answer it from a field that was overwritten.
 *
 * It is also far cheaper. Saving the edit form RE-PRICES every unbilled row at
 * today's catalogue price, because changing what is being done is a new quote —
 * so moving a date through it would quietly reprice a visit nobody meant to.
 *
 * ─── THE BOOKING COMES BACK `confirmed` ───────────────────────────────────
 *
 * `rescheduled` is written to the history, not stored as a status: agreeing a
 * new time IS a confirmation, and a booking parked in a status of its own is one
 * somebody has to remember to un-park.
 *
 * ─── TWO FIELDS, NOT ONE `datetime-local` ─────────────────────────────────
 *
 * The same split the booking form uses, and for the same reason: a date and a
 * time are two decisions ("can they come Friday" then "what time"), and the
 * native combined control is a different widget in every browser.
 */
export function BookingRescheduleDialog({
  booking,
  open,
  onOpenChange,
  onChanged,
}: {
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const current = new Date(booking.scheduledAt);

  const [date, setDate] = useState(() => dateValue(current));
  const [time, setTime] = useState(() => timeValue(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    THE OVERRIDE IS OFFERED ONLY AFTER A CLASH, never up front. A checkbox that
    is always there is one people tick out of habit, and the diary check is the
    thing standing between a groomer and two dogs at ten.
  */
  const [clash, setClash] = useState<string | null>(null);

  async function submit(force: boolean) {
    if (busy) return;

    /*
      BUILT IN THE SHOP'S OWN CLOCK. `new Date("2026-09-05T14:00")` with no zone
      is local time, which is what somebody typing into these two boxes means;
      appending a Z would move every booking by the timezone offset.
    */
    const at = new Date(`${date}T${time}`);

    if (Number.isNaN(at.getTime())) {
      setError("Tanggal atau jamnya belum lengkap.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await bookingService.reschedule(booking._id, {
        scheduledAt: at.toISOString(),
        ...(force ? { forceClash: true } : {}),
      });

      onOpenChange(false);
      onChanged();
      swalToast(
        `${booking.bookingNumber ?? "Booking"} dipindah ke ${formatBookingMoment(at.toISOString())}.`,
      );
    } catch (caught) {
      const reason =
        caught instanceof ApiError
          ? (caught.reason ?? caught.message)
          : "Tidak bisa dijadwalkan ulang. Coba lagi.";

      /*
        A CLASH IS A 400 NAMING THE GROOMER — the same shape the booking form
        gets. It is the one failure with a second thing to offer, so it is kept
        apart from the errors that only have "try again" behind them.
      */
      if (caught instanceof ApiError && caught.status === 400 && !force) {
        setClash(reason);
      } else {
        setError(reason);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jadwalkan ulang</DialogTitle>
          <DialogDescription>
            {booking.bookingNumber ?? "Booking ini"} · sekarang{" "}
            {formatBookingMoment(booking.scheduledAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          {clash && (
            <Alert variant="warning">
              {clash}
              {/*
                IT SAYS WHAT THE OVERRIDE COSTS. "Simpan saja" with no sentence
                behind it is a button people press to make a warning go away.
              */}
              <span className="mt-1 block text-xs">
                Kalau tetap dilanjutkan, groomer itu akan punya dua pekerjaan di
                jam yang sama.
              </span>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reschedule-date">Tanggal baru</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={date}
                disabled={busy}
                onChange={(event) => {
                  setDate(event.target.value);
                  setClash(null);
                }}
                className="mt-1 h-11"
              />
            </div>

            <div>
              <Label htmlFor="reschedule-time">Jam baru</Label>
              <Input
                id="reschedule-time"
                type="time"
                value={time}
                disabled={busy}
                onChange={(event) => {
                  setTime(event.target.value);
                  setClash(null);
                }}
                className="mt-1 h-11"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit(Boolean(clash))}>
            {busy
              ? "Menyimpan…"
              : clash
                ? "Tetap pindahkan"
                : "Pindahkan jadwal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `YYYY-MM-DD` IN THE BROWSER'S OWN ZONE — which is the shop's.
 *
 * `toISOString().slice(0, 10)` is what the rest of this codebase writes and it is
 * wrong here specifically: west of UTC+7 the UTC date is still yesterday until
 * seven in the morning, so a booking at opening time would prefill the wrong day.
 */
function dateValue(at: Date): string {
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");

  return `${at.getFullYear()}-${month}-${day}`;
}

function timeValue(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}
