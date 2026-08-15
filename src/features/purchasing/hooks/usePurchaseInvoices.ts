"use client";

import { useCallback, useEffect, useState } from "react";

import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { ApiError } from "@/services/api-error";
import type {
  InvoiceStatus,
  PageResult,
  PurchaseInvoiceListQuery,
  PurchaseInvoiceListRow,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/**
 * The one filter that is not a plain field.
 *
 *   all          — every bill, settled or not.
 *   outstanding  — `status != paid`. Planning: what do we still owe.
 *   overdue      — that, plus already past due. Triage: who gets called today.
 *   dueSoon      — that, but NOT yet late and falling due inside the server's
 *                  horizon. The payment run: what to prepare cash for.
 *   unpaid /     — an exact status, which the API honours OVER the three
 *   partial /      shorthands above.
 *   paid
 *
 * NONE OF THE THREE SHORTHANDS IS EXPRESSIBLE AS A STATUS, and none is computed
 * here: they are the API's own AP definitions, and asking the server for them is
 * what keeps this screen's rows and the pager's total agreeing. A client
 * filtering a page on `isOverdue` would show four rows above a footer claiming
 * twenty.
 *
 * `dueSoon` in particular could not be assembled client-side at all. Its window
 * has a NEAR end as well as a far one — "due this week and not already late" —
 * and `dueBefore` bounds only the far end, so the browser would be dropping rows
 * out of a page the server had already counted.
 */
export type PayablesView =
  | "all"
  | "outstanding"
  | "overdue"
  | "dueSoon"
  | InvoiceStatus;

/** The query knobs the payables screen drives (page + the visible filters). */
export interface PurchaseInvoicesQuery {
  page: number;
  search: string;
  /** "" = any supplier, otherwise a specific one. */
  supplierId: string;
  view: PayablesView;
  /** `yyyy-mm-dd`, as the date inputs hold them. "" = unbounded. */
  dateFrom: string;
  dateTo: string;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: PurchaseInvoicesQuery = {
  page: 1,
  search: "",
  supplierId: "",
  // OUTSTANDING, not "all". A payables screen is opened to answer "what do we
  // owe" — settled bills are history, and leading with them buries the ten rows
  // that need money under a hundred that do not. "Semua" is one click away.
  view: "outstanding",
  dateFrom: "",
  dateTo: "",
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<PurchaseInvoiceListRow>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

/**
 * Translates the screen's single `view` knob into the API's three independent
 * ones.
 *
 * Kept as a named function rather than inlined in the effect because it is the
 * one place the vocabulary is mapped, and getting it wrong is invisible: sending
 * `status: "overdue"` would 400, but sending `overdue: true` alongside
 * `status: "unpaid"` would quietly return partial-paid bills that are late — the
 * server takes the explicit status and drops the shorthand.
 */
function viewFilters(
  view: PayablesView,
): Pick<
  PurchaseInvoiceListQuery,
  "status" | "outstanding" | "overdue" | "dueSoon"
> {
  if (view === "all") return {};
  if (view === "outstanding") return { outstanding: true };
  if (view === "overdue") return { overdue: true };
  // No window travels with it: the horizon is the server's, the same one the
  // outstanding summary computes its due-soon figures against.
  if (view === "dueSoon") return { dueSoon: true };
  return { status: view };
}

/**
 * `dateTo` as the API wants its upper bound.
 *
 * The server now pushes a bare date to 23:59:59.999 itself, so this only strips
 * the empty string. It is a named helper anyway, next to `dateFrom`, so the
 * asymmetry between the two bounds stays visible at the call site.
 */
function orUndefined(value: string): string | undefined {
  return value || undefined;
}

interface UsePurchaseInvoicesResult {
  invoices: PurchaseInvoiceListRow[];
  pagination: PageResult<PurchaseInvoiceListRow>["pagination"];
  query: PurchaseInvoicesQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<PurchaseInvoicesQuery>) => void;
  refetch: () => void;
}

/**
 * Owns the payables list query state and fetching.
 *
 * Mirrors useGoodsReceipts: local state, a fetch effect keyed on the query, and
 * an explicit `refetch`. Any filter change resets to page 1 so the user is never
 * stranded on a page that no longer exists.
 *
 * `refetch` MATTERS HERE, unlike on the receipts list. A row on this screen can
 * change — recording a payment moves an invoice from `unpaid` to `partial` to
 * `paid`, which under the default `outstanding` view removes it from the list
 * entirely. The detail screen is where that happens, so the caller re-asks on
 * return rather than this hook guessing.
 */
export function usePurchaseInvoices(
  /** Fixes filters the screen does not expose — e.g. one supplier's ledger. */
  initial: Partial<PurchaseInvoicesQuery> = {},
): UsePurchaseInvoicesResult {
  const [query, setQueryState] = useState<PurchaseInvoicesQuery>({
    ...DEFAULT_QUERY,
    ...initial,
  });
  const [invoices, setInvoices] = useState<PurchaseInvoiceListRow[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<PurchaseInvoiceListRow>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<PurchaseInvoicesQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      // A filter change (anything but an explicit page move) returns to page 1.
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The query changed (or refetch bumped the nonce): show the loading state,
    // then synchronize with the server. The stale-response guard (`active`)
    // makes the late setStates safe. This mirrors the sanctioned fetch-effect
    // shape in useGoodsReceipts, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: PurchaseInvoiceListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      supplierId: settled.supplierId || undefined,
      dateFrom: orUndefined(settled.dateFrom),
      dateTo: orUndefined(settled.dateTo),
      ...viewFilters(settled.view),
    };

    purchaseInvoiceService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setInvoices(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setInvoices([]);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat data utang supplier. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { invoices, pagination, query, loading, error, setQuery, refetch };
}
