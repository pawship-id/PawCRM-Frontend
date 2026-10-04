"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { fixedCostService } from "@/services/fixedCost.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import {
  journalEntryService,
  type JournalTrendDay,
  type ProfitLossResult,
} from "@/services/journalEntry.service";
import type { BusinessLine } from "@/services/businessLine.service";
import type { FixedCost, FixedCostTotals } from "@/types/accounting";
import type {
  Branch,
  CashTransactionTotals,
  CustomerOutstandingSummary,
  SupplierOutstandingSummary,
} from "@/types/api";

import {
  isoDate,
  previousPeriod,
  trendWindow,
  type FinanceQuery,
  type Period,
} from "../financeSummary";

/** How far ahead the Ringkasan looks for biaya tetap coming due. */
export const FIXED_COST_HORIZON_DAYS = 30;

/**
 * Everything the Ringkasan tab renders, in one hook.
 *
 * SIX READS ACROSS FIVE MODULES, and the split is the whole design. The mockup's
 * Ringkasan asks one question — "what moved, and what still needs doing" — whose
 * answer no single endpoint holds:
 *
 *   `/journal-entries/profit-loss`    → laba, net revenue, margin, laba per lini,
 *                                       P&L ringkas, beban terbesar
 *   `/journal-entries/trend`          → the 7-day pendapatan-per-lini chart
 *   `/cash-transactions` (totals)     → net cashflow (masuk − keluar)
 *   `/customer-invoices/outstanding`  → piutang belum tertagih
 *   `/purchase-invoices/outstanding`  → utang belum dibayar
 *   `/fixed-costs` (totals)           → biaya tetap jatuh tempo ≤30 hari
 *
 * PLUS THE SAME TWO MONEY READS FOR THE PERIOD BEFORE — the laba rugi and the
 * cash totals again, over `previousPeriod` — for the cards' "vs periode
 * sebelumnya". Only when the period has both ends: "Semua" has no before.
 *
 * `/summary` AND `/balances` LEFT ON 22 SEPTEMBER 2026, with the v3 mockup. The
 * cash cards they fed (saldo, komisi) are the Kas & Bank and Komisi tabs' now,
 * and `/summary` cannot tell HPP from biaya — the laba rugi can.
 *
 * EVERY ONE OF THEM IS AN AGGREGATE the server computed over its whole book. Not
 * one figure on this screen is summed in the browser over a page of rows, which
 * is the rule the whole Keuangan backend was shaped around — see
 * PawCRM-Backend/docs/finance-dashboard-gaps.md. A total added up from a page is
 * a lower bound wearing a total's clothes, and it grows as somebody pages.
 *
 * ONE EFFECT PER READ, KEYED ON WHAT EACH ACTUALLY DEPENDS ON. A single effect over
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
  /** The period's laba rugi, undivided — the shared bucket is its own column. */
  profitLoss: ProfitLossResult | null;
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
  /**
   * Active expense biaya tetap due within `FIXED_COST_HORIZON_DAYS`, overdue
   * ones included — soonest first, and the totals over all of them.
   */
  fixedCostsDue: { items: FixedCost[]; totals: FixedCostTotals } | null;
  /**
   * The comparison period and what it came to — null on "Semua" or a range
   * open at one end. Either figure is null when its own read failed or was not
   * allowed; the card then simply shows no delta.
   */
  previous: {
    period: Period;
    profitLoss: ProfitLossResult | null;
    cashMovement: CashTransactionTotals | null;
  } | null;

  branches: Branch[];
  businessLines: BusinessLine[];
  /** business line id → name, for the table and the chart. */
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
  /** `journalEntries:read` — the laba rugi and the trend. */
  ledger?: boolean;
  /** `cashTransactions:read` — net cashflow. */
  cashMovement?: boolean;
  /** `customerInvoices:read` — piutang belum tertagih. */
  receivables?: boolean;
  /** `purchaseInvoices:read` — utang belum dibayar. */
  payables?: boolean;
  /** `fixedCosts:read` — biaya tetap jatuh tempo. */
  fixedCosts?: boolean;
}

