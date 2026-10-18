"use client";

import { useEffect, useState } from "react";

import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { ApiError } from "@/services/api-error";
import type { ChartOfAccount } from "@/types/accounting";

/** One page is enough: a tenant's chart is tens of accounts, not thousands. */
const OPTION_LIMIT = 100;

interface UseExpenseAccountOptionsResult {
  /** Active `biaya` and `biaya_lainnya` accounts, in code order. */
  accounts: ChartOfAccount[];
  loading: boolean;
  error: string | null;
}

/**
 * The accounts a "biaya lain" may be posted to instead of HPP (16 October
 * 2026, BO) — e.g. 6107 Beban Ongkos Kirim.
 *
 * FILTERED BY CATEGORY ON THE SERVER, the same reasoning as
 * useSupplierAccountOptions: the API refuses any other account with a 400, so
 * asking for exactly the legal ones keeps the picker from offering a refusal.
 * Two requests because the list takes one category at a time.
 *
 * FAILS SOFTLY: `chartOfAccounts:read` is a separate grant, and a bill whose
 * charges all go to the goods saves without this list.
 */
export function useExpenseAccountOptions(): UseExpenseAccountOptionsResult {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      chartOfAccountsService.list({
        accountCategory: "biaya",
        isActive: true,
        limit: OPTION_LIMIT,
      }),
      chartOfAccountsService.list({
        accountCategory: "biaya_lainnya",
        isActive: true,
        limit: OPTION_LIMIT,
      }),
    ])
      .then(([expenses, otherExpenses]) => {
        if (!active) return;
        setAccounts(
          [...expenses.items, ...otherExpenses.items].sort((a, b) =>
            a.code.localeCompare(b.code),
          ),
        );
      })
      .catch((err) => {
        if (!active) return;
        setAccounts([]);
        setError(
          err instanceof ApiError ? err.message : "Daftar akun beban gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { accounts, loading, error };
}
