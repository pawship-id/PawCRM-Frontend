"use client";

import { Receipt, Bookmark, History, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { formatMoney } from "@/utils/decimal";
import type { PosShift } from "@/types/api";

import type { ShiftTotals } from "../hooks/useShiftTotals";

/**
 * When the till was opened, as a person reads it.
 *
 * THE DATE AS WELL AS THE CLOCK (decided 27 Agt). A shift opened before midnight
 * and closed after it is ordinary in a shop that trades late, and a bar showing
 * only "23.40" leaves a cashier guessing which day they are still counting.
 */
function openedAtLabel(openedAt: string): string {
  const at = new Date(openedAt);
  if (Number.isNaN(at.getTime())) return "—";

  return at.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One labelled number on the bar.
 *
 * ZERO RATHER THAN A DASH for a figure that has not arrived yet — asked for on
 * 27 Agt, and the reasoning is that a till which has sold nothing genuinely
 * holds Rp 0, which is what almost every dash would have meant.
 *
 * THE COST, stated rather than hidden: the bar can no longer tell "nothing sold
 * yet" apart from "the figure could not be read". Both print Rp 0. The X-Report
 * says so plainly when it fails, and it is the thing to open before counting a
 * drawer — see `PosXReportDialog`.
 */
function Figure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // A description list, so a screen reader reads each number WITH its label
    // rather than as four loose values.
    <div>
      <dt className="text-xs opacity-80">{label}</dt>
      {/* tabular-nums so figures do not jitter as they update — ui-rules §5. */}
      <dd className="text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
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
  totals,
  heldCount,
  onOpenHeld,
  onOpenToday,
  onXReport,
  onSettings,
  onCloseShift,
}: {
  shift: PosShift;
  /** This shift's running figures, or null until they have been read. */
  totals: ShiftTotals | null;
  heldCount: number;
  onOpenHeld: () => void;
  onOpenToday: () => void;
  onXReport: () => void;
  onSettings: () => void;
  onCloseShift: () => void;
}) {
  return (
    /*
      TWO SIDES: what the shift IS on the left, what can be DONE to it on the
      right. They stack on a phone rather than competing for one line — the
      figures come first because they are read at a glance and the buttons are
      reached for deliberately.
    */
    <div className="flex flex-col gap-4 rounded-xl bg-primary px-4 py-3 text-primary-foreground sm:flex-row sm:items-center sm:justify-between">
      {/*
        A 2×2 GRID, NOT A ROW OF FOUR. Two columns hold at 360px as readily as at
        1440, so there is one arrangement to look at rather than a wide one and a
        narrow one that drift apart. The pairing is also the reading order a
        cashier wants: what this shift IS on top, what it HOLDS underneath.
      */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:gap-x-8">
        <Figure label="Shift">{shift.shiftNumber}</Figure>
        <Figure label="Tanggal &amp; Jam Buka">
          {openedAtLabel(shift.openedAt)}
        </Figure>
        <Figure label="Saldo awal">{formatMoney(shift.openingCash)}</Figure>

        {/*
          THREE FIGURES, NOT FIVE (decided 27 Agt). FR-9 lists total penjualan and
          jumlah transaksi here too, and both were built — but the X-Report dialog
          already showed the pair, and four of the bar's five numbers were the
          same numbers under different names. The bar keeps what a cashier needs
          WITHOUT stopping: what is in the drawer. The rest is a report, opened
          deliberately, and that is where it lives now.

          READ FROM THE X-REPORT so the bar and Tutup Kasir cannot disagree — a
          cashier who watches this number all afternoon and is measured against a
          different one at closing has been set up to fail. Cash only, net of
          change given and of this shift's cash refunds.
        */}
        <Figure label="Kas masuk">
          {formatMoney(totals?.cashTakings ?? "0")}
        </Figure>
      </dl>

      {/*
        WRAPPING, NOT SCROLLING. Five actions do not fit one phone line, and a
        horizontally scrolling strip hides whichever one falls off the end —
        including Tutup Kasir, which is the one somebody hunts for at closing.
      */}
      <div className="flex flex-wrap items-center gap-2">
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
