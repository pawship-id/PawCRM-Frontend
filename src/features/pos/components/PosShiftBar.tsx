"use client";

import { Receipt, Bookmark, History, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { formatMoney } from "@/utils/decimal";
import type { PosShift } from "@/types/api";

/** The shift's clock, as a person reads it. */
function openedAtLabel(openedAt: string): string {
  const at = new Date(openedAt);
  if (Number.isNaN(at.getTime())) return "—";

  return at.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The status strip across the top of the till (FR-9).
 *
 * ALWAYS VISIBLE WHILE A SHIFT IS OPEN, which the PRD requires and which is the
 * point: a cashier should never have to go looking for what time they started or
 * what the drawer is supposed to hold. It is the one navy band on the screen —
 * ui-rules §4 puts navy at about a quarter of a screen, and this is where the
 * POS spends it.
 *
 * THE FIGURES COME FROM THE SHIFT, not from a running tally kept here. A number
 * this bar computed itself would drift from the X-Report the moment anything was
 * voided, and the two are read side by side at closing time.
 */
export function PosShiftBar({
  shift,
  heldCount,
  onOpenHeld,
  onOpenToday,
  onXReport,
  onSettings,
  onCloseShift,
}: {
  shift: PosShift;
  heldCount: number;
  onOpenHeld: () => void;
  onOpenToday: () => void;
  onXReport: () => void;
  onSettings: () => void;
  onCloseShift: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-primary px-4 py-3 text-primary-foreground">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <div>
          <span className="block text-xs opacity-80">Shift</span>
          {/* tabular-nums so the clock does not jitter — ui-rules §5. */}
          <span className="block text-sm font-semibold tabular-nums">
            {shift.shiftNumber} · {openedAtLabel(shift.openedAt)}
          </span>
        </div>
        <div>
          <span className="block text-xs opacity-80">Saldo awal</span>
          <span className="block text-sm font-semibold tabular-nums">
            {formatMoney(shift.openingCash)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onOpenHeld}
        >
          <Bookmark className="size-4" />
          Keranjang tersimpan
          {/* The count is a word beside a number, not a bare dot — §1.3. */}
          {heldCount > 0 && ` (${heldCount})`}
        </Button>

        {/*
          Where a void or a return starts (FR-11). On the bar rather than behind
          a menu, because it is also how a cashier reprints a receipt somebody
          lost — which is the most common reason to reach for it.
        */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onOpenToday}
        >
          <History className="size-4" />
          Transaksi hari ini
        </Button>

        <Button type="button" variant="secondary" size="sm" onClick={onXReport}>
          <Receipt className="size-4" />
          X-Report
        </Button>

        {/*
          Pengaturan Kasir (FR-8) — the paper size this DEVICE prints on.

          ICON ONLY, and the only one on the bar that is: everything beside it is
          part of serving a customer, and this is set up once and then left
          alone. `size-9` and an `aria-label` rather than a bare icon, so it
          still clears ui-rules §1.5's 44 px hit area and still has a name.

          UNGATED. It changes nothing on the server and nothing anybody else can
          see — a permission on it would be a permission to configure your own
          browser.
        */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="size-9 p-0"
          aria-label="Pengaturan Kasir"
          title="Pengaturan Kasir"
          onClick={onSettings}
        >
          <Settings className="size-4" />
        </Button>

        {/*
          Gated separately from the rest of the bar: counting the drawer and
          declaring the variance is often a supervisor's job, and a cashier who
          cannot do it should not be shown a button that will refuse them.
        */}
        <Can feature="posShifts" action="close">
          <Button type="button" size="sm" onClick={onCloseShift}>
            Tutup Kasir
          </Button>
        </Can>
      </div>
    </div>
  );
}
