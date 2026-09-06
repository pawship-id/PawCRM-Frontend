"use client";

import { useState } from "react";
import { Plus, Trash2, UserRound, X } from "lucide-react";

import { Alert, ConfirmDialog, SelectField } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingPetService, BookingSession } from "@/types/api";

/** Mirrors MAX_SESSIONS_PER_SERVICE in bookingItem.model.js. */
const MAX_SESSIONS = 6;

/** Mirrors MAX_GROOMERS_PER_SESSION in bookingItem.model.js. */
const MAX_GROOMERS = 4;

/** The sentinel the selects use — Radix refuses an empty value. */
const PICK = "pilih";

type Groomers = { value: string; label: string; disabled?: boolean }[];

/**
 * ─── TWO CONTROLS, BECAUSE THE SCREEN ASKS TWO QUESTIONS ────────────────────
 *
 * `SessionCrew` is about ONE turn: who is standing at it, and taking the turn
 * off entirely. It lives inside that turn's row, under the name it acts on.
 *
 * `AddSessionButton` is about the SERVICE: this bath needs another turn. It
 * lives at the foot of the service's card, where "what is left to arrange for
 * this service" is the question being asked.
 *
 * THEY WERE ONE COMPONENT and it rendered every turn of a service at once —
 * which put a second list of the same sessions beside the one the work rows
 * already draw. Two lists of one thing is two places for it to disagree.
 */

