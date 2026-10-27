"use client";

import { useCallback, useEffect, useState } from "react";

import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type { PosShift } from "@/types/api";

import { recallShift, rememberShift } from "../offline/store";

interface UsePosShiftResult {
  shift: PosShift | null;
  /** True while the first read is in flight — the screen shows nothing yet. */
  loading: boolean;
  error: string | null;
  /** Re-ask. Call after opening or closing a shift. */
  refetch: () => void;
}

/**
 * The caller's own open shift, or null.
 *
 * THIS IS THE GATE'S STATE. Every other POS hook is downstream of it: no shift
 * means no catalogue, no cart, nothing. The screen renders `PosShiftGate` while
 * this is null and the till while it is not.
 *
 * NULL IS NOT AN ERROR. The API answers 200 with null when the till has not been
 * opened, because that is the ordinary state of every morning — treating it as a
 * failure would make the screen's normal path an error path.
 *
 * `branchId` gates the request rather than the result: a session pointed at
 * no branch cannot be asked this question at all, and the branch gate renders
 * before this one. See the effect.
 *
 * IT IS ASKED AGAIN WHEN THE BRANCH CHANGES (11 October 2026). A shift belongs
 * to a (branch, cashier) pair, and the answer for Timur says nothing about
 * Barat. The effect used to depend on a boolean — "is a branch chosen" — so
 * switching from one branch to another left the old answer standing: a cashier
 * with a shift open at Barat was shown "Buka Kasir" because they had been at
 * Timur a moment before, and opening one was refused as a duplicate.
 */
/**
 * `who` (POS offline mode, 19 October 2026): with it, the shift the server
 * confirmed is remembered on the device, and a till that cannot reach the
 * server opens on that remembered shift instead of an error — the drawer is
 * still open, the server simply cannot say so right now.
 */
export function usePosShift(
  branchId: string | null,
  who: { tenantId: string; userId: string } | null = null,
): UsePosShiftResult {
  const branchChosen = Boolean(branchId);
  const [shift, setShift] = useState<PosShift | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    /*
      NOT ASKED AT ALL UNTIL A BRANCH IS CHOSEN. The endpoint answers 400 with
      "switch to a branch first" — an instruction, not a fault — and a screen
      that fired the request anyway would have to translate a refusal back into
      the instruction it already had. The branch gate renders instead.

      An early return rather than a `setFetching(false)`: with no branch there is
      nothing in flight, so `loading` is DERIVED below instead of being switched
      off here. Same fact, one state transition fewer.
    */
    if (!branchChosen) {
      return;
    }

    let active = true;
    // The sanctioned fetch-effect shape — see useCustomers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetching(true);
    setError(null);

    posService
      .currentShift()
      .then((result) => {
        if (!active) return;
        setShift(result);
        if (who && branchId) void rememberShift(who.tenantId, who.userId, branchId, result);
      })
      .catch(async (err) => {
        if (!active) return;
        if (
          who &&
          branchId &&
          err instanceof ApiError &&
          (err.isNetworkError || err.isTimeout)
        ) {
          const remembered = await recallShift(who.tenantId, who.userId, branchId);
          if (!active) return;
          if (remembered) {
            setShift(remembered);
            void rememberShift(who.tenantId, who.userId, branchId, remembered);
            return;
          }
        }
        setShift(null);
        /*
          THE STATUS DECIDES THE SENTENCE. The first cut said "coba muat ulang"
          for everything, which was wrong advice for the case that actually
          happened: a 403 is a role problem and reloading will not fix it, and
          reloading a 400 will not either. A message that sends somebody to do
          something useless is worse than one that admits it does not know.
        */
        setError(
          err instanceof ApiError && err.status === 403
            ? "Akun Anda belum punya akses kasir. Minta admin menambahkannya."
            : err instanceof ApiError && err.status >= 400 && err.status < 500
              ? (err.reason ?? "Status kasir tidak bisa dibaca.")
              : "Status kasir tidak bisa dibaca. Coba muat ulang halaman.",
        );
      })
      .finally(() => {
        if (active) setFetching(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, branchChosen, branchId, who?.tenantId, who?.userId]);

  // Nothing is in flight before a branch is chosen, so this is never the
  // spinner's answer on the branch gate's behalf.
  return { shift, loading: branchChosen && fetching, error, refetch };
}
