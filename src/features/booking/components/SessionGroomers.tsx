"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Alert, ConfirmDialog } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import {
  GROOMER_LEVEL_LABELS,
  type Booking,
  type BookingMainService,
  type BookingSession,
} from "@/types/api";

/** Mirrors MAX_SESSIONS_PER_SERVICE in booking.model.js. */
const MAX_SESSIONS = 6;

/** Mirrors MAX_GROOMERS_PER_SESSION in booking.model.js. */
const MAX_GROOMERS = 4;

/** Two decimals — the precision the server keeps a share at. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** "33,33" — the shop's decimal comma, for reading and for typing into. */
const asText = (value: number) => String(round2(value)).replace(".", ",");

/** A typed percent, comma or dot; `null` when it is not 0–100. */
function parsePercent(typed: string | undefined): number | null {
  const value = Number((typed ?? "").trim().replace(",", "."));

  if ((typed ?? "").trim() === "" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;

  return round2(value);
}

/**
 * Each person's part of the turn, as the server sent it — or the even split
 * when a response predates `sharePercent`.
 */
function sharesOf(session: BookingSession): Record<string, number> {
  const even =
    session.groomers.length > 0 ? round2(100 / session.groomers.length) : 0;

  return Object.fromEntries(
    session.groomers.map((who) => [who._id, who.sharePercent ?? even]),
  );
}

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
 * WHO IS ON ONE TURN, AND WHAT PART OF IT EACH EARNS.
 *
 * One row per person — "Sinta · Senior", their percent of the turn's
 * commission, and × to take them off — then "+ Tambah groomer…" under them.
 *
 * ─── THE PERCENT ────────────────────────────────────────────────────────────
 *
 * Even by default, and the server resets it to even whenever the crew changes.
 * It is saved when a box is left (or Enter): with TWO people the other box is
 * filled with the rest, so one number is one decision; with three or more the
 * boxes must add up to 100 before anything is sent. The server refuses a split
 * that does not, so this is the screen saying so first.
 *
 * Everybody on the turn is counted busy by the clash check, whatever their part.
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

  const saved = sharesOf(session);
  const crewIds = session.groomers.map((who) => who._id);

  /*
    THE BOXES, AS TYPED. Re-seeded from the server whenever the crew or its
    saved split changes — the render-time reset React recommends over an effect,
    so a stale draft never flashes after a save.
  */
  const seed = session.groomers
    .map((who) => `${who._id}:${saved[who._id]}`)
    .join("|");
  const [seenSeed, setSeenSeed] = useState(seed);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(crewIds.map((id) => [id, asText(saved[id])])),
  );
  const [splitError, setSplitError] = useState<string | null>(null);

  if (seenSeed !== seed) {
    setSeenSeed(seed);
    setDrafts(Object.fromEntries(crewIds.map((id) => [id, asText(saved[id])])));
    setSplitError(null);
  }

  function commit(id: string) {
    const next: Record<string, number> = {};

    for (const crewId of crewIds) {
      const value = parsePercent(drafts[crewId]);

      if (value === null) {
        setSplitError("Isi persen antara 0 dan 100.");
        return;
      }

      next[crewId] = value;
    }

    /* TWO PEOPLE: the other box takes the rest, so the pair always adds up. */
    if (crewIds.length === 2) {
      const other = crewIds.find((crewId) => crewId !== id);
      if (other) next[other] = round2(100 - next[id]);
    }

    setDrafts(
      Object.fromEntries(crewIds.map((crewId) => [crewId, asText(next[crewId])])),
    );

    const total = round2(Object.values(next).reduce((sum, value) => sum + value, 0));

    if (total !== 100) {
      setSplitError(`Total bagian ${asText(total)}% — harus 100%.`);
      return;
    }

    setSplitError(null);

    if (crewIds.every((crewId) => next[crewId] === saved[crewId])) return;

    void save({
      sessionId: session.sessionId,
      groomerUserIds: crewIds,
      groomerShares: next,
    });
  }

  /*
    ─── A FINISHED TURN IS READ-ONLY ──────────────────────────────────────────

    Who stood at the table for work that is OVER is a matter of record, not a
    setting: adding somebody claims they did work they were not there for, and
    removing somebody erases work they did. The server refuses both (409); this
    is the screen not offering what would be refused.

    ⚠️ THE NAMES STAY VISIBLE. Only the controls go — the crew is exactly what
    somebody reads back off a finished turn.

    THE WAY BACK IS THE STATUS. A turn crewed by mistake is corrected by moving
    it off `done` first, which is one deliberate act rather than a silent rewrite
    of finished work.
  */
  const settled = session.status === "done";

  /* Nobody already on THIS turn is offered for it again: one person doing one
     turn twice is a slip, not a way of working. */
  const taken = new Set(session.groomers.map((who) => who._id));
  const free = groomers.filter((option) => !taken.has(option.value));

  /* SENT WHOLESALE, never as a delta — the server takes the list this turn
     should end up with, so a swap cannot leave a running turn empty. */
  const crewWithout = (id: string) =>
    session.groomers.filter((who) => who._id !== id).map((who) => who._id);

  /* ONE ROW PER PERSON — editable, or the same facts read-only. */
  const rows = (editable: boolean) =>
    session.groomers.length === 0 ? (
      <p className="text-xs text-muted">
        Belum ditentukan — sesi ini belum bisa dimulai.
      </p>
    ) : (
      <ul className="flex flex-col gap-2">
        {session.groomers.map((who) => (
          <li
            key={who._id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-hover px-4 py-2"
          >
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold text-foreground">{who.name}</span>
              {who.level && (
                <span className="text-muted">
                  {" "}
                  · {GROOMER_LEVEL_LABELS[who.level]}
                </span>
              )}
              {/* THE LEAVE WARNING TRAVELS WITH THE PERSON: two people on one
                  turn can be off on different days. */}
              {who.offReason && (
                <span className="ml-1 text-xs font-semibold text-danger">
                  ({who.offReason.toLowerCase()})
                </span>
              )}
            </p>

            {editable ? (
              <label className="flex items-center gap-2 text-sm text-muted">
                <Input
                  value={drafts[who._id] ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [who._id]: event.target.value,
                    }))
                  }
                  onBlur={() => commit(who._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commit(who._id);
                    }
                  }}
                  inputMode="decimal"
                  aria-label={`Bagian komisi ${who.name} di ${session.sessionName} (persen)`}
                  /* One person earns the whole turn — nothing to split. */
                  disabled={busy || crewIds.length < 2}
                  className="h-9 w-20 bg-surface text-right tabular-nums"
                />
                %
              </label>
            ) : (
              <span className="text-sm tabular-nums text-muted">
                {asText(saved[who._id])} %
              </span>
            )}

            {editable && (
              <button
                type="button"
                aria-label={`Hapus ${who.name} dari ${session.sessionName}`}
                className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                disabled={busy}
                onClick={() =>
                  void save({
                    sessionId: session.sessionId,
                    groomerUserIds: crewWithout(who._id),
                  })
                }
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert variant="error">{error}</Alert>}

      <Can feature="bookings" action="update" fallback={rows(false)}>
        {rows(!settled)}

        {splitError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {splitError}
          </p>
        )}

        {/*
          ADDING SOMEBODY IS ONE PICK, and the list resets to its placeholder so
          the next pick is another person. The server splits the new crew evenly.
        */}
        {!settled &&
          session.groomers.length < MAX_GROOMERS &&
          free.length > 0 && (
            <Select
              value=""
              onValueChange={(value) =>
                value &&
                void save({
                  sessionId: session.sessionId,
                  groomerUserIds: [...crewIds, value],
                })
              }
              disabled={busy}
            >
              <SelectTrigger
                size="lg"
                aria-label={`Tambah groomer ke ${session.sessionName}`}
                className="w-full"
              >
                <SelectValue placeholder="+ Tambah groomer…" />
              </SelectTrigger>
              <SelectContent>
                {free.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

  /*
    ─── NOT ON A FINISHED TURN ────────────────────────────────────────────────

    Same reasoning as the crew controls beside it: a turn that is over is a
    record of work somebody did, and the stamps, the duration and the crew on it
    are what a payslip is reconciled against. Throwing that away is not one of
    the arranging steps.

    ⚠️ THE SERVER STILL ALLOWS IT, and that is not an oversight. Removal has its
    own guard there — refused once a `commissionrecords` row points at the turn,
    which is the question that actually matters for deleting finished work — and
    a turn marked done by mistake still has to be removable. As with "Buka lagi",
    what went is the affordance, not the move: put the turn back to `in_progress`
    first and the button returns.
  */
  if (session.status === "done") return null;

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
  service: BookingMainService;
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

      NO SERVICE IS NAMED: a booking has exactly one, so a turn without a
      `sessionId` can only be a new turn on it.
    */
    const ok = await save({ sessionName: trimmed });

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
