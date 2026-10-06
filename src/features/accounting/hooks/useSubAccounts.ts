"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { subAccountService } from "@/services/subAccount.service";
import type { SubAccount } from "@/types/accounting";

export interface UseSubAccountsResult {
  /** The ACTIVE sub akun of the account, in code order. Empty for no account. */
  subAccounts: SubAccount[];
  /** True from the moment an account is chosen until its sub akun have arrived. */
  loading: boolean;
  /** Why the read failed — a refusal reads as "no sub akun" to the caller. */
  error: string | null;
}

/** What the last settled read was ABOUT, so a stale answer is never shown. */
interface Settled {
  accountId: string;
  subAccounts: SubAccount[];
  error: string | null;
}

/**
 * The sub akun a form may offer under ONE account — GET /sub-accounts?accountId=
 * &isActive=true, the picker.
 *
 * FOR A FORM WITH ONE ACCOUNT PICKER, which is the catalogue's three (product,
 * category, service). The journal and the cash lines hold many rows and read the
 * sub akun the chart already carries instead (`subAccountOptionsFor`) — one
 * request per row would be twenty round trips for a form.
 *
 * KEYED ON THE ACCOUNT, not reset in an effect: an answer is kept with the id it
 * answered, and `loading` is "the settled answer is about some other account".
 * Changing the account therefore never shows the previous account's sub akun for
 * a frame, and no `setState` runs in the effect body to clear them.
 *
 * FAILS SOFTLY. `chartOfAccounts:read` is its own grant — somebody who organises
 * the catalogue without seeing the books is ordinary — so a refusal comes back as
 * an empty list plus `error`, and the form carries on as if the account had no
 * sub akun; the server is still the one that insists when it matters.
 */
export function useSubAccounts(accountId: string): UseSubAccountsResult {
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!accountId) return;

    let active = true;

    subAccountService
      .pick({ accountId, isActive: true })
      .then((subAccounts) => {
        if (active) setSettled({ accountId, subAccounts, error: null });
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setSettled({
          accountId,
          subAccounts: [],
          error:
            caught instanceof ApiError
              ? caught.message
              : "Sub akun gagal dimuat.",
        });
      });

    return () => {
      active = false;
    };
  }, [accountId]);

  if (!accountId) return { subAccounts: [], loading: false, error: null };
  if (settled?.accountId !== accountId) {
    return { subAccounts: [], loading: true, error: null };
  }

  return {
    subAccounts: settled.subAccounts,
    loading: false,
    error: settled.error,
  };
}
