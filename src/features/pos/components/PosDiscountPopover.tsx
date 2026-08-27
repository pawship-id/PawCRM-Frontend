"use client";

import { useState } from "react";
import { Percent } from "lucide-react";

import { Button } from "@/components/ui/button";
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
          {value &&
            (value.mode === "percent" ? `${value.value}%` : `Rp${value.value}`)}
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
