"use client";

import { useCallback, useEffect, useState } from "react";

import { consignmentSettlementService } from "@/services/consignmentSettlement.service";
import type { ConsignmentOutstanding } from "@/types/api";

export interface UseConsignmentOutstandingResult {
  data: ConsignmentOutstanding | null;
  /** The read failed — distinct from "nobody is owed", which is an empty `data`. */
  failed: boolean;
  loading: boolean;
  /** Re-ask the server, e.g. after a "Setor" went through. */
  refetch: () => void;
}

/**
 * What the shop owes its consignors, per supplier — the Ringkasan tab's
 * "Utang konsinyasi" section.
 *
 * ITS OWN HOOK AND ITS OWN REQUEST, not a fourth leg of `usePayablesSummary`:
 * the section must still render when the payables summary fails (and the other
 * way round), and a "Setor" refetches ONLY this. The cabang is the one the tab
 * already scopes everything else by, passed in rather than held here so the two
 * can never disagree.
 *
 * NOTHING IS ADDED UP HERE. `sold`, `settled` and `outstanding` are the
 * server's aggregation over sales and settlements.
 */
export function useConsignmentOutstanding(
  /** Skip the request when the role cannot read payables. */
  enabled: boolean,
  /** "" = every cabang. */
  branchId: string,
): UseConsignmentOutstandingResult {
  const [data, setData] = useState<ConsignmentOutstanding | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [reloads, setReloads] = useState(0);

  const refetch = useCallback(() => setReloads((count) => count + 1), []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    consignmentSettlementService
      .outstanding({ branchId })
      .then((result) => {
        if (!active) return;
        setData(result ?? null);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, branchId, reloads]);

  return { data, failed, loading, refetch };
}
