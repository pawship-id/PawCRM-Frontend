"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/utils/decimal";
import type { PosCharge } from "@/types/api";

/** Digits only — in Indonesian, "10.000" is ten thousand, not ten. */
const WHOLE_RUPIAH = /^\d+$/;

/**
 * Biaya lain (FR-5).
 *
 * ALWAYS ADDITIVE, and the form cannot express anything else — no sign toggle,
 * no negative. A negative charge is a discount wearing a label, and it would
 * skip every approval rule discounts have. The server refuses one too; this
 * simply never offers it.
 *
 * A ZERO IS REFUSED, which is FR-5's stated edge case: a labelled charge of
 * nothing is a line on the receipt that means nothing.
 *
 * 40 px, NOT the form layer's 44. ui-rules §16 sets 44 for a document's header;
 * this is a two-field add-row inside a panel, which is the bar geometry the same
 * section exempts — 44 here would tower over the cart lines it sits under.
 *
 * IT SAYS WHAT IT IS, above the fields. The placeholders were doing that job and
 * a placeholder cannot: it vanishes the moment somebody types, so a cashier who
 * has keyed in half a line has nothing on screen saying what the two boxes are
 * for — and "Ongkos kirim" greyed out in the first one reads as a value already
 * entered rather than as an example of one.
 *
 * A HEADING, NOT A `<label>`, and the two fields keep their own `aria-label`s.
 * One label can only point at one control; pointing it at the name field would
 * rename that field "Biaya lainnya" and leave the amount beside it named
 * something narrower than its neighbour. The heading names the GROUP, the
 * aria-labels name the boxes, and a screen reader gets both.
 */
export function PosOtherChargesEditor({
  charges,
  onChange,
  disabled = false,
}: {
  charges: PosCharge[];
  onChange: (charges: PosCharge[]) => void;
  disabled?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const trimmedLabel = label.trim();
  const trimmedAmount = amount.trim();
  const valid =
    trimmedLabel.length > 0 &&
    WHOLE_RUPIAH.test(trimmedAmount) &&
    Number(trimmedAmount) > 0;

  function add() {
    if (!valid) return;
    onChange([...charges, { label: trimmedLabel, amount: trimmedAmount }]);
    setLabel("");
    setAmount("");
  }

  return (
    <div className="space-y-2">
      {/* Same weight and colour as the note's own header directly above it —
          two section titles in one panel that did not match would read as two
          different kinds of thing. */}
      <span className="block text-xs text-muted">Biaya lainnya</span>

      {charges.map((charge, index) => (
        <div
          key={`${charge.label}-${index}`}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="truncate text-muted">{charge.label}</span>
          <div className="flex shrink-0 items-center gap-1">
            <span className="tabular-nums text-foreground">
              {formatMoney(charge.amount)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-danger"
              disabled={disabled}
              aria-label={`Hapus biaya ${charge.label}`}
              onClick={() => onChange(charges.filter((_, i) => i !== index))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Ongkos kirim"
          aria-label="Nama biaya"
          className="h-10 flex-1"
          disabled={disabled}
        />
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          inputMode="numeric"
          placeholder="10000"
          aria-label="Nominal biaya"
          className="h-10 w-28 tabular-nums"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-10"
          onClick={add}
          disabled={disabled || !valid}
          aria-label="Tambah biaya"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
