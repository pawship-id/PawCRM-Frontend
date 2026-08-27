"use client";

import { useEffect, useState } from "react";

import { posService } from "@/services/pos.service";

/** The running figure the shift bar shows beside the float (FR-9). */
export interface ShiftTotals {
  /**
   * What went into the drawer — cash only, net of change given and of this
   * shift's cash refunds. The same figure Tutup Kasir will measure against.
   */
  cashTakings: string;
}

/**
 * What is in the drawer so far (FR-9's status bar).
 *
 * READ FROM THE X-REPORT, not tallied here. The bar and the Z-Report must agree
 * to the rupiah — a cashier who watches one number all afternoon and is measured
 * against a different one at closing has been set up to fail. That endpoint
 * already nets change and this shift's cash refunds out of the cash figure, and
 * a running total kept in the browser would drift from it the first time
 * anything was voided.
 *
 * SAFE TO CALL AS OFTEN AS THIS FIRES: the X-Report writes nothing at all, which
 * FR-9 requires of it for the cashier's sake and which happens to make it usable
 * here.
 *
 * `version` IS THE REFETCH SIGNAL — bumped by the screen whenever a sale is
 * settled, voided or returned. Polling on a timer was the alternative and is
 * worse: it would ask on a quiet till all afternoon and still be stale in the
 * second after a sale, which is exactly when somebody looks.
 */
export function useShiftTotals(
  shiftId: string | null,
  version: number,
): ShiftTotals | null {
  /*
    THE SHIFT IT BELONGS TO IS KEPT WITH IT. A cashier who closes a till and
    opens a new one would otherwise see the OLD shift's takings for as long as
    the new request takes — a wrong number, about money, on a bar somebody reads
    at a glance. Matching the id below is what makes that impossible rather than
    merely brief.
  */
  const [loaded, setLoaded] = useState<{
    shiftId: string;
    totals: ShiftTotals;
  } | null>(null);

  useEffect(() => {
    if (!shiftId) return;

    let active = true;

    /*
      WRAPPED, so a throw on the way OUT of the call becomes a rejection like any
      other. These three figures are the least important thing on the till — a
      cashier can sell all day without them — and they must not be able to take
      the screen down with them. The catch below already covers a failed request;
      this covers the call itself failing.
    */
    Promise.resolve()
      .then(() => posService.xReport(shiftId))
      .then((report) => {
        if (!active) return;
        setLoaded({
          shiftId,
          /*
            ONLY THE CASH FIGURE, though the same request carries the takings and
            the transaction count too. Those two live in the X-Report dialog and
            nowhere else — decided 27 Agt — and returning fields nothing reads is
            how a hook grows a second reason to exist.
          */
          totals: { cashTakings: report.totals.cashTakings },
        });
      })
      .catch(() => {
        /*
          NULL, NOT ZERO. The bar draws a dash for an unknown figure — showing
          "Rp 0" because a request failed would be a number a cashier could
          reconcile against, and it would be wrong.
        */
        if (active) setLoaded(null);
      });

    return () => {
      active = false;
    };
  }, [shiftId, version]);

  return loaded && loaded.shiftId === shiftId ? loaded.totals : null;
}
