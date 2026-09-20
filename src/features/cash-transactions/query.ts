import type {
  CashTransactionDirection,
  CashTransactionKind,
  CashTransactionSort,
  CashTransactionStatus,
} from "@/types/api";

import {
  CASH_TRANSACTION_SOURCES,
  sourceOfKind,
  type CashTransactionSource,
} from "./labels";

/**
 * The Transaksi screen's query, its defaults and the URL parser.
 *
 * NO "use client" HERE, and that is the point of this file. The server page
 * calls `cashTransactionsQueryFromParams`; inside the client hook's module it
 * would reach the server only as a client reference, which cannot be called.
 */

/** What the Transaksi screen drives. `""` is the filter layer's "not filtering". */
export interface CashTransactionsQuery {
  page: number;
  /** Rows per page. The server caps it at 100. */
  limit: number;
  search: string;
  /** The pill row outside the panel. */
  direction: CashTransactionDirection | "";
  /**
   * SUMBER — "where did this row come from". Empty = semua sumber.
   *
   * IT REPLACED `kinds`, a multi-select over the six accounting kinds
   * (20 September 2026, on request). Sumber is the coarser question and the one
   * the table's own column already answers, so the filter and the column now
   * speak with one vocabulary; the server still takes `kind`, and the hook
   * expands this into that.
   */
  source: CashTransactionSource | "";
  /** `yyyy-mm-dd`. */
  dateFrom: string;
  dateTo: string;
  branchId: string;
  /**
   * THE KAS/BANK ACCOUNT, not the channel (20 September 2026). "Which account is
   * this money in" is the question the list is read with; a channel is a button
   * at a till, and several of them land in one account.
   */
  accountId: string;
  /**
   * `"posted"` BY DEFAULT — a cancelled transaction moved no money, and the list
   * a shop reconciles a drawer or a statement against is the list of money that
   * actually moved. `""` (semua status) brings the cancelled rows back, struck
   * through, and `"void"` shows only those; both are a deliberate choice made in
   * the filter panel or arrived at by a `?status=` deep link.
   */
  status: CashTransactionStatus | "";
  /**
   * Set only by a deep link (`?documentId=`) — "the payments on this invoice".
   * It has no control of its own; its chip is how it comes off.
   */
  documentId: string;
  sort: CashTransactionSort;
}

export const DEFAULT_CASH_TRANSACTIONS_QUERY: CashTransactionsQuery = {
  page: 1,
  /*
    25, MATCHING FAKTUR PENJUALAN (20 September 2026, on request). It was 20 —
    a number the rows-per-page control never offered, so the footer opened
    reading a size its own menu could not give back.
  */
  limit: 25,
  search: "",
  direction: "",
  source: "",
  dateFrom: "",
  dateTo: "",
  branchId: "",
  accountId: "",
  status: "posted",
  documentId: "",
  sort: "newest",
};

/**
 * What "not filtering by status" means on this screen — NOT `""`.
 *
 * The toolbar's chip and its `Filter (n)` badge, and the table's empty state,
 * all ask "has somebody narrowed this?", and every one of them would answer yes
 * for ever if they went on comparing against the empty string.
 */
export const DEFAULT_CASH_TRANSACTION_STATUS =
  DEFAULT_CASH_TRANSACTIONS_QUERY.status;

/**
 * The URL's say in the first render — how another screen deep-links here
 * (`?kind=commission_payment`, `?documentId=…`).
 *
 * READ BY THE SERVER PAGE and passed in, like `?receipt=` on the payables form,
 * so the client screen needs no `useSearchParams` and no Suspense boundary.
 * Anything unrecognised is dropped rather than sent: a bad `kind` would 400 the
 * whole list.
 */
export function cashTransactionsQueryFromParams(params: {
  source?: string | string[];
  kind?: string | string[];
  direction?: string | string[];
  status?: string | string[];
  documentId?: string | string[];
}): Partial<CashTransactionsQuery> {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const initial: Partial<CashTransactionsQuery> = {};

  /*
    `?source=` IS THE CURRENT SPELLING, and `?kind=` still works: the komisi
    recap's "Riwayat pembayaran komisi" links here with
    `?kind=commission_payment`, and those links are in people's notes and
    browser histories. A kind is mapped to the Sumber that contains it, so the
    control can actually show what the URL asked for — a filter the screen
    cannot draw is worse than one it never applied.
  */
  const source = first(params.source);
  if (source && (CASH_TRANSACTION_SOURCES as string[]).includes(source)) {
    initial.source = source as CashTransactionSource;
  } else {
    const legacy = (first(params.kind) ?? "").split(",")[0];
    const mapped = legacy
      ? sourceOfKind(legacy as CashTransactionKind)
      : undefined;
    if (mapped) initial.source = mapped;
  }

  const direction = first(params.direction);
  if (direction === "in" || direction === "out") initial.direction = direction;

  const status = first(params.status);
  if (status === "posted" || status === "void") initial.status = status;

  const documentId = first(params.documentId);
  if (documentId && /^[a-f0-9]{24}$/i.test(documentId)) {
    initial.documentId = documentId;
  }

  return initial;
}
