"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import {
  journalEntryService,
  type AccountBalance,
  type ProfitLossResult,
} from "@/services/journalEntry.service";
import { ApiError } from "@/services/api-error";
import type { BusinessLine } from "@/services/businessLine.service";
import type { Branch } from "@/types/api";

import type { FinanceQuery } from "../financeSummary";

/**
 * The three reading reports — Laba Rugi, Neraca, Arus Kas — and the two lookup
 * lists their toolbars are built from.
 *
 * ONE HOOK FOR THREE SCREENS, because the shape of the work is identical in all
 * three: fetch the branches and the lines once, fetch the figures again whenever
 * the filter moves, and never let a missing lookup take the report down with it.
 * Three copies of that would be three places for the loading and error handling
 * to drift.
 *
 * WHICH REPORT IT FETCHES IS THE CALLER'S CHOICE (`kind`), and the union below
 * is what keeps a screen from reading a field the endpoint it asked for does not
 * return.
 *
 * THE LOOKUPS FAIL SOFTLY, exactly as they do on the dashboard: `businessLines:read`
 * and `branches:read` are their own grants, and a bookkeeper without them should
 * get a report whose filters are short — not an error page.
 */
export type FinanceReportKind = "profitLoss" | "balanceSheet" | "cashflow";

/** Two trial balances, one at each end of the period. See `cashflowReport`. */
export interface CashflowBalances {
  opening: AccountBalance[];
  closing: AccountBalance[];
}

export interface UseFinanceReportResult {
  branches: Branch[];
  businessLines: BusinessLine[];
  /** Present when `kind` is "profitLoss". */
  profitLoss: ProfitLossResult | null;
  /** Present when `kind` is "balanceSheet" — the whole trial balance. */
  balances: AccountBalance[] | null;
  /** Present when `kind` is "cashflow". */
  cashflow: CashflowBalances | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * The day before a period starts, as a calendar date.
 *
 * WHY ARUS KAS NEEDS IT. `balances` is cumulative and INCLUSIVE of `asOf`, so
 * asking as of the first day of the period would fold that day's own movement
 * into the opening balance and report it as having always been there. The saldo
 * awal is the position at the END of the day before.
 *
 * Parsed and rebuilt by hand rather than through `new Date(iso)`, which reads a
 * bare date as UTC midnight and would step back two days for anyone east of
 * Greenwich — which is everyone this product has.
 */
export function dayBefore(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

export function useFinanceReport(
  kind: FinanceReportKind,
  query: FinanceQuery,
): UseFinanceReportResult {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);

  const [profitLoss, setProfitLoss] = useState<ProfitLossResult | null>(null);
  const [balances, setBalances] = useState<AccountBalance[] | null>(null);
  const [cashflow, setCashflow] = useState<CashflowBalances | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /*
    Branches and business lines change when somebody edits them, not when a date
    picker moves. Re-requesting them per filter would triple the traffic to
    redraw the same two dropdowns.
  */
  useEffect(() => {
    let active = true;

    Promise.allSettled([
      branchService.list({ limit: 100 }),
      businessLineService.list({ limit: 100 }),
    ]).then(([branchResult, lineResult]) => {
      if (!active) return;
      if (branchResult.status === "fulfilled") {
        setBranches(branchResult.value.items);
      }
      if (lineResult.status === "fulfilled") {
        setBusinessLines(lineResult.value.items);
      }
    });

    return () => {
      active = false;
    };
  }, [nonce]);

  // Destructured so the effect depends on the four values rather than on the
  // object literal a screen rebuilds on every render.
  const { dateFrom, dateTo, branchId, allocation } = query;

  const fetcher = useMemo(() => {
    const branch = branchId || undefined;

    if (kind === "profitLoss") {
      /*
        `businessLineId` IS DELIBERATELY NOT SENT. On the API it narrows the
        LEDGER — the response would then carry one column — where this report
        uses it to drop columns from a matrix that still has to total across all
        of them. See profitLossMatrix.
      */
      return () =>
        journalEntryService
          .profitLoss({
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            branchId: branch,
            allocation,
          })
          .then((result) => ({ kind, result }) as const);
    }

    if (kind === "balanceSheet") {
      /*
        THE WHOLE TRIAL BALANCE, unfiltered by category. The neraca needs its
        three sections AND the income and expense rows, because laba ditahan is
        derived from those — PawCRM has no closing entry that would move it into
        an equity account. See `balanceSheet`.

        `asOf` is the END of the period: a balance is a position on a date, and
        the start of the range says nothing about it.
      */
      return () =>
        journalEntryService
          .balances({ asOf: dateTo || undefined, branchId: branch })
          .then((result) => ({ kind, result }) as const);
    }

    return () =>
      Promise.all([
        // The opening read is skipped when the period is open-ended: with no
        // start there is nothing before it, and every balance is movement.
        dateFrom
          ? journalEntryService.balances({
              asOf: dayBefore(dateFrom),
              branchId: branch,
              accountCategory: "cash_bank",
            })
          : Promise.resolve({ asOf: null, timezone: "", accounts: [] }),
        journalEntryService.balances({
          asOf: dateTo || undefined,
          branchId: branch,
          accountCategory: "cash_bank",
        }),
      ]).then(([opening, closing]) => ({ kind, opening, closing }) as const);
  }, [kind, dateFrom, dateTo, branchId, allocation]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetcher()
      .then((payload) => {
        if (!active) return;

        if (payload.kind === "profitLoss") {
          setProfitLoss(payload.result);
        } else if (payload.kind === "balanceSheet") {
          setBalances(payload.result.accounts);
        } else {
          setCashflow({
            opening: payload.opening.accounts,
            closing: payload.closing.accounts,
          });
        }
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof ApiError
            ? cause.fullMessage
            : "Laporan gagal dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetcher, nonce]);

  return {
    branches,
    businessLines,
    profitLoss,
    balances,
    cashflow,
    loading,
    error,
    refetch,
  };
}
