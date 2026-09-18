"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import {
  journalEntryService,
  type AccountBalance,
  type JournalSummary,
  type JournalTrendDay,
} from "@/services/journalEntry.service";
import type { BusinessLine } from "@/services/businessLine.service";
import type {
  Branch,
  CashTransactionTotals,
  CustomerOutstandingSummary,
  SupplierOutstandingSummary,
} from "@/types/api";

import {
  trendWindow,
  CASH_ACCOUNT_CATEGORY,
  type FinanceQuery,
  type Period,
} from "../financeSummary";

/**
 * Everything the Ringkasan tab renders, in one hook.
 *
 * FIVE READS ACROSS FOUR MODULES, and the split is the whole design. The mockup's
 * Ringkasan asks one question — "what moved, and what still needs doing" — whose
 * answer no single endpoint holds:
 *
 *   `/journal-entries/summary`        → laba bersih and the margin chips
 *   `/journal-entries/balances`       → saldo kas & bank, komisi belum dibayar
 *   `/journal-entries/trend`          → the 7-day kotor-vs-bersih chart
 *   `/cash-transactions` (totals)     → uang masuk, uang keluar, arus kas bersih
 *   `/customer-invoices/outstanding`  → piutang belum tertagih
 *   `/purchase-invoices/outstanding`  → utang belum dibayar
 *
 * EVERY ONE OF THEM IS AN AGGREGATE the server computed over its whole book. Not
 * one figure on this screen is summed in the browser over a page of rows, which
 * is the rule the whole Keuangan backend was shaped around — see
 * PawCRM-Backend/docs/finance-dashboard-gaps.md. A total added up from a page is
 * a lower bound wearing a total's clothes, and it grows as somebody pages.
 *
 * FIVE EFFECTS, KEYED ON WHAT EACH READ ACTUALLY DEPENDS ON. A single effect over
 * the whole query would re-request piutang — which takes no period at all —
 * every time somebody nudged a date. What each one watches is stated on it.
 *
 * ONE GRANT PER READ, and they are genuinely independent: a bookkeeper may read
 * the ledger and not the purchase book, a cashier the reverse. A read whose grant
 * is missing is never FIRED — a hook cannot be called conditionally, so it has to
 * be told — and its figure stays null, which the screen renders by leaving the
 * card out rather than by showing a zero.
 *
 * PARTIAL FAILURE IS A REAL STATE, not a crash. Only the ledger may fail the
 * screen: it is what the tab is for. A missing lookup degrades to ids instead of
 * names; a failed piutang call leaves one card dashed; a failed trend leaves the
 * chart with its own message and the cards above it intact.
 */
export interface UseFinanceDashboardResult {
  summary: JournalSummary | null;
  /** Kas and bank only — the accounts the cash card sums. */
  cashAccounts: AccountBalance[];
  /** Every account class, for a figure read by code rather than by class. */
  balances: AccountBalance[];
  /**
   * The trend chart's points — one per calendar day, zeros included.
   *
   * Empty both before the first response and when the read was refused, which is
   * why the chart reads `trendError` and `trendLoading` rather than the length.
   */
  trend: JournalTrendDay[];
  /** The window `trend` covers. Fixed at seven days; does not follow the period. */
  trendPeriod: Period;

  /** Σ in and Σ out over the period's posted cash transactions. */
  cashMovement: CashTransactionTotals | null;
  receivables: CustomerOutstandingSummary | null;
  payables: SupplierOutstandingSummary | null;

  branches: Branch[];
  businessLines: BusinessLine[];
  /** business line id → name, for the chips. */
  businessLineNames: Map<string, string>;

  /** True while the LEDGER is in flight — what the cards dim themselves on. */
  loading: boolean;
  /** Set only when the LEDGER failed. Everything else degrades silently. */
  error: string | null;
  trendLoading: boolean;
  /** Set when the chart alone failed, so it can say so without blanking the page. */
  trendError: string | null;
  refetch: () => void;
}

