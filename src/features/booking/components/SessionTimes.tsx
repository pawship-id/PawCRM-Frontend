"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingSession } from "@/types/api";

/** "09.05" from an instant, in the shop's own clock — never through UTC. */
function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}

/** "09:05" — what `<input type="time">` reads and writes. */
function inputValue(iso: string | null | undefined): string {
  return clock(iso).replace(".", ":");
}

/**
 * The instant `hh:mm` names ON THE DAY of `anchor`, in the shop's clock.
 * Only the hour and minute are corrected here; the day stays the turn's own.
 */
function onDayOf(anchor: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const at = new Date(anchor);
  at.setHours(h, m, 0, 0);
  return at.toISOString();
}

/**
 * MULAI · SELESAI · AKTUAL for one turn — read, and correctable.
 *
 * ─── THE CLOCK IS STAMPED BY THE ACT, AND CORRECTED BY HAND ────────────────
 *
 * Pressing "Mulai"/"Selesai" still stamps the times server-side; this only
 * fixes a stamp after the fact — the groomer who forgot to press Mulai until
 * halfway through the bath (BO, 15 November 2026). `PATCH .../times`, audited
 * with both values.
 *
 * ─── `bookings:update`, NOT `advanceStatus` ────────────────────────────────
 *
 * Somebody trusted to say "this is done" is not, by that fact, trusted to say
 * it took three hours — the same gate the server puts on the route.
 *
 * ─── ONLY A STAMP THAT EXISTS CAN BE CORRECTED ─────────────────────────────
 *
 * A turn not yet started offers nothing (typing a start would leave it
 * "Belum mulai" with a clock running), and Selesai is offered only once the
 * turn is done. Only the hour and minute change; the day is the stamp's own.
 */
export function SessionTimes({
  bookingId,
  session,
  locked,
  onChanged,
  children,
}: {
  bookingId: string;
  session: BookingSession;
  /** The booking is cancelled — nothing left to correct. */
  locked?: boolean;
  onChanged: (booking: Booking) => void;
  /** Further fields on the same row (Aktual). */
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  const [saving, setSaving] = useState(false);

  const startedAt = session.startedAt ?? null;
  const finishedAt = session.finishedAt ?? null;
  const correctable = Boolean(startedAt) && !locked;

  function open() {
    setStart(inputValue(startedAt));
    setFinish(inputValue(finishedAt));
    setEditing(true);
  }

  async function save() {
    if (!startedAt || saving) return;

    const times: { startedAt?: string; finishedAt?: string } = {};
    if (start && start !== inputValue(startedAt)) {
      times.startedAt = onDayOf(startedAt, start);
    }
    if (finishedAt && finish && finish !== inputValue(finishedAt)) {
      times.finishedAt = onDayOf(finishedAt, finish);
    }

    if (Object.keys(times).length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      onChanged(
        await bookingService.correctSessionTimes(
          bookingId,
          session.sessionId,
          times,
        ),
      );
      setEditing(false);
      try {
        swalToast("Jam sesi diperbarui.");
      } catch {
        /* The page already shows it. */
      }
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? err.fullMessage
          : "Jam sesi belum tersimpan. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            Mulai
          </span>
          <Input
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="w-32 tabular-nums"
            required
          />
        </label>
        {finishedAt && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Selesai
            </span>
            <Input
              type="time"
              value={finish}
              onChange={(event) => setFinish(event.target.value)}
              className="w-32 tabular-nums"
              required
            />
          </label>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Batal
          </Button>
          <Button
            size="sm"
            disabled={saving || !start || (Boolean(finishedAt) && !finish)}
            onClick={() => void save()}
          >
            {saving ? "Menyimpan…" : "Simpan jam"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <Field label="Mulai" value={clock(startedAt) || "—"} />
        <Field label="Selesai" value={clock(finishedAt) || "—"} />
        {children}
      </dl>
      {correctable && (
        <Can feature="bookings" action="update">
          <Button size="sm" variant="ghost" onClick={open}>
            <Pencil className="size-4" aria-hidden />
            Ubah jam
          </Button>
        </Can>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
