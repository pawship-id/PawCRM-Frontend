"use client";

import { useState } from "react";
import { Plus, UserRound, X } from "lucide-react";

import { Alert, SelectField } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingItem } from "@/types/api";

/** Mirrors MAX_ASSISTANT_GROOMERS in bookingItem.model.js. */
const MAX_ASSISTANTS = 4;

/** The sentinel the selects use for "nobody yet" — Radix refuses an empty value. */
const UNASSIGNED = "belum-ditentukan";

/**
 * WHO IS ON ONE SESSION — the lead, and any extra hands.
 *
 * ─── WHY IT IS HERE AND NOT ON THE BOOKING FORM ────────────────────────────
 *
 * The form asks for ONE groomer per animal, as a default written onto every one
 * of that animal's sessions: at booking time a shop says "Sinta is doing Bruno
 * today", not one name per line. This is the other half — the day is running,
 * the bath turned out to need two people, and the person who knows that is
 * standing at the table rather than at the phone.
 *
 * ─── THE LEAD IS THE ONE WHO EARNS, AND THAT IS SAID OUT LOUD ──────────────
 *
 * Commission is computed for `groomerUserId` and nothing else. Somebody added
 * here is a scheduling fact: they are counted busy by the clash check, and they
 * are not paid for it. A screen that let people add "groomers" without saying so
 * would be quietly deciding how a shop splits money.
 */
export function SessionGroomers({
  bookingId,
  row,
  groomers,
  onChanged,
}: {
  bookingId: string;
  row: BookingItem;
  /** Who may be booked that day — `disabled` carries the reason (FR-4). */
  groomers: { value: string; label: string; disabled?: boolean }[];
  onChanged: (booking: Booking) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const assistants = row.assistantGroomers ?? [];
  const taken = new Set([
    row.groomerUserId,
    ...assistants.map((one) => one._id),
  ]);

  /* Nobody already on this session is offered again. */
  const free = groomers.filter((option) => !taken.has(option.value));

  async function save(patch: {
    groomerUserId?: string | null;
    assistantGroomerUserIds?: string[];
  }) {
    setBusy(true);
    setError(null);

    try {
      onChanged(await bookingService.setItemGroomers(bookingId, row._id, patch));
      setAdding(false);
    } catch (err) {
      /*
        A 409 IS A CLASH, and it is reported rather than forced. The booking form
        offers "save anyway" because it is making the appointment; moving one
        session onto somebody who is already busy is a smaller act with a bigger
        chance of being a mistake, so this one says no and leaves the choice of
        who to the person reading it.
      */
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Tidak bisa disimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
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
            {row.groomerName}
            {assistants.length > 0 &&
              ` + ${assistants.map((one) => one.name).join(", ")}`}
          </p>
        }
      >
        <SelectField
          label="Groomer utama"
          value={row.groomerUserId ?? UNASSIGNED}
          onChange={(value) =>
            void save({ groomerUserId: value === UNASSIGNED ? null : value })
          }
          options={[
            { value: UNASSIGNED, label: "Belum ditentukan" },
            ...groomers,
          ]}
          disabled={busy}
          hint="Yang dihitung komisinya. Groomer tambahan di bawah tidak."
        />

        {assistants.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {assistants.map((one) => (
              <li
                key={one._id}
                className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm"
              >
                {one.name}
                <button
                  type="button"
                  aria-label={`Hapus ${one.name} dari sesi ini`}
                  className="rounded-full p-0.5 text-muted transition hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  disabled={busy}
                  onClick={() =>
                    void save({
                      assistantGroomerUserIds: assistants
                        .filter((other) => other._id !== one._id)
                        .map((other) => other._id),
                    })
                  }
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <SelectField
            label="Groomer tambahan"
            value=""
            onChange={(value) =>
              void save({
                assistantGroomerUserIds: [
                  ...assistants.map((one) => one._id),
                  value,
                ],
              })
            }
            options={free}
            placeholder="Pilih orangnya…"
            disabled={busy}
            hint="Ikut dihitung sibuk saat cek bentrok, tapi tidak dapat komisi."
          />
        ) : (
          /*
            ONLY WHEN THERE IS A LEAD. An assistant with nobody responsible is a
            row the work screen could never start — `advanceItemWork` refuses to
            move a session with no `groomerUserId` — so it would look staffed and
            behave unstaffed. The server refuses it too; this keeps anybody from
            reaching that refusal.
          */
          row.groomerUserId &&
          assistants.length < MAX_ASSISTANTS &&
          free.length > 0 && (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setAdding(true)}
              >
                <Plus className="size-4" aria-hidden />
                Tambah groomer
              </Button>
            </div>
          )
        )}
      </Can>
    </div>
  );
}