/**
 * Which reads this user is allowed to make.
 *
 * FOUR FLAGS RATHER THAN ONE `enabled`, because the screen now spans four
 * modules and their grants do not travel together. Defaulting to true keeps the
 * old contract for a caller that knows it may read everything; the dashboard
 * passes what `usePermissions` actually says.
 */
export interface FinanceDashboardGrants {
  /** `journalEntries:read` — laba, saldo kas, komisi, the trend. */
  ledger?: boolean;
  /** `cashTransactions:read` — uang masuk, uang keluar, arus kas bersih. */
  cashMovement?: boolean;
  /** `customerInvoices:read` — piutang belum tertagih. */
  receivables?: boolean;
  /** `purchaseInvoices:read` — utang belum dibayar. */
  payables?: boolean;
}

export function useFinanceDashboard(
  query: FinanceQuery,
  {
    now,
    ledger = true,
    cashMovement = true,
    receivables = true,
    payables = true,
  }: FinanceDashboardGrants & {
    /**
     * The server's clock, as the page rendered it.
     *
     * REQUIRED, not defaulted to `new Date()`: the trend window is seven days
     * ending today, and a client that read the clock while rendering would ask
     * for a different week than the HTML the server sent described.
     */
    now: Date;
  },
): UseFinanceDashboardResult {
  const [summary, setSummary] = useState<JournalSummary | null>(null);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [trend, setTrend] = useState<JournalTrendDay[]>([]);
  const [movement, setMovement] = useState<CashTransactionTotals | null>(null);
  const [arSummary, setArSummary] =
    useState<CustomerOutstandingSummary | null>(null);
  const [apSummary, setApSummary] =
    useState<SupplierOutstandingSummary | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);

  const [loading, setLoading] = useState(ledger);
  const [error, setError] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(ledger);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Seven days ending on the server's today. Memoised on the ISO instant rather
  // than the Date, which is a fresh object on every render of the screen.
  const nowIso = now.toISOString();
  const trendPeriod = useMemo(() => trendWindow(new Date(nowIso)), [nowIso]);

  /* ------------------------------------------------ lookups, fetched once */
  /*
    Branches and business lines change when somebody edits them, not when a date
    picker moves. Re-requesting them per filter would triple the traffic to
    redraw the same two dropdowns.
  */
  useEffect(() => {
    if (!ledger) return;
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
      // No setError on either. A user without `businessLines:read` gets a
      // dashboard whose chips read as ids rather than no dashboard at all.
    });

    return () => {
      active = false;
    };
  }, [ledger, nonce]);

  /* ------------------------------ the P&L and the balance sheet, per filter */
  useEffect(() => {
    if (!ledger) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    Promise.all([
      journalEntryService.summary({
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        branchId: query.branchId || undefined,
        businessLineId: query.businessLineId || undefined,
      }),
      /*
        THE WHOLE TRIAL BALANCE, not `accountType: "asset"` as this used to ask.
        The screen now reads two figures off it — kas & bank (1101, 1102) and
        utang komisi (2102) — which sit in different classes, and one unfiltered
        call is cheaper than two filtered ones: the response is the accounts that
        have any postings at all, a few dozen per tenant, ordered by code.

        `asOf` is the END of the period. A balance is a position on a date, so
        the start of the range says nothing about it — stated on the card too.
      */
      journalEntryService.balances({
        asOf: query.dateTo || undefined,
        branchId: query.branchId || undefined,
      }),
    ])
      .then(([summaryResult, balancesResult]) => {
        if (!active) return;

        setSummary(summaryResult);
        setBalances(balancesResult.accounts);
      })
      .catch((err) => {
        if (!active) return;
        setSummary(null);
        setBalances([]);
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
    ledger,
    nonce,
    query.dateFrom,
    query.dateTo,
    query.branchId,
    query.businessLineId,
  ]);

  /* ------------------------------------------------------ the trend chart */
  /*
    ITS OWN EFFECT, AND ITS OWN ERROR. The window is fixed at seven days, so this
    does not depend on the period at all — folding it into the effect above would
    redraw the same chart every time somebody moved a date. And a chart that
    failed is a chart with a message in it, not a blank page: the cards above it
    came from a different request and are still true.
  */
  useEffect(() => {
    if (!ledger) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrendLoading(true);
    setTrendError(null);

    journalEntryService
      .trend({
        dateFrom: trendPeriod.dateFrom,
        dateTo: trendPeriod.dateTo,
        branchId: query.branchId || undefined,
        businessLineId: query.businessLineId || undefined,
      })
      .then((result) => {
        if (active) setTrend(result.days);
      })
      .catch((err) => {
        if (!active) return;
        setTrend([]);
        setTrendError(
          err instanceof ApiError ? err.message : "Gagal memuat tren 7 hari.",
        );
      })
      .finally(() => {
        if (active) setTrendLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    ledger,
    nonce,
    trendPeriod.dateFrom,
    trendPeriod.dateTo,
    query.branchId,
    query.businessLineId,
  ]);

  /* --------------------------------------------- cash in and out, per period */
  /*
    NOT KEYED ON THE BUSINESS LINE, because a cash transaction has none: money in
    the till belongs to the shop, and the line is a property of what was sold.
    `limit: 1` asks for one row nobody renders — `totals` is what this is for, and
    it is Σ over the WHOLE filter rather than over the page.
  */
  useEffect(() => {
    if (!cashMovement) return;
    let active = true;

    cashTransactionService
      .list({
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        branchId: query.branchId || undefined,
        status: "posted",
        page: 1,
        limit: 1,
      })
      .then((result) => {
        if (active) setMovement(result.totals);
      })
      .catch(() => {
        // Dashed on the card rather than zeroed — see StatTile. A zero standing
        // in for a failed request is the one thing a summary must not show.
        if (active) setMovement(null);
      });

    return () => {
      active = false;
    };
  }, [
    cashMovement,
    nonce,
    query.dateFrom,
    query.dateTo,
    query.branchId,
  ]);

  /* ------------------------------------------- piutang and utang, per branch */
  /*
    NEITHER TAKES A PERIOD, and that is not an omission in the API. What is owed
    is a position as of now, like a bank balance: an invoice raised in July and
    still unpaid is money the shop is missing in September, and a piutang figure
    that emptied itself when somebody picked "bulan ini" would say the opposite.
    The cards say "belum tertagih" / "belum dibayar" rather than naming a period.

    Utang takes no branch either — a supplier is billed to the tenant.
  */
  useEffect(() => {
    if (!receivables) return;
    let active = true;

    customerInvoiceService
      .outstanding({ branchId: query.branchId || undefined })
      .then((result) => {
        if (active) setArSummary(result);
      })
      .catch(() => {
        if (active) setArSummary(null);
      });

    return () => {
      active = false;
    };
  }, [receivables, nonce, query.branchId]);

  useEffect(() => {
    if (!payables) return;
    let active = true;

    purchaseInvoiceService
      .outstandingSummary()
      .then((result) => {
        if (active) setApSummary(result);
      })
      .catch(() => {
        if (active) setApSummary(null);
      });

    return () => {
      active = false;
    };
  }, [payables, nonce]);

  const businessLineNames = useMemo(
    () => new Map(businessLines.map((line) => [line._id, line.name])),
    [businessLines],
  );

  const cashAccounts = useMemo(
    () =>
      balances.filter(
        (account) => account.accountCategory === CASH_ACCOUNT_CATEGORY,
      ),
    [balances],
  );

  return {
    summary,
    cashAccounts,
    balances,
    trend,
    trendPeriod,
    cashMovement: movement,
    receivables: arSummary,
    payables: apSummary,
    branches,
    businessLines,
    businessLineNames,
    loading,
    error,
    trendLoading,
    trendError,
    refetch,
  };
}

/*
  The Set of cash CODES that used to live here is gone: membership is now a field
  on the row (`accountCategory`), so there is nothing to look up.
*/
