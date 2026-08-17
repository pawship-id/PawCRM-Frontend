import { apiClient } from "./api-client";
import type {
  AccountType,
  CashflowType,
  JournalEntry,
  JournalSourceType,
  NormalBalance,
} from "@/types/accounting";
import type { PageResult } from "@/types/api";

/**
 * General-ledger calls against /api/journal-entries.
 *
 * THREE SHAPES, NOT ONE, and that is the point of the module. The ledger answers
 * three different questions and each has its own endpoint:
 *
 *   `list`     — rows, paginated. What happened, newest first.
 *   `summary`  — the period folded: revenue, expense, net profit, per line.
 *   `balances` — a trial balance as of a date. What we have, not what we earned.
 *
 * The dashboard needs all three, and the alternative to the last two is paging
 * the whole period and summing it here: thirty-odd requests for a busy month,
 * arithmetic on money in a browser, and an answer that is wrong the moment one
 * page fails.
 *
 * MONEY IS A DECIMAL STRING on every field below — parse it with utils/decimal,
 * never with `Number()`. The backend sends "110750000.0000" at a fixed four
 * decimal places precisely so it never passes through a float.
 *
 * One typed domain operation per apiClient request — no React, no state,
 * mirroring chartOfAccounts.service.ts. The tenant scope comes from the session
 * cookie, so it is never passed here.
 */

/** The API's hard page-size cap (`pagination` in common.validation.js). */
const MAX_PAGE_LIMIT = 100;

/**
 * `dateFrom` / `dateTo` / `asOf` are CALENDAR DATES — `"2026-08-31"`, not an
 * instant — and the server expands them to whole days in the TENANT's timezone.
 *
 * Worth knowing rather than merely obeying: sending a local ISO timestamp here
 * would be read for its UTC date, so a client that helpfully converted to UTC
 * first could shift the period by a day. Send the date the user picked.
 */
export interface LedgerPeriodQuery {
  dateFrom?: string;
  dateTo?: string;
}

export interface JournalEntryListQuery extends LedgerPeriodQuery {
  page?: number;
  limit?: number;
  /** Substring over `entryNumber` and `description`. */
  search?: string;
  sourceType?: JournalSourceType;
  sourceId?: string;
  /** Both match against the LINES — an entry belongs to every account it touches. */
  accountId?: string;
  businessLineId?: string;
  branchId?: string;
  cashflowType?: CashflowType;
  tag?: string;
}

/** One row of `byBusinessLine`. `businessLineId: null` is the shared bucket. */
export interface BusinessLineFigures {
  businessLineId: string | null;
  revenue: string;
  expense: string;
  net: string;
}

export interface JournalSummary {
  period: {
    dateFrom: string | null;
    dateTo: string | null;
    /** The IANA zone the period was expanded in — `tenants.timezone`. */
    timezone: string;
  };
  revenue: string;
  expense: string;
  /**
   * Revenue minus expense, derived server-side.
   *
   * Not recomputed here even though it could be: two figures on one screen start
   * disagreeing the moment they are computed two ways, and the server is the one
   * that saw every line.
   */
  netProfit: string;
  entryCount: number;
  /**
   * The same three figures per line, revenue-first.
   *
   * ALWAYS INCLUDES THE `businessLineId: null` ROW when anything landed in it —
   * rent, office payroll, the electricity bill. The parts sum to the whole, so a
   * client may add these up and get the totals above.
   */
  byBusinessLine: BusinessLineFigures[];
}

export interface JournalSummaryQuery extends LedgerPeriodQuery {
  branchId?: string;
  /** Narrows to ONE line, and changes the totals at the top with it. */
  businessLineId?: string;
}

export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  debit: string;
  credit: string;
  /**
   * Signed by the account's normal balance, so an ordinary account of any class
   * is positive: debit − credit for assets and expenses, credit − debit for the
   * rest. A liability does not come back negative.
   */
  balance: string;
}

export interface AccountBalancesResult {
  asOf: string | null;
  timezone: string;
  /** Accounts with no postings do not appear. Ordered by account code. */
  accounts: AccountBalance[];
}

