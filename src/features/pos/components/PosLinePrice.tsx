"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatMoney } from "@/utils/decimal";
import type { PosItem } from "@/types/api";

/**
 * One line's unit price — read, or typed over (28 September 2026, on the
 * owner's request).
 *
 * EDITED IN PLACE, not in a dialog. Re-pricing is a counter negotiation ("boleh
 * kurang?") that happens with a customer waiting, and two clicks plus a modal
 * to change one figure is the shape that makes a cashier write the discount in
 * their head instead.
 *
 * ⚠️ IT IS A GRANT, NOT A PREFERENCE. `editable` comes from
 * `posTransactions:setPrice`, which the seeded Staff role does not hold — and
 * the reason is the whole reason the permission exists: without it, typing a
 * price is a way round FR-4's 10% discount limit. A cashier without it sees the
 * price as plain text, with no affordance suggesting otherwise.
 *
 * WHAT IT SHOWS WHEN OVERRIDDEN: the typed price, the catalogue's struck
 * through, and the word "Harga diubah". Struck-through alone is a convention
 * about SALE prices — it would read as a discount the shop is advertising, and
 * this is the opposite, a figure somebody chose to type.
 */
export function PosLinePrice({
  item,
  label,
  editable,
  disabled = false,
  onChange,
}: {
  item: PosItem;
  /** Names the field for a screen reader: twenty "Harga" boxes say nothing. */
  label: string;
  /** `posTransactions:setPrice` — see the header. */
  editable: boolean;
  disabled?: boolean;
  /** `null` puts the line back to whatever the catalogue says today. */
  onChange: (unitPrice: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const overridden = Boolean(item.listPrice);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function open() {
    /*
      SEEDED WITH THE DIGITS, NOT THE FORMATTED STRING. "Rp 100.000" pasted into
      a number field is a value nothing can parse, and a cashier who starts
      typing over a selected "100000" gets what they expect.
    */
    setDraft(String(Number(item.unitPrice)));
    setEditing(true);
  }

  function commit() {
    setEditing(false);

    const trimmed = draft.trim();
    if (trimmed === "") {
      // An emptied box is "put it back", not "make it free" — free is typing 0,
      // which is a thing somebody has to mean.
      if (overridden) onChange(null);
      return;
    }

    const next = Number(trimmed);
    if (!Number.isFinite(next) || next < 0) return;

    // Unchanged is not a write: the cart round-trips on every send, and a
    // no-op one would flicker the whole basket for nothing.
    if (next === Number(item.unitPrice)) return;

    onChange(String(next));
  }

  if (!editable) {
    return (
      <span className="tabular-nums">
        {formatMoney(item.unitPrice)}
        {overridden && <ListPrice value={item.listPrice!} />}
      </span>
    );
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          aria-label={label}
          className="h-8 w-28 text-sm tabular-nums"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          autoFocus
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={open}
      /*
        A DOTTED UNDERLINE, not a button's border. The price sits inside a line
        of small print; drawing it as a control would put a second visual button
        beside the bin and the discount and make the row read as three actions
        rather than one figure somebody may correct.
      */
      className="rounded-sm underline decoration-dotted underline-offset-2 tabular-nums transition hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:no-underline disabled:opacity-60"
      title={`Ubah harga ${item.name}`}
      aria-label={`Ubah harga ${item.name}`}
    >
      {formatMoney(item.unitPrice)}
      {overridden && <ListPrice value={item.listPrice!} />}
    </button>
  );
}

/** What the tile said, kept beside what is being charged. */
function ListPrice({ value }: { value: string }) {
  return (
    <>
      {" "}
      <span className="text-muted line-through">{formatMoney(value)}</span>{" "}
      <span className="text-warning">Harga diubah</span>
    </>
  );
}
