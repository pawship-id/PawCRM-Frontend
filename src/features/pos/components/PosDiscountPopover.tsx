"use client";

import { useState } from "react";
import { Percent } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PosDiscount, PosDiscountMode } from "@/types/api";

/**
 * Whole rupiah only.
 *
 * NOT a general decimal check. In Indonesian, `.` is the THOUSANDS separator, so
 * "150.000" parses as a valid three-decimal number and would be stored as 150
 * rupiah — a thousandfold error that looks like a typo nobody made. Digits only,
 * and the same guard the service and shift forms use.
 */
const WHOLE_RUPIAH = /^\d+$/;

/** A percentage: up to two decimals, so 7,5% is expressible. */
const PERCENT = /^\d{1,3}([.,]\d{1,2})?$/;

/**
 * The discount editor for a line or for the whole basket (FR-4).
 *
 * A POPOVER RATHER THAN A DIALOG, because a discount is an adjustment to
 * something already on screen and the cashier needs to keep seeing the line they
 * are discounting. A modal would cover the basket to edit the basket.
 *
 * THE 10% LIMIT IS NOT ENFORCED HERE. The server owns it, and it must — a limit
 * checked only in the browser is a limit anybody can lift with dev tools. What
 * this does is WARN at the boundary, so the cashier knows an approval is coming
 * before they commit rather than being refused after.
 */
/**
 * WHAT THE BADGE SAYS — and it says what was TAKEN OFF, not what was typed.
 *
 * THE BUG THIS REPLACES. It rendered `Rp${value.value}`: the raw Decimal128 off
 * the document, so a Rp 110.000 discount showed as "Rp110000.0000", and the
 * number was the one the cashier TYPED rather than the one applied. On a
 * Rp 100.000 line that discount is capped at Rp 100.000 — so the line said
 * "−Rp 100.000" while the badge beside it said 110000, and the two disagreed
 * about the same discount.
 *
 * A PERCENTAGE STILL SHOWS AS A PERCENTAGE. "10%" is what was agreed with the
 * customer and it is what the cashier will look for when checking their work;
 * the rupiah it came to is already on the line above. Trailing zeros are trimmed
 * because the value is stored at the ledger's scale — "10.0000%" is the same
 * artefact in the other mode.
 */
function triggerLabel(value: PosDiscount): string {
  if (value.mode === "percent") {
    // "10.0000" -> "10", "7.5000" -> "7,5". Only the FRACTIONAL zeros go: the
    // naive `/\.?0+$/` also eats the zeros of "100", which is a real discount
    // and would have rendered as "1%".
    const trimmed = value.value
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
    // Comma for the decimal mark — Indonesian, and the same convention
    // `formatMoney` already prints beside it.
    return `${trimmed.replace(".", ",") || "0"}%`;
  }

  return formatMoney(value.resolvedAmount);
}

export function PosDiscountPopover({
  value,
  onApply,
  disabled = false,
  label = "Diskon",
}: {
  value: PosDiscount | null;
  onApply: (discount: { mode: PosDiscountMode; value: string } | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PosDiscountMode>(value?.mode ?? "percent");
  const [amount, setAmount] = useState(value?.value ?? "");

  const trimmed = amount.trim();
  const normalised = trimmed.replace(",", ".");
  const valid =
    mode === "percent"
      ? PERCENT.test(trimmed) && Number(normalised) <= 100
      : WHOLE_RUPIAH.test(trimmed);

  const overLimit = valid && mode === "percent" && Number(normalised) > 10;

  function apply() {
    if (!valid) return;
    onApply({ mode, value: normalised });
    setOpen(false);
  }

  function clear() {
    setAmount("");
    onApply(null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={value ? "default" : "ghost"}
          size="sm"
          disabled={disabled}
          aria-label={label}
        >
          <Percent className="size-4" />
          {value && triggerLabel(value)}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 space-y-3">
        <Label>{label}</Label>

        {/* Two buttons, not a select: there are exactly two modes. */}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            variant={mode === "percent" ? "default" : "secondary"}
            aria-pressed={mode === "percent"}
            onClick={() => setMode("percent")}
          >
            Persen
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            variant={mode === "amount" ? "default" : "secondary"}
            aria-pressed={mode === "amount"}
            onClick={() => setMode("amount")}
          >
            Nominal
          </Button>
        </div>

        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
          inputMode="decimal"
          placeholder={mode === "percent" ? "0" : "0"}
          aria-label={mode === "percent" ? "Diskon persen" : "Diskon rupiah"}
          autoFocus
        />

        {trimmed && !valid && (
          <p className="text-xs text-danger">
            {mode === "percent"
              ? "Isi persentase 0–100, misalnya 7,5."
              : "Isi angka rupiah tanpa titik, misalnya 15000."}
          </p>
        )}

        {/*
          The warning, not a block. A cashier is allowed to ask for 20% — they
          just need someone to approve it, and knowing that now beats being
          refused after they have told the customer.
        */}
        {overLimit && (
          <p className="text-xs text-muted">
            Di atas 10% perlu persetujuan atasan.
          </p>
        )}

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={!value}
          >
            Hapus diskon
          </Button>
          <Button type="button" size="sm" onClick={apply} disabled={!valid}>
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
