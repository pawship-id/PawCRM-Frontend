"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, Card } from "@/components";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking } from "@/types/api";

/** Mirrors NOTES_MAX_LENGTH in bookingItem.model.js. */
const NOTES_MAX_LENGTH = 500;

type Field = "customerNotes" | "internalNotes";

/**
 * ONE ANIMAL'S TWO NOTES, WRITTEN WHERE THE WORK IS.
 *
 * ─── WHY IT IS EDITABLE HERE AND NOT ONLY ON THE FORM ─────────────────────
 *
 * The booking form asks for both when the appointment is taken. What it cannot
 * catch is everything learned afterwards: the coat turns out to be worse than it
 * looked, the dog panics at the dryer, the owner says something at drop-off. All
 * of that happens on this page, and the alternative was opening the edit form —
 * which asks a groomer with wet hands to navigate a repricing screen to write one
 * sentence.
 *
 * ─── IT IS NOT `PATCH /bookings/:id` ─────────────────────────────────────
 *
 * The wholesale edit re-snapshots every unbilled row at today's catalogue price,
 * because changing what is being done is a new quote. Saving a note through it
 * would reprice a visit nobody meant to reprice, and the shop would find out on
 * the bill. `setPetNotes` writes two strings.
 *
 * ─── SAVED ON BLUR, ONE FIELD AT A TIME ──────────────────────────────────
 *
 * No save button, matching the time fields on this page: somebody types, looks
 * away, and it is kept. Each box sends only ITSELF — the other may be half-typed,
 * and a patch carrying both would write a stale value over live editing.
 *
 * A save that changes nothing is not sent at all. Tabbing through a card is the
 * commonest thing that happens to it, and a request per focus lost would be a
 * request per glance.
 *
 * ─── THE DRAFT IS LOCAL, AND RESEEDS WHEN THE SERVER'S ANSWER CHANGES ─────
 *
 * A textarea driven straight off `booking` would fight the person typing on
 * every keystroke that triggers a re-render. It reseeds when the stored value
 * changes underneath — which is what makes a failed save recover: the box keeps
 * the words, and the error says why they are not saved yet.
 */
export function BookingPetNotesCard({
  booking,
  petId,
  onChanged,
}: {
  booking: Booking;
  petId: string;
  /** Called with the updated booking, so the page redraws from the server. */
  onChanged: (booking: Booking) => void;
}) {
  /*
    BOTH NOTES ARE PER ANIMAL AND STORED PER ROW, so every one of this animal's
    services carries the same words. The first that has any is the answer — the
    same collapse `groupsFromBooking` does, and for the same reason.
  */
  const services = booking.pets.find((entry) => entry.petId === petId)?.services;

  /*
    READ PER FIELD, NOT PER ROW. A booking whose rows disagree — one written
    before the notes were split, or an edit that reached only some — must still
    show both halves; taking both from whichever row matched first would drop
    whichever that row happened to lack.

    HELD AS TWO STRINGS rather than an object, because they are what the reseed
    below compares: a fresh object every render is never equal to the last one.
  */
  const storedCustomer =
    services?.find((service) => service.customerNotes)?.customerNotes ?? "";
  const storedInternal =
    services?.find((service) => service.internalNotes)?.internalNotes ?? "";

  const [draft, setDraft] = useState({
    customerNotes: storedCustomer,
    internalNotes: storedInternal,
  });
  const [busy, setBusy] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
    RESEED WHEN THE STORED ANSWER MOVES. `onChanged` hands back the whole booking
    after a save, and another tab may have written one; without this the box
    would keep showing what this browser last typed.
  */
  const seeded = useRef({
    customerNotes: storedCustomer,
    internalNotes: storedInternal,
  });

  useEffect(() => {
    if (
      seeded.current.customerNotes !== storedCustomer ||
      seeded.current.internalNotes !== storedInternal
    ) {
      seeded.current = {
        customerNotes: storedCustomer,
        internalNotes: storedInternal,
      };
      setDraft({
        customerNotes: storedCustomer,
        internalNotes: storedInternal,
      });
    }
  }, [storedCustomer, storedInternal]);

  async function save(field: Field) {
    const value = draft[field].trim();
    const current =
      field === "customerNotes" ? storedCustomer : storedInternal;

    // Tabbing through is the commonest thing that happens to this card.
    if (value === current.trim()) return;

    setBusy(field);
    setError(null);

    try {
      const updated = await bookingService.setPetNotes(booking._id, petId, {
        [field]: value,
      });
      seeded.current = { ...seeded.current, [field]: value };
      onChanged(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Catatan belum tersimpan. Coba lagi.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Catatan booking">
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        {/*
          THE CUSTOMER'S IS FIRST, matching the reference — and it reads
          correctly: this card is opened at hand-over, when the question is what
          to tell the person standing there. The internal note is written during
          the work, when whoever writes it is already looking for it.
        */}
        <NoteField
          label="Untuk pelanggan"
          field="customerNotes"
          value={draft.customerNotes}
          busy={busy === "customerNotes"}
          placeholder="Belum ada catatan"
          /*
            IT SAYS WHERE THIS DOES NOT GO YET. Nothing prints it on a struk or
            sends it over WhatsApp, and a box that looks like it reaches the
            owner but does not is worse than one that is honest — somebody would
            write "sudah kami hubungi" and assume the customer had been.
          */
          hint="Belum tampil otomatis di struk atau WhatsApp."
          onChange={(value) =>
            setDraft((current) => ({ ...current, customerNotes: value }))
          }
          onCommit={() => void save("customerNotes")}
        />

        <NoteField
          label="Internal"
          field="internalNotes"
          value={draft.internalNotes}
          busy={busy === "internalNotes"}
          placeholder="Belum ada catatan"
          hint="Hanya untuk staf — tidak pernah ditampilkan ke pelanggan."
          onChange={(value) =>
            setDraft((current) => ({ ...current, internalNotes: value }))
          }
          onCommit={() => void save("internalNotes")}
        />
      </div>
    </Card>
  );
}

function NoteField({
  label,
  field,
  value,
  busy,
  placeholder,
  hint,
  onChange,
  onCommit,
}: {
  label: string;
  field: Field;
  value: string;
  busy: boolean;
  placeholder: string;
  hint: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <div>
      <label
        htmlFor={field}
        className="block text-xs font-bold uppercase tracking-wide text-muted"
      >
        {label}
      </label>

      {/*
        `Can` RATHER THAN A DISABLED TEXTAREA. Somebody without the grant is
        reading the page, not being stopped mid-act, and a greyed-out box reads
        as broken. What is written still shows.
      */}
      <Can
        feature="bookings"
        action="update"
        fallback={
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {value === "" ? "Belum ada catatan" : value}
          </p>
        }
      >
        <textarea
          id={field}
          name={field}
          value={value}
          rows={3}
          maxLength={NOTES_MAX_LENGTH}
          placeholder={placeholder}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-muted">
          {busy ? "Menyimpan…" : hint}
        </p>
      </Can>
    </div>
  );
}
