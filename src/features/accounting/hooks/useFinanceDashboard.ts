"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import {
  journalEntryService,
  type AccountBalance,
  type JournalSummary,
} from "@/services/journalEntry.service";
import type { BusinessLine } from "@/services/businessLine.service";
import type { Branch } from "@/types/api";
import type { ChartOfAccount, JournalEntry } from "@/types/accounting";

import { CASH_ACCOUNT_CODES, type FinanceQuery } from "../financeSummary";

/**
 * Everything `/dashboard/keuangan` renders, in one hook.
 *
 * THREE LEDGER CALLS AND TWO LOOKUPS, and the split is the whole design:
 *
 *   `/journal-entries/summary`  → the P&L cards and the margin chips
 *   `/journal-entries/balances` → the cash position
 *   `/journal-entries?limit=10` → the ten rows under them
 *   `/business-lines`, `/branches` → the filter options and the id→name maps
 *
 * The two aggregates exist so this file does not have to page a month of entries
 * and add them up — see docs/finance-dashboard-gaps.md §2. What remains
 * client-side is the projection that turns an entry into a transaction row, which
 * is a reshape of ten records rather than arithmetic over thousands.
 *
 * THE LOOKUPS ARE FETCHED ONCE AND THE LEDGER ON EVERY FILTER CHANGE. Branches
 * and business lines change when somebody edits them, not when a date picker
 * moves, and re-requesting them per filter would triple the traffic to redraw the
 * same two dropdowns.
 *
 * PARTIAL FAILURE IS A REAL STATE, not a crash. A user may hold
 * `journalEntries:read` without `businessLines:read`, and a dashboard that
 * refused to render because it could not label a chip would be worse than one
 * that shows the ids' worth of data it does have. Only the ledger calls are
 * allowed to fail the screen.
 */
export interface UseFinanceDashboardResult {
  summary: JournalSummary | null;
  /** Kas and bank only — the two accounts the cash card sums. */
  cashAccounts: AccountBalance[];
  /** The ten most recent entries in the period, newest first. */
  entries: JournalEntry[];
  /** How many entries the period holds, for "10 dari 128". */
  entryCount: number;

  branches: Branch[];
  businessLines: BusinessLine[];
  /** business line id → name, for the chips and the table badges. */
  businessLineNames: Map<string, string>;
  /** account id → account, for naming the category column. */
  accountsById: Map<string, ChartOfAccount>;

  loading: boolean;
  /** Set only when the LEDGER failed. A missing lookup degrades silently. */
  error: string | null;
  refetch: () => void;
}

/** How many rows the dashboard shows before handing off to Jurnal Umum. */
export const RECENT_LIMIT = 10;

/**
 * `enabled: false` makes the hook fetch nothing and report `loading: false`.
 *
 * Not an optimisation — a correctness rule. The permission check that decides
 * whether this screen has anything to show lives in the component, and calling
 * the hook unconditionally would fire three requests a user without
 * `journalEntries:read` is guaranteed to get a 403 from, on every page load.
 * A hook that cannot be called conditionally has to be told.
 */
export function useFinanceDashboard(
  query: FinanceQuery,
  { enabled = true }: { enabled?: boolean } = {},
): UseFinanceDashboardResult {
  const [summary, setSummary] = useState<JournalSummary | null>(null);
  const [cashAccounts, setCashAccounts] = useState<AccountBalance[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entryCount, setEntryCount] = useState(0);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);

  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // The filter is a value, not an object identity: `businessLines` is a fresh
  // array on every render of the screen, so depending on `query` itself would
  // re-request the ledger on every keystroke elsewhere on the page.
  const queryKey = JSON.stringify([
    query.dateFrom,
    query.dateTo,
    query.branchId,
    query.businessLineId,
  ]);

  /* ------------------------------------------------ lookups, fetched once */
  useEffect(() => {
    if (!enabled) return;
    let active = true;

    Promise.allSettled([
      branchService.list({ limit: 100 }),
      businessLineService.list({ limit: 100 }),
      chartOfAccountsService.tree(),
    ]).then(([branchResult, lineResult, accountResult]) => {
      if (!active) return;

      if (branchResult.status === "fulfilled") {
        setBranches(branchResult.value.items);
      }
      if (lineResult.status === "fulfilled") {
        setBusinessLines(lineResult.value.items);
      }
      if (accountResult.status === "fulfilled") {
        setAccounts(flattenAccounts(accountResult.value));
      }
      // No setError on any of these. A user without `businessLines:read` gets a
      // dashboard whose chips read as ids rather than no dashboard at all.
    });

    return () => {
      active = false;
    };
  }, [enabled, nonce]);

  /* --------------------------------------- the ledger, on every filter change */
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const period = {
      dateFrom: query.dateFrom || undefined,
      dateTo: query.dateTo || undefined,
      branchId: query.branchId || undefined,
      businessLineId: query.businessLineId || undefined,
    };

    Promise.all([
      journalEntryService.summary(period),
      // `asOf` is the END of the period: a balance is a position on a date, so
      // the start of the range says nothing about it.
      journalEntryService.balances({
        asOf: query.dateTo || undefined,
        branchId: query.branchId || undefined,
        accountType: "asset",
      }),
      journalEntryService.list({ ...period, page: 1, limit: RECENT_LIMIT }),
    ])
      .then(([summaryResult, balancesResult, listResult]) => {
        if (!active) return;

        setSummary(summaryResult);
        setCashAccounts(
          balancesResult.accounts.filter((account) =>
            CASH_ACCOUNT_CODES.includes(account.code),
          ),
        );
        setEntries(listResult.items);
        setEntryCount(listResult.pagination.total);
      })
      .catch((err) => {
        if (!active) return;
        setSummary(null);
        setCashAccounts([]);
        setEntries([]);
        setEntryCount(0);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat ringkasan keuangan.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    enabled,
    queryKey,
    nonce,
    query.dateFrom,
    query.dateTo,
    query.branchId,
    query.businessLineId,
  ]);

  const businessLineNames = useMemo(
    () => new Map(businessLines.map((line) => [line._id, line.name])),
    [businessLines],
  );

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account._id, account])),
    [accounts],
  );

  return {
    summary,
    cashAccounts,
    entries,
    entryCount,
    branches,
    businessLines,
    businessLineNames,
    accountsById,
    loading,
    error,
    refetch,
  };
}

/**
 * The COA tree flattened depth-first — the same walk `useChartOfAccounts` does.
 *
 * Only a lookup map is wanted here, so the order is incidental; the flatten is
 * shared in shape rather than in code because that hook also returns the ordered
 * array its screen renders from, and exporting a helper that serves one caller's
 * incidental need is how two screens end up disagreeing about a tree.
 */
function flattenAccounts(
  nodes: Array<ChartOfAccount & { children?: unknown[] }>,
): ChartOfAccount[] {
  const flat: ChartOfAccount[] = [];

  const walk = (list: Array<ChartOfAccount & { children?: unknown[] }>) => {
    for (const node of list) {
      const { children, ...account } = node;
      flat.push(account as ChartOfAccount);
      if (Array.isArray(children) && children.length) {
        walk(children as Array<ChartOfAccount & { children?: unknown[] }>);
      }
    }
  };

  walk(nodes);
  return flat;
}
