"use client";

import { useState } from "react";
import { Plus, UserRound, X } from "lucide-react";

import { Alert, SelectField } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingPetService } from "@/types/api";

/** Mirrors MAX_SESSIONS_PER_SERVICE in bookingItem.model.js. */
const MAX_SESSIONS = 6;

/** The sentinel the selects use for "nobody yet" — Radix refuses an empty value. */
const UNASSIGNED = "belum-ditentukan";

/**
 * WHO IS ON THIS SERVICE, ONE ROW PER TURN — PCR-042.
 *
 * ─── WHAT THIS REPLACED, AND WHY IT WAS WRONG ──────────────────────────────
 *
 * It used to show a LEAD and a list of ASSISTANTS, with a hint saying out loud
 * that the assistants were "counted busy but not paid". That was not a product
 * decision — it was a database constraint leaking onto a screen:
 * `commissionrecords` is unique per `bookingItemId`, so a second earner on one
 * service was refused by the database and swallowed as success. The helper had
 * to be filed as unpaid because there was nowhere to pay them from.
 *
 * SESSIONS REMOVE THE CONSTRAINT. A turn is its own payable row, so two people
 * on one bath are two turns and both earn. "Tambah groomer" now adds a SESSION,
 * and the hint that had to apologise for the old shape is gone.
 *
 * ─── A TURN WITH NOBODY ON IT IS A REAL STATE ──────────────────────────────
 *
 * "Belum ditentukan" is what a booking made before the roster is decided looks
 * like. Such a turn earns nothing and blocks nobody's day, and the work screen
 * refuses to start it — the server does too, so this never has to guess.
 */
export function SessionGroomers({
  bookingId,
  service,
  groomers,
  onChanged,
}: {
  bookingId: string;
  /** The service whose turns these are — `sessions[]` is what is edited here. */
  service: BookingPetService;
  /** Who may be booked that day — `disabled` carries the reason (FR-4). */
  groomers: { value: string; label: string; disabled?: boolean }[];
  onChanged: (booking: Booking) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const sessions = service.sessions;

  /*
    NOBODY ALREADY ON THIS SERVICE IS OFFERED FOR A NEW TURN. One person doing
    two turns of one bath is a data-entry slip, not a way of working — and it
    would earn them two commissions for one stretch of work.
  */
  const taken = new Set(sessions.map((one) => one.groomerUserId));
  const free = groomers.filter((option) => !taken.has(option.value));

  async function save(
    key: string,
    patch: Parameters<typeof bookingService.setSessionCrew>[1],
  ) {
    setBusy(key);
    setError(null);

    try {
      onChanged(await bookingService.setSessionCrew(bookingId, patch));
      setAdding(false);
    } catch (err) {
      /*
        A 409 IS A CLASH, and it is reported rather than forced. The booking form
        offers "save anyway" because it is making the appointment; moving one
        turn onto somebody who is already busy is a smaller act with a bigger
        chance of being a mistake, so this one says no and leaves the choice of
        who to the person reading it.
      */
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Tidak bisa disimpan. Coba lagi.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert variant="error">{error}</Alert>}

      <Can
        feature="bookings"
        action="update"
        fallback={
          <p className="text-sm text-muted">
            <UserRound className="mr-1 inline size-4" aria-hidden />
            {sessions.length === 0
              ? "Belum ada sesi"
              : sessions.map((one) => one.groomerName).join(", ")}
          </p>
        }
      >
        {sessions.length === 0 && (
          <p className="text-sm text-muted">
            Belum ada sesi — tambahkan satu untuk menugaskan groomer.
          </p>
        )}

        {sessions.map((one, position) => (
          <div key={one.sessionId} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelectField
                label={
                  sessions.length > 1
                    ? `Sesi ${position + 1} — ${one.type}`
                    : "Groomer"
                }
                value={one.groomerUserId ?? UNASSIGNED}
                onChange={(value) =>
                  void save(one.sessionId, {
                    sessionId: one.sessionId,
                    groomerUserId: value === UNASSIGNED ? null : value,
                  })
                }
                options={[
                  { value: UNASSIGNED, label: "Belum ditentukan" },
                  /* Whoever is on THIS turn stays selectable, or the select
                     would have no option matching its own value. */
                  ...groomers.filter(
                    (option) =>
                      !taken.has(option.value) ||
                      option.value === one.groomerUserId,
                  ),
                ]}
                disabled={busy !== null}
                hint={
                  position === 0 && sessions.length === 1
                    ? "Setiap sesi dihitung komisinya sendiri."
                    : undefined
                }
              />
            </div>

            {/*
              A TURN CAN BE TAKEN OFF, unless it has already earned — the server
              refuses that one, because a payroll line whose work cannot be found
              is a payment nobody can defend.
            */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Hapus sesi ${one.type}`}
              disabled={busy !== null}
              onClick={() =>
                void save(one.sessionId, {
                  sessionId: one.sessionId,
                  remove: true,
                })
              }
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ))}

        {adding ? (
          <SelectField
            label="Sesi baru"
            value=""
            onChange={(value) =>
              void save("add", {
                serviceItemId: service.itemId,
                groomerUserId: value,
              })
            }
            options={free}
            placeholder="Pilih orangnya…"
            disabled={busy !== null}
            hint="Sesi kedua untuk layanan ini — ikut dihitung komisinya."
          />
        ) : (
          sessions.length < MAX_SESSIONS &&
          free.length > 0 && (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => setAdding(true)}
              >
                <Plus className="size-4" aria-hidden />
                {sessions.length === 0 ? "Tambah sesi" : "Tambah groomer"}
              </Button>
            </div>
          )
        )}
      </Can>
    </div>
  );
}
