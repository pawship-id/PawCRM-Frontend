"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import {
  businessLineService,
  type BusinessLine,
} from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import type { ChartOfAccount, ChartOfAccountNode } from "@/types/accounting";

export interface UseLineLookupsResult {
  /** Every account in the chart, flat. Narrow with `accountsForLines`. */
  accounts: ChartOfAccount[];
  /** Ids the server refuses opposite the cash. See `accountsForLines`. */
  blockedAccountIds: ReadonlySet<string>;
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
const NOTHING_BLOCKED: ReadonlySet<string> = new Set();

export function useLineLookups(enabled = true): UseLineLookupsResult {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [blockedAccountIds, setBlockedAccountIds] = useState<
    ReadonlySet<string>
  >(NOTHING_BLOCKED);
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

    // Quietly too: the server still refuses such a line, in a sentence naming
    // the right path, so a failed read only makes the picker offer more.
    const blocked = Promise.resolve()
      .then(() => cashTransactionService.blockedCounterAccounts())
      .then((result) => {
        if (active) {
          setBlockedAccountIds(
            new Set((result?.accounts ?? []).map((row) => row.accountId)),
          );
        }
      })
      .catch(() => undefined);

    // Quietly: a line with no business line is still a valid line (Bersama).
    const lines = businessLineService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBusinessLines(result.items);
      })
      .catch(() => undefined);

    void Promise.all([chart, blocked, lines]).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return { accounts, blockedAccountIds, businessLines, loading, error };
}

/**
 * The accounts a line may name: ACTIVE, not refused by the server's rule, and not
 * the cash account of this very transaction. Offering anything else would only
 * produce a 400 after the whole form was filled in.
 *
 * THE KIND'S OWN CLASS COMES FIRST, because that is what nearly every line wants:
 * beban for Pengeluaran, pendapatan for Pemasukan. The rest follow in chart order.
 *
 * `keep` holds the accounts a stored line already names. One that has since been
 * retired stays on the list, or the picker would show the line as empty.
 */
export function accountsForLines(
  accounts: ChartOfAccount[],
  {
    kind,
    blocked,
    cashAccountId,
    keep = [],
  }: {
    kind: "expense" | "other_income";
    blocked: ReadonlySet<string>;
    cashAccountId?: string | null;
    keep?: readonly string[];
  },
): ChartOfAccount[] {
  const accountType = kind === "expense" ? "expense" : "income";
  const usable = accounts.filter(
    (account) =>
      keep.includes(account._id) ||
      (account.isActive &&
        !blocked.has(account._id) &&
        account._id !== cashAccountId),
  );

  return [
    ...usable.filter((account) => account.accountType === accountType),
    ...usable.filter((account) => account.accountType !== accountType),
  ];
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
