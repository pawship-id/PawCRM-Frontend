"use client";

import { useCallback, useEffect, useState } from "react";

import { customerInvoiceService } from "@/services/customerInvoice.service";
import { ApiError } from "@/services/api-error";
import type {
  CustomerInvoiceListQuery,
  CustomerInvoiceListRow,
  CustomerInvoiceSource,
  CustomerInvoiceStatus,
  PageResult,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/**
 * The one filter that is not a plain field.
 *
 *   all          — every receivable, settled, void or not.
 *   outstanding  — `status ∈ {unpaid, partial}`. What is still collectable.
 *   overdue      — that, plus already past due. Triage: who gets called today.
 *   dueSoon      — that, but NOT yet late and falling due inside the server's
 *                  horizon. What to expect this week.
 *   unpaid /     — an exact status, which the API honours OVER the three
 *   partial /      shorthands above.
 *   paid / void
 *
 * NONE OF THE THREE SHORTHANDS IS EXPRESSIBLE AS A STATUS, and none is computed
 * here: they are the API's own AR definitions, and asking the server for them is
 * what keeps this screen's rows and the pager's total agreeing. A client
 * filtering a page on `isOverdue` would show four rows above a footer claiming
 * twenty.
 *
 * `outstanding` EXCLUDES `void` AS WELL AS `paid`, which is the one place the AR
 * vocabulary departs from the AP one. A supplier's bill is never voided; a sale
 * can be, and the debt it raised goes with it. Counting a voided invoice as
 * collectable would put money on this screen nobody may chase.
 */
export type ReceivablesView =
  | "all"
  | "outstanding"
  | "overdue"
  | "dueSoon"
  | CustomerInvoiceStatus;

/** The orderings the API accepts — CUSTOMER_INVOICE_SORTS in the model. */
export type CustomerInvoiceSort =
  | "dueSoonest"
  | "dueLatest"
  | "newest"
  | "oldest";

/** The query knobs the receivables screen drives (page + the visible filters). */
export interface CustomerInvoicesQuery {
  page: number;
  search: string;
  /** "" = any customer, otherwise one debtor's ledger. */
  customerId: string;
  /** Whose books carry the debt. "" = every branch. */
  branchId: string;
  /** "" = both origins. */
  source: CustomerInvoiceSource | "";
  view: ReceivablesView;
  /** `yyyy-mm-dd`, as the date inputs hold them. "" = unbounded. */
  dateFrom: string;
  dateTo: string;
  /**
   * Which ordering the list is paged through in. Always set — a list with no
   * ordering is not a thing — so it has no "" and Reset returns it to the
   * default rather than clearing it.
   *
   * INDEPENDENT OF `view`. The lens decides WHICH invoices are on the page and
   * the ordering decides what the top of it is; "Jatuh tempo" with "Terlama" is
   * a perfectly ordinary question (the oldest late debts), so neither control
   * may quietly reach into the other.
   */
  sort: CustomerInvoiceSort;
}

const PAGE_SIZE = 20;

const DEFAULT_QUERY: CustomerInvoicesQuery = {
  page: 1,
  search: "",
  customerId: "",
  branchId: "",
  source: "",
  /*
    OUTSTANDING, not "all". A receivables screen is opened to answer "who still
    owes us" — settled and voided invoices are history, and leading with them
    buries the ten rows that need chasing under a hundred that do not. "Semua" is
    one click away.
  */
  view: "outstanding",
  dateFrom: "",
  dateTo: "",
  /*
    SOONEST DUE FIRST, matching the endpoint's own default rather than
    second-guessing it — and deliberately not the payables screen's "newest". A
    payables list is read to decide what to pay, which is a question about the
    bills in hand; this one is read to decide who to chase, which is a question
    about who has been waiting longest.
  */
  sort: "dueSoonest",
};

/** Empty page so consumers can render a table shell before the first load. */
const EMPTY_PAGE: PageResult<CustomerInvoiceListRow>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

/**
 * Translates the screen's single `view` knob into the API's four independent
 * ones.
 *
 * A named function rather than inlined in the effect, because it is the one
 * place the vocabulary is mapped and getting it wrong is invisible: sending
 * `status: "overdue"` would 400, but sending `overdue: true` alongside
 * `status: "unpaid"` would quietly drop part-paid invoices that are late — the
 * server takes the explicit status and drops the shorthand.
 */
function viewFilters(
  view: ReceivablesView,
): Pick<
  CustomerInvoiceListQuery,
  "status" | "outstanding" | "overdue" | "dueSoon"
> {
  if (view === "all") return {};
  if (view === "outstanding") return { outstanding: true };
  if (view === "overdue") return { overdue: true };
  // No window travels with it: the horizon is the server's, the same one the
  // outstanding summary computes its due-soon figures against. Two places to
  // state a window are two chances to state it differently.
  if (view === "dueSoon") return { dueSoon: true };
  return { status: view };
}

/** Strips the empty string; the server pushes a bare `dateTo` to end of day. */
function orUndefined(value: string): string | undefined {
  return value || undefined;
}

interface UseCustomerInvoicesResult {
  invoices: CustomerInvoiceListRow[];
  pagination: PageResult<CustomerInvoiceListRow>["pagination"];
  query: CustomerInvoicesQuery;
  loading: boolean;
  error: string | null;
  /** Merge a partial query change; any change other than `page` resets to page 1. */
  setQuery: (patch: Partial<CustomerInvoicesQuery>) => void;
  refetch: () => void;
}

/**
 * Owns the receivables list query state and fetching.
 *
 * Mirrors usePurchaseInvoices: local state, a fetch effect keyed on the query,
 * and an explicit `refetch`. Any filter change resets to page 1 so the user is
 * never stranded on a page that no longer exists.
 *
 * `refetch` MATTERS HERE, the same way it does on the payables list. A row on
 * this screen can change — recording a payment moves an invoice from `unpaid` to
 * `partial` to `paid`, which under the default `outstanding` view removes it from
 * the list entirely. The detail screen is where that happens, so the caller
 * re-asks on return rather than this hook guessing.
 */
export function useCustomerInvoices(
  /** Fixes filters the screen does not expose — e.g. one customer's ledger. */
  initial: Partial<CustomerInvoicesQuery> = {},
): UseCustomerInvoicesResult {
  const [query, setQueryState] = useState<CustomerInvoicesQuery>({
    ...DEFAULT_QUERY,
    ...initial,
  });
  const [invoices, setInvoices] = useState<CustomerInvoiceListRow[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<CustomerInvoiceListRow>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to force the effect to re-run without changing query.
  const [nonce, setNonce] = useState(0);

  // The toolbar keeps the live query so typing stays responsive; only the
  // request waits for the search box to settle.
  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<CustomerInvoicesQuery>) => {
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
    // makes the late setStates safe. Same sanctioned fetch-effect shape as
    // usePurchaseInvoices, so the heuristic lint rule is disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: CustomerInvoiceListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      customerId: settled.customerId || undefined,
      branchId: settled.branchId || undefined,
      source: settled.source || undefined,
      dateFrom: orUndefined(settled.dateFrom),
      dateTo: orUndefined(settled.dateTo),
      sort: settled.sort,
      ...viewFilters(settled.view),
    };

    customerInvoiceService
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
            : "Gagal memuat data piutang pelanggan. Coba lagi.",
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