/** Shared save + error handling. Both controls hit the same endpoint. */
function useSave(bookingId: string, onChanged: (booking: Booking) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (
    patch: Parameters<typeof bookingService.setSessionCrew>[1],
  ) => {
    setBusy(true);
    setError(null);

    try {
      onChanged(await bookingService.setSessionCrew(bookingId, patch));
      return true;
    } catch (err) {
      /*
        A 409 IS A CLASH, and it is reported rather than forced. The booking form
        offers "save anyway" because it is making the appointment; putting one
        more person on a turn is a smaller act with a bigger chance of being a
        mistake, so this one says no and leaves the choice of who to the person
        reading it.
      */
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Tidak bisa disimpan. Coba lagi.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, save };
}

/**
 * WHO IS ON ONE TURN.
 *
 * ⚠️ EVERYBODY HERE IS COUNTED BUSY, AND NOBODY HERE IS PAID YET. The clash
 * check counts the whole crew; how a turn's money is split between them is a
 * question the shop has not answered, and nothing computes commission from a
 * session until it does — see `groomerUserIds` in bookingItem.model.js for what
 * goes wrong if that is wired up first.
 */
export function SessionCrew({
  bookingId,
  session,
  groomers,
  onChanged,
}: {
  bookingId: string;
  session: BookingSession;
  /** Who may be booked that day — `disabled` carries the reason (FR-4). */
  groomers: Groomers;
  onChanged: (booking: Booking) => void;
}) {
  const { busy, error, save } = useSave(bookingId, onChanged);

  /* Nobody already on THIS turn is offered for it again: one person doing one
     turn twice is a slip, not a way of working. */
  const taken = new Set(session.groomers.map((who) => who._id));
  const free = groomers.filter((option) => !taken.has(option.value));

  /* SENT WHOLESALE, never as a delta — the server takes the list this turn
     should end up with, so a swap cannot leave a running turn empty. */
  const crewWithout = (id: string) =>
    session.groomers.filter((who) => who._id !== id).map((who) => who._id);

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert variant="error">{error}</Alert>}

      <Can
        feature="bookings"
        action="update"
        fallback={
          <p className="text-sm text-muted">
            <UserRound className="mr-1 inline size-4" aria-hidden />
            {session.groomers.map((who) => who.name).join(" + ") ||
              "Belum ditentukan"}
          </p>
        }
      >
        {session.groomers.length === 0 ? (
          <p className="text-xs text-muted">
            Belum ditentukan — sesi ini belum bisa dimulai.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {session.groomers.map((who) => (
              <li
                key={who._id}
                className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm"
              >
                {who.name}
                {/* THE LEAVE WARNING TRAVELS WITH THE PERSON: two people on one
                    turn can be off on different days. */}
                {who.offReason && (
                  <span className="text-xs font-semibold text-danger">
                    ({who.offReason.toLowerCase()})
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Hapus ${who.name} dari ${session.sessionName}`}
                  className="rounded-full p-0.5 text-muted transition hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  disabled={busy}
                  onClick={() =>
                    void save({
                      sessionId: session.sessionId,
                      groomerUserIds: crewWithout(who._id),
                    })
                  }
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {session.groomers.length < MAX_GROOMERS && free.length > 0 && (
          <SelectField
            label="Tambah groomer"
            value={PICK}
            onChange={(value) =>
              value !== PICK &&
              void save({
                sessionId: session.sessionId,
                groomerUserIds: [
                  ...session.groomers.map((who) => who._id),
                  value,
                ],
              })
            }
            options={[{ value: PICK, label: "Pilih orangnya…" }, ...free]}
            disabled={busy}
          />
        )}
      </Can>
    </div>
  );
}

/**
 * ─── THROWING A TURN AWAY ───────────────────────────────────────────────────
 *
 * It used to sit INSIDE `SessionCrew`, between the groomer picker and the
 * clock — in the middle of the controls for arranging a turn, where the eye
 * passes over it on the way to something else. Deleting is not one of the
 * arranging steps; it is the end of the turn, so it renders LAST, in the same
 * action row as Mulai and Selesai, pushed to the far right.
 *
 * ⚠️ IT ASKS FIRST. `docs/ui-rules.md` §9: destructive and irreversible needs
 * an explicit yes. A red trash on one click, sitting beside the button a
 * groomer presses every time they finish, is one slip away from losing a turn's
 * stamps and its crew with nothing to undo it.
 */
export function RemoveSessionButton({
  bookingId,
  session,
  onChanged,
}: {
  bookingId: string;
  session: BookingSession;
  onChanged: (booking: Booking) => void;
}) {
  const { busy, error, save } = useSave(bookingId, onChanged);
  const [asking, setAsking] = useState(false);

  return (
    <Can feature="bookings" action="update">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => setAsking(true)}
        /* §13: danger text is 4.38:1, so it must be ≥14px and semibold, and
           never colour alone — hence the word beside the icon. */
        className="ml-auto font-semibold text-danger hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-4" aria-hidden />
        Hapus sesi
      </Button>

      {asking && (
        <ConfirmDialog
          title={`Hapus sesi "${session.sessionName}"?`}
          confirmLabel="Hapus sesi"
          destructive
          busy={busy}
          error={error ?? undefined}
          onCancel={() => setAsking(false)}
          onConfirm={() =>
            void save({ sessionId: session.sessionId, remove: true }).then(
              (ok) => ok && setAsking(false),
            )
          }
        >
          Groomer dan jam yang sudah tercatat di sesi ini ikut hilang. Sesi lain
          di layanan yang sama tidak terpengaruh.
        </ConfirmDialog>
      )}
    </Can>
  );
}

/**
 * ONE MORE TURN ON THIS SERVICE — name it, save, and the button comes back.
 *
 * ─── SESSIONS ARE FILLED IN BY HAND, AND THIS IS WHERE ──────────────────────
 *
 * The booking form no longer mints a turn from the groomer it asks for. A
 * booking is an appointment; WHO stands at the table for which stretch of it is
 * settled on the day, at the table.
 *
 * ─── THE NAME IS THE ONLY THING ASKED FOR ──────────────────────────────────
 *
 * It used to ask for a groomer in the same breath, and the SELECT was what
 * saved — so adding a turn meant answering a question the person adding it
 * usually cannot yet: the roster is read when the dog is on the table, not while
 * somebody is writing down that a blow dry is needed. The crew is set in the
 * turn's own row afterwards, by `SessionCrew`.
 *
 * A TURN WITH NOBODY ON IT IS A REAL STATE — it simply cannot be started.
 */
export function AddSessionButton({
  bookingId,
  service,
  onChanged,
}: {
  bookingId: string;
  service: BookingPetService;
  onChanged: (booking: Booking) => void;
}) {
  const { busy, error, save } = useSave(bookingId, onChanged);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (service.sessions.length >= MAX_SESSIONS) {
    return null;
  }

  const trimmed = name.trim();

  async function submit() {
    if (!trimmed || busy) return;

    /*
      THE NAME AND NOTHING ELSE. Who works it is decided in the turn's own row,
      once it exists — the roster is read at the table, not while somebody is
      still typing what the turn is called.
    */
    const ok = await save({
      serviceItemId: service.itemId,
      sessionName: trimmed,
    });

    if (ok) {
      /* CLOSED, NOT CLEARED-AND-LEFT-OPEN. The button comes back, so adding a
         second turn is a deliberate click rather than something that happens by
         carrying on typing into a box nobody closed. */
      setOpen(false);
      setName("");
    }
  }

  return (
    <Can feature="bookings" action="update">
      <div className="flex flex-col gap-2">
        {error && <Alert variant="error">{error}</Alert>}

        {open ? (
          /*
            A FORM, SO ENTER SAVES. A single text field that ignores Enter is the
            one control people always try first, and a turn is added between two
            other things somebody is doing — it should cost one key.
          */
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama sesi — misal mandi, blow dry"
              aria-label={`Nama sesi baru untuk ${service.name}`}
              disabled={busy}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <Button type="submit" size="sm" disabled={busy || !trimmed}>
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setName("");
              }}
            >
              Batal
            </Button>
          </form>
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              Tambah sesi
            </Button>
          </div>
        )}
      </div>
    </Can>
  );
}
