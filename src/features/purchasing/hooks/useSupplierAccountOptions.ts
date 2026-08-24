"use client";

import { useEffect, useState } from "react";

import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { ApiError } from "@/services/api-error";
import type { ChartOfAccount } from "@/types/accounting";

/** One page is enough: a tenant's chart is tens of accounts, not thousands. */
const OPTION_LIMIT = 100;

interface UseSupplierAccountOptionsResult {
  /** Liability accounts — the only legal targets for the payable override. */
  payableAccounts: ChartOfAccount[];
  /** Asset accounts — the only legal targets for the advance override. */
  advanceAccounts: ChartOfAccount[];
  loading: boolean;
  /**
   * Why the lists did not arrive, or null when they did. `status` is kept apart
   * from the message so the form can say "your role has no Accounting access"
   * for a 403 and pass the server's own words through for everything else.
   */
  error: { status: number; message: string } | null;
}

/**
 * The accounts a supplier's two posting overrides may point at.
 *
 * FILTERED BY TYPE ON THE SERVER, not here. A payable must be a LIABILITY
 * account and an advance an ASSET one — the API refuses anything else with a 400
 * naming the field — so asking for the right type is what keeps the picker from
 * offering something the save would reject. Filtering client-side would let the
 * two disagree the moment a type rule changes.
 *
 * ACTIVE ONLY, for the same reason: the API refuses a deactivated account.
 *
 * IT FAILS SOFTLY AND REPORTS WHY, the same shape useCatalogLookups uses for the
 * product form's account pair. `chartOfAccounts:read` is a separate grant from
 * `suppliers:write`, so a purchasing role can legitimately hold the second
 * without the first — and a supplier saves perfectly well without either
 * override, since the ledger falls back to the seeded 2101. Blocking the whole
 * form over a list it does not need would be the wrong trade.
 *
 * DO NOT COLLAPSE THE `status` INTO THE MESSAGE. An earlier version of the
 * product form reported "no Accounting access" for ANY failure, and the first
 * real failure was a malformed request from our own service layer — the screen
 * was confidently wrong and sent people looking at RBAC instead of at the bug.
 */
export function useSupplierAccountOptions(): UseSupplierAccountOptionsResult {
  const [payableAccounts, setPayableAccounts] = useState<ChartOfAccount[]>([]);
  const [advanceAccounts, setAdvanceAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    status: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    Promise.all([
      chartOfAccountsService.list({
        accountType: "liability",
        isActive: true,
        limit: OPTION_LIMIT,
      }),
      chartOfAccountsService.list({
        accountType: "asset",
        isActive: true,
        limit: OPTION_LIMIT,
      }),
    ])
      .then(([liabilities, assets]) => {
        if (!active) return;
        setPayableAccounts(liabilities.items);
        setAdvanceAccounts(assets.items);
      })
      .catch((err) => {
        if (!active) return;
        setPayableAccounts([]);
        setAdvanceAccounts([]);
        // Either half failing is the same answer to the form: the overrides
        // cannot be picked, and the supplier saves without them.
        setError(
          err instanceof ApiError
            ? { status: err.status, message: err.message }
            : { status: 0, message: "Daftar akun gagal dimuat." },
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { payableAccounts, advanceAccounts, loading, error };
}
