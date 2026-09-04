"use client";

import { CalendarCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * FR-3's banner: this customer has appointments today that nobody has rung up.
 *
 * ORANGE, AND SMALL. The PRD asks for an orange banner and `docs/ui-rules.md`
 * §1.2 allows exactly one shape of that — a **tint fill** with navy ink, never a
 * full-width orange surface: "sebagai latar ia mengubah produk jadi selebaran
 * diskon, dan pemilik toko berhenti mempercayainya dengan uang". The meaning
 * fits too, which is why orange is right here rather than merely permitted:
 * orange means *a human must act*, and this is the one thing on the till screen
 * that will be silently wrong if the cashier ignores it.
 *
 * IT SAYS THE NUMBER. "Punya booking hari ini" is a fact; "2 booking hari ini"
 * is something a cashier can check off against the customer standing there.
 *
 * IT DOES NOT RENDER AT ALL when there is nothing to pull. A banner that says
 * "0 booking" is a permanent orange rectangle, which is the proportion rule
 * broken by attrition — and by §1.2's last line, if two orange things are
 * visible at once one of them is wrong.
 */
export function PosBookingBanner({
  count,
  disabled = false,
  onOpen,
}: {
  count: number;
  disabled?: boolean;
  onOpen: () => void;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg bg-tint-warning px-3 py-2">
      {/* Decorative: the sentence beside it already says everything. */}
      <CalendarCheck className="size-4 shrink-0 text-warning" aria-hidden />

      <p className="min-w-0 flex-1 text-sm text-foreground">
        <span className="font-medium tabular-nums">{count} booking</span> hari
        ini belum ditarik ke keranjang.
      </p>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shrink-0"
        disabled={disabled}
        onClick={onOpen}
      >
        Tarik
      </Button>
    </div>
  );
}
