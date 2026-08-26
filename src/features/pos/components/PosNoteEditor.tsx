"use client";

import { useState } from "react";
import { Pencil, StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The backend's own ceiling — `NOTE_MAX_LENGTH` in posTransaction.model.js.
 *
 * REPEATED HERE RATHER THAN FETCHED, and that is a duplication worth naming: the
 * alternative is a cashier typing 600 characters and being refused by the server
 * with the whole note still in the box. The server stays the authority; this
 * stops the box from ever producing something it would refuse.
 */
const NOTE_MAX_LENGTH = 500;

/** Show the counter only when it starts to matter. */
const COUNTER_FROM = 400;

/**
 * The transaction's note (FR-5).
 *
 * HIDDEN UNTIL ASKED FOR. Almost no sale has a note, and a textarea sitting open
 * on every basket is dead space on the one screen where vertical room is scarce.
 * The same idiom the charges editor uses on this panel: nothing until there is
 * something.
 *
 * IT COMMITS ON BLUR, not on every keystroke. A cart write sends the whole
 * basket, so a PATCH per character would be a request per character. Blur is
 * what a cashier does anyway on their way to the payment button, and the note is
 * stored well before the sale settles — `settle` reads the cart from the
 * database, not from this screen.
 *
 * THE LIMIT IS THE BACKEND'S, enforced by the box rather than by a refusal. FR-5
 * asks for no hard cap in the UI and a sensible one on the server; a `maxLength`
 * that stops the 501st character is neither a refusal nor a surprise — it is the
 * form declining to produce something the server would reject.
 */
export function PosNoteEditor({
  note,
  disabled = false,
  onChange,
}: {
  note: string | null;
  disabled?: boolean;
  onChange: (note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  /**
   * Opens the box on whatever is stored right now.
   *
   * FILLED HERE RATHER THAN MIRRORED BY AN EFFECT. The draft only exists while
   * the box is open, so there is nothing to keep in step the rest of the time —
   * and an effect copying `note` into state on every change would be a second
   * copy of the truth, kept honest by a rule somebody has to remember.
   */
  function edit() {
    setDraft(note ?? "");
    setOpen(true);
  }

  function commit() {
    const trimmed = draft.trim();

    // Null rather than "" — an emptied field is a note that is not there, and
    // the receipt tests `note &&` before printing the line.
    if (trimmed !== (note ?? "")) {
      onChange(trimmed === "" ? null : trimmed);
    }

    setOpen(false);
  }

  if (!open && !note) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start px-0 text-muted"
        disabled={disabled}
        onClick={edit}
      >
        <StickyNote className="size-4" />
        Tambah catatan
      </Button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="group w-full rounded-lg bg-surface px-2 py-1.5 text-left hover:bg-surface-hover"
        disabled={disabled}
        onClick={edit}
        aria-label="Ubah catatan transaksi"
      >
        {/*
          IT SAYS WHAT IT IS, AND THAT IT CAN BE CHANGED.

          Without the header this was one bare line of text sitting between the
          charges and the subtotal — a cashier reading "testing" there has no way
          to know it is the transaction's note rather than a label somebody
          typed, and nothing at all to suggest tapping it does anything.
        */}
        <span className="flex items-center justify-between gap-2 text-xs text-muted">
          {/* The word alone. An icon beside it would say the same thing twice. */}
          <span>Catatan</span>
          {/*
            Decorative: "Ubah catatan transaksi" is already on the button, so a
            second announcement would make a screen reader say it twice.
          */}
          <Pencil
            className="size-3.5 opacity-60 group-hover:opacity-100"
            aria-hidden
          />
        </span>

        {/*
          THE WHOLE NOTE, wrapped rather than truncated. It is an instruction
          somebody has to act on — "jangan pakai parfum" cut off at the width of
          the panel is worse than a taller row.
        */}
        <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-foreground">
          {note}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-1">
      {/*
        A BARE `<textarea>`, matching the two other multi-line fields on this
        screen — there is no `ui/textarea` primitive in the repo, and adding one
        for a third caller would be a component invented to avoid repeating six
        class names.
      */}
      <textarea
        autoFocus
        value={draft}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        placeholder="Instruksi khusus, mis. jangan pakai parfum"
        aria-label="Catatan transaksi"
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-surface p-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          // Escape abandons the edit; the stored note is untouched.
          if (event.key === "Escape") {
            setDraft(note ?? "");
            setOpen(false);
          }
        }}
      />

      {/*
        THE COUNTER APPEARS ONLY NEAR THE END. A running "12/500" on an empty box
        is a limit advertised to somebody who will never reach it.
      */}
      {draft.length >= COUNTER_FROM && (
        <p className="text-right text-xs tabular-nums text-muted">
          {draft.length} / {NOTE_MAX_LENGTH}
        </p>
      )}
    </div>
  );
}
