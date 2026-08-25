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
