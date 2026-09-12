import type {
  CashTransactionDirection,
  CashTransactionKind,
  CashTransactionSort,
  CashTransactionStatus,
} from "@/types/api";

import { CASH_TRANSACTION_KINDS } from "./labels";

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
  search: string;
  /** The pill row outside the panel. */
  direction: CashTransactionDirection | "";
  /** Empty = semua jenis. */
  kinds: CashTransactionKind[];
  /** `yyyy-mm-dd`. */
  dateFrom: string;
  dateTo: string;
  branchId: string;
  channelId: string;
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
  search: "",
  direction: "",
  kinds: [],
  dateFrom: "",
  dateTo: "",
  branchId: "",
  channelId: "",
  status: "",
  documentId: "",
  sort: "newest",
};

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
  kind?: string | string[];
  direction?: string | string[];
  status?: string | string[];
  documentId?: string | string[];
}): Partial<CashTransactionsQuery> {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const initial: Partial<CashTransactionsQuery> = {};

  const kinds = (first(params.kind) ?? "")
    .split(",")
    .filter((kind): kind is CashTransactionKind =>
      (CASH_TRANSACTION_KINDS as string[]).includes(kind),
    );
  if (kinds.length > 0) initial.kinds = kinds;

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