/**
 * `asOf` and no lower bound, deliberately.
 *
 * A balance is cumulative from inception; a `dateFrom` would return a period
 * MOVEMENT wearing the word "balance", which is the one thing a cash figure must
 * never be mistaken for. For movement, use `list` with a date range.
 */
export interface AccountBalancesQuery {
  asOf?: string;
  branchId?: string;
  accountType?: AccountType;
  /** Repeated on the wire. The API caps this at 20. */
  accountIds?: string[];
}

/** The writable half of a manual entry — the only kind the HTTP API creates. */
export interface JournalEntryInput {
  date: string;
  description: string;
  branchId?: string;
  lines: Array<{
    accountId: string;
    businessLineId?: string | null;
    debit?: string;
    credit?: string;
    memo?: string | null;
  }>;
  cashflowType?: CashflowType | null;
  tags?: string[];
  attachmentUrl?: string | null;
}

export const journalEntryService = {
  /**
   * GET /journal-entries — the ledger, newest TRANSACTION date first.
   *
   * Newest-transaction, not newest-written: the two differ whenever anything is
   * backdated, and a report reads by the date the money moved.
   */
  list: (query: JournalEntryListQuery = {}) =>
    apiClient.get<PageResult<JournalEntry>>("/journal-entries", {
      query: {
        page: query.page,
        limit: query.limit
          ? Math.min(query.limit, MAX_PAGE_LIMIT)
          : undefined,
        search: query.search,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sourceType: query.sourceType,
        sourceId: query.sourceId,
        accountId: query.accountId,
        businessLineId: query.businessLineId,
        branchId: query.branchId,
        cashflowType: query.cashflowType,
        tag: query.tag,
      },
    }),

  /** GET /journal-entries/summary — the period folded. No pagination. */
  summary: (query: JournalSummaryQuery = {}) =>
    apiClient.get<JournalSummary>("/journal-entries/summary", {
      query: {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        branchId: query.branchId,
        businessLineId: query.businessLineId,
      },
    }),

  /**
   * GET /journal-entries/balances — a trial balance as of a date.
   *
   * `accountIds` is repeated on the wire (`?accountIds=a&accountIds=b`), which
   * apiClient's `Record<string, scalar>` query cannot express — hence the manual
   * URLSearchParams append and the path built here rather than passed as `query`.
   */
  balances: (query: AccountBalancesQuery = {}) => {
    const params = new URLSearchParams();
    if (query.asOf) params.append("asOf", query.asOf);
    if (query.branchId) params.append("branchId", query.branchId);
    if (query.accountType) params.append("accountType", query.accountType);
    for (const id of query.accountIds ?? []) {
      params.append("accountIds", id);
    }

    const search = params.toString();

    return apiClient.get<AccountBalancesResult>(
      search ? `/journal-entries/balances?${search}` : "/journal-entries/balances",
    );
  },

  /** GET /journal-entries/:id — one entry, with its labels resolved. */
  getById: (id: string) => apiClient.get<JournalEntry>(`/journal-entries/${id}`),

  /**
   * POST /journal-entries — a MANUAL entry, and nothing else.
   *
   * `source` is not accepted by the API at all: every other kind is posted
   * service-to-service by the module that owns the document. A client that could
   * name its own source could disguise a hand-written entry as a POS sale.
   */
  create: (input: JournalEntryInput) =>
    apiClient.post<JournalEntry>("/journal-entries", input),

  /**
   * POST /journal-entries/:id/reverse — THE ONLY WAY to correct the ledger.
   *
   * `date` defaults to the ORIGINAL's, so the correction lands in the period the
   * mistake was made. Pass one to post into the current period instead, which is
   * what you want when the earlier period is closed and already reported.
   */
  reverse: (id: string, input: { date?: string; description?: string } = {}) =>
    apiClient.post<{ entry: JournalEntry; reversal: JournalEntry }>(
      `/journal-entries/${id}/reverse`,
      input,
    ),
};