export function useFinanceDashboard(
  query: FinanceQuery,
  {
    now,
    ledger = true,
    cashMovement = true,
    receivables = true,
    payables = true,
    fixedCosts = true,
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
  const [profitLoss, setProfitLoss] = useState<ProfitLossResult | null>(null);
  const [trend, setTrend] = useState<JournalTrendDay[]>([]);
  const [movement, setMovement] = useState<CashTransactionTotals | null>(null);
  const [arSummary, setArSummary] =
    useState<CustomerOutstandingSummary | null>(null);
  const [apSummary, setApSummary] =
    useState<SupplierOutstandingSummary | null>(null);
  const [fixedCostsDue, setFixedCostsDue] =
    useState<UseFinanceDashboardResult["fixedCostsDue"]>(null);
  const [prevProfitLoss, setPrevProfitLoss] =
    useState<ProfitLossResult | null>(null);
  const [prevMovement, setPrevMovement] =
    useState<CashTransactionTotals | null>(null);

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
      // dashboard whose lini read as ids rather than no dashboard at all.
    });

    return () => {
      active = false;
    };
  }, [ledger, nonce]);

  /* ------------------------------------------ the period before, per filter */
  /*
    ITS OWN EFFECT, AND IT FAILS QUIETLY. A delta is a caption on a card, not
    the card: if the comparison cannot be read the figure above it is still
    true, so the card drops its delta line rather than the page raising an
    error. Cleared first on every change, so a delta is never drawn against
    the previous filter's "before".

    DECLARED BEFORE THE CURRENT PERIOD'S EFFECT on purpose: effects run in
    order, so the current period's request is always the last one sent — which
    is what a reader of the network tab, and the tests, take to be "the query".
  */
  const prevPeriod = useMemo(
    () => previousPeriod(query.dateFrom, query.dateTo),
    [query.dateFrom, query.dateTo],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrevProfitLoss(null);
    setPrevMovement(null);
    if (!prevPeriod) return;
    let active = true;

    if (ledger) {
      journalEntryService
        .profitLoss({
          dateFrom: prevPeriod.dateFrom,
          dateTo: prevPeriod.dateTo,
          branchId: query.branchId || undefined,
          businessLineId: query.businessLineId || undefined,
        })
        .then((result) => {
          if (active) setPrevProfitLoss(result);
        })
        .catch(() => {
          if (active) setPrevProfitLoss(null);
        });
    }

    if (cashMovement) {
      cashTransactionService
        .list({
          dateFrom: prevPeriod.dateFrom,
          dateTo: prevPeriod.dateTo,
          branchId: query.branchId || undefined,
          status: "posted",
          page: 1,
          limit: 1,
        })
        .then((result) => {
          if (active) setPrevMovement(result.totals);
        })
        .catch(() => {
          if (active) setPrevMovement(null);
        });
    }

    return () => {
      active = false;
    };
  }, [
    ledger,
    cashMovement,
    nonce,
    prevPeriod,
    query.branchId,
    query.businessLineId,
  ]);

  /* ------------------------------------------------ the laba rugi, per filter */
  useEffect(() => {
    if (!ledger) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    journalEntryService
      /*
        UNDIVIDED — `allocation` left off, the Laba Rugi screen's own default.
        The shared costs stay in their own "Bersama (HQ)" column, which is a
        fact; dividing them is a model somebody chose, and a landing page that
        silently applied it would disagree with the report one click away.
      */
      .profitLoss({
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        branchId: query.branchId || undefined,
        businessLineId: query.businessLineId || undefined,
      })
      .then((result) => {
        if (active) setProfitLoss(result);
      })
      .catch((err) => {
        if (!active) return;
        setProfitLoss(null);
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

  /* ------------------------------------------- biaya tetap coming due, per branch */
  /*
    A POSITION AGAINST TODAY, like piutang: what is due in the next thirty days
    does not change when somebody looks at last month. No `dueFrom`, so an
    occurrence already overdue is counted — it is the most due of all.
    `limit: 1` because the callout names only the soonest; `totals` is Σ over
    the whole filter, not the page.
  */
  useEffect(() => {
    if (!fixedCosts) return;
    let active = true;

    const horizon = new Date(nowIso);
    horizon.setDate(horizon.getDate() + FIXED_COST_HORIZON_DAYS);

    fixedCostService
      .list({
        isActive: true,
        kind: "expense",
        dueTo: isoDate(horizon),
        branchId: query.branchId || undefined,
        sort: "dueSoonest",
        limit: 1,
      })
      .then((result) => {
        if (active) {
          setFixedCostsDue({ items: result.items, totals: result.totals });
        }
      })
      .catch(() => {
        if (active) setFixedCostsDue(null);
      });

    return () => {
      active = false;
    };
  }, [fixedCosts, nonce, nowIso, query.branchId]);

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

  return {
    profitLoss,
    trend,
    trendPeriod,
    cashMovement: movement,
    receivables: arSummary,
    payables: apSummary,
    fixedCostsDue,
    previous: prevPeriod
      ? {
          period: prevPeriod,
          profitLoss: prevProfitLoss,
          cashMovement: prevMovement,
        }
      : null,
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

