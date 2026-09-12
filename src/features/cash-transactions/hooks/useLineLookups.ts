"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import {
  businessLineService,
  type BusinessLine,
} from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import type { ChartOfAccount, ChartOfAccountNode } from "@/types/accounting";

export interface UseLineLookupsResult {
  /** Every account in the chart, flat. Narrow with `accountsForKind`. */
  accounts: ChartOfAccount[];
  /** Empty when the user cannot read them — every line then goes to Bersama. */
  businessLines: BusinessLine[];
  loading: boolean;
  /** Set only when the CHART failed: without accounts no line can be written. */
  error: string | null;
}

/**
 * What an expense or other-income line is written against: the chart of
 * accounts and the lines of business.
 *
 * THE WHOLE TREE, ONCE, filtered here — the create form flips between
 * Pengeluaran and Pemasukan, and one request serves both sides of the toggle.
 * `enabled: false` skips both requests, for a dialog editing a kind without
 * lines.
 */
export function useLineLookups(enabled = true): UseLineLookupsResult {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const chart = chartOfAccountsService
      .tree()
      .then((roots) => {
        if (active) setAccounts(flatten(roots));
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat daftar akun. Coba lagi.",
        );
      });

    // Quietly: a line with no business line is still a valid line (Bersama).
    const lines = businessLineService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBusinessLines(result.items);
      })
      .catch(() => undefined);

    void Promise.all([chart, lines]).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return { accounts, businessLines, loading, error };
}

/**
 * The accounts a line may name: ACTIVE, and of the class the server requires —
 * `expense` for Pengeluaran, `income` for Pemasukan lain. Offering anything else
 * would only produce a 400 after the whole form was filled in.
 */
export function accountsForKind(
  accounts: ChartOfAccount[],
  kind: "expense" | "other_income",
): ChartOfAccount[] {
  const accountType = kind === "expense" ? "expense" : "income";
  return accounts.filter(
    (account) => account.isActive && account.accountType === accountType,
  );
}

function flatten(nodes: ChartOfAccountNode[]): ChartOfAccount[] {
  const flat: ChartOfAccount[] = [];
  const walk = (level: ChartOfAccountNode[]) => {
    for (const { children, ...account } of level) {
      flat.push(account);
      if (children?.length) walk(children);
    }
  };
  walk(nodes);
  return flat;
}
