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

/**
 * A stored discount as the BOX should show it — "5.0000" → "5", "7.5000" → "7,5",
 * "15000.0000" → "15000".
 *
 * A nominal discount keeps its digits and loses its decimals: the field takes
 * whole rupiah (see WHOLE_RUPIAH), so ".0000" would fail the very check that
 * decides whether Terapkan is pressable.
 */
function storedToInput(value: PosDiscount | null): string {
  if (!value) return "";

  const trimmed = value.value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

  // The percent field accepts a comma, and Indonesian writes one.
  return value.mode === "percent" ? trimmed.replace(".", ",") : trimmed;
}

export function PosDiscountPopover({
  value,
  onApply,
  disabled = false,
  label = "Diskon",
  subject,
}: {
  value: PosDiscount | null;
  onApply: (discount: { mode: PosDiscountMode; value: string } | null) => void;
  disabled?: boolean;
  /**
   * The TRIGGER's accessible name — "Diskon Cat Choise Adult — 1kg / Chicken".
   * Long on purpose: a basket has one of these per line and a screen reader
   * hearing "Diskon" twelve times learns nothing.
   */
  label?: string;
  /**
   * WHAT IS BEING DISCOUNTED, drawn under the heading and truncated to one line.
   *
   * ⚠️ IT EXISTS BECAUSE `label` WAS DOING BOTH JOBS (28 September 2026), and a
   * product name is exactly the wrong thing to head a 288px panel with: "Diskon
   * Cat Choise Adult — 1kg / Chicken / Orange" wrapped to two lines, pushed the
   * mode buttons down and left the panel looking like a mis-built form. The
   * heading is a fixed word now and the name is a subtitle that truncates,
   * while the trigger keeps the long name where it is useful and invisible.
   */
  subject?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PosDiscountMode>(value?.mode ?? "percent");
  /*
    ⚠️ TRIMMED, OR THE PANEL OPENS ON ITS OWN ERROR (28 September 2026).

    `value.value` is stored at the LEDGER'S SCALE — a 5% discount is
    "5.0000" — and `PERCENT` allows at most two decimals. So re-opening an
    existing discount drew "Isi persentase 0–100" under a box the cashier had
    not touched, with Terapkan greyed out: the only way to adjust a discount was
    to clear the field and retype it.

    Same trimming `triggerLabel` does for the badge, and for the same reason:
    the scale is storage, not something a cashier reads or edits.
  */
  const [amount, setAmount] = useState(() => storedToInput(value));

  const trimmed = amount.trim();
  const normalised = trimmed.replace(",", ".");
  const valid =
    mode === "percent"
      ? PERCENT.test(trimmed) && Number(normalised) <= 100
      : WHOLE_RUPIAH.test(trimmed);


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
        {/*
          A BORDER WHEN IT IS NOT FILLED (1 October 2026, on request). `ghost`
          drew a bare icon that read as decoration on a busy row — a thing to
          look at rather than a thing to press. `secondary` is the app's
          outlined button (ui-rules §7), so the empty state now says "control"
          and the filled state stays navy.
        */}
        <Button
          type="button"
          variant={value ? "default" : "secondary"}
          size="sm"
          disabled={disabled}
          aria-label={label}
        >
          <Percent className="size-4" />
          {value && triggerLabel(value)}
        </Button>
      </PopoverTrigger>

      {/*
        ALIGNED TO THE TRIGGER'S END and kept off the viewport edge. The basket
        is a narrow right-hand column, so a panel centred on a trigger near its
        edge is one Radix has to shove sideways; saying which edge to hang from
        makes it land in the same place every time.
      */}
      <PopoverContent align="end" collisionPadding={12} className="w-72 p-0">
        {/*
          `p-0` ON THE PANEL, padding on the two halves — the shape
          `FilterDateRange` already uses, and the reason is the footer: its rule
          has to run the FULL width of the panel, and a padded container would
          inset the rule and leave it floating short of both edges.

          ⚠️ THIS COMPONENT'S PopoverContent HAS NO PADDING OF ITS OWN (see
          components/ui/popover.tsx). Without a `p-*` here the text sat flush
          against the border on every side, which is what it did until
          28 September 2026.
        */}
        <div className="space-y-3 p-3.5">
        <div className="space-y-0.5">
          <Label className="text-sm font-semibold text-foreground">
            Diskon
          </Label>
          {subject && (
            /*
              ONE LINE, TRUNCATED, with the full name on hover. A cashier
              already knows which line they pressed — this is a confirmation,
              not information they are missing, so it must not cost height.
            */
            <p className="truncate text-xs text-muted" title={subject}>
              {subject}
            </p>
          )}
        </div>

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

        {/*
          THE UNIT IS ON THE BOX, not left to the mode buttons above it. A bare
          "5" in a panel that can mean either 5 percent or 5 rupiah is a figure
          somebody has to look UP to interpret — and the two are a thousandfold
          apart. The affix sits inside the field so it reads as part of the
          number rather than as a second control.
        */}
        <div className="relative">
          {mode === "amount" && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
              Rp
            </span>
          )}
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
            placeholder="0"
            aria-label={mode === "percent" ? "Diskon persen" : "Diskon rupiah"}
            className={
              mode === "amount"
                ? "pr-3 pl-9 tabular-nums"
                : "pr-8 pl-3 tabular-nums"
            }
            autoFocus
          />
          {mode === "percent" && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
              %
            </span>
          )}
        </div>

        {trimmed && !valid && (
          <p className="text-xs text-danger">
            {mode === "percent"
              ? "Isi persentase 0–100, misalnya 7,5."
              : "Isi angka rupiah tanpa titik, misalnya 15000."}
          </p>
        )}

        {/*
          ⏸️ THE "Di atas 10% perlu persetujuan atasan" LINE IS GONE (30
          September 2026, on request): the approval gate is shelved on the
          server (`DISCOUNT_APPROVAL_ENABLED` in posTransaction.service.js), so
          a warning about an approval nobody will be asked for is simply untrue.

          TO RESTORE, with the server's flag: recompute the one line it needed —
          `const overLimit = valid && mode === "percent" && Number(normalised) > 10;`
          — and put the paragraph back here. Left OUT rather than kept unused,
          which would only be a dead variable and a lint warning standing in for
          a comment.
        */}

        {/*
          HAPUS ONLY WHEN THERE IS ONE TO REMOVE. It used to sit there disabled
          on every fresh discount, which is a greyed word taking a third of the
          footer to say nothing — and it made "Terapkan" look like the right
          half of a pair rather than the action of the panel.
        */}
        </div>

        <div
          className={
            value
              ? "flex items-center justify-between gap-2 border-t border-border bg-background px-3.5 py-2.5"
              : "flex justify-end border-t border-border bg-background px-3.5 py-2.5"
          }
        >
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              onClick={clear}
            >
              Hapus diskon
            </Button>
          )}
          <Button type="button" size="sm" onClick={apply} disabled={!valid}>
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
