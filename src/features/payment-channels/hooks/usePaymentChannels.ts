"use client";

import { useCallback, useEffect, useState } from "react";

import { paymentChannelService } from "@/services/paymentChannel.service";
import { ApiError } from "@/services/api-error";
import type {
  PaymentChannel,
  PaymentChannelListQuery,
  PaymentChannelType,
  PageResult,
} from "@/types/api";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";

/** The query knobs the settings screen drives. */
export interface PaymentChannelsQuery {
  page: number;
  search: string;
  /** "" = every tab, otherwise one channel type. */
  type: PaymentChannelType | "";
  includeDeleted: boolean;
}

/**
 * A hundred, not twenty.
 *
 * This is a SETTINGS screen, not a ledger: a tenant has a handful of channels —
 * two drawers, three bank accounts, a QRIS merchant — and paging through them
 * would be a control with nothing behind it. 100 is the API's own page cap, so
 * asking for more is a 400 rather than a bigger page. A tenant past it is one
 * whose Kas & Bank setup needs a conversation, not a second page.
 */
const PAGE_SIZE = 100;

const DEFAULT_QUERY: PaymentChannelsQuery = {
  page: 1,
  search: "",
  type: "",
  includeDeleted: false,
};

const EMPTY_PAGE: PageResult<PaymentChannel>["pagination"] = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

interface UsePaymentChannelsResult {
  channels: PaymentChannel[];
  pagination: PageResult<PaymentChannel>["pagination"];
  query: PaymentChannelsQuery;
  loading: boolean;
  error: string | null;
  setQuery: (patch: Partial<PaymentChannelsQuery>) => void;
  refetch: () => void;
}

/**
 * Owns the payment-channel list query and fetching. Mirrors useServices.
 *
 * NO SORT KNOB: the server returns them grouped by tab and in display order,
 * which is the order the POS payment panel renders and the only order the
 * settings screen wants to be read in.
 */
export function usePaymentChannels(): UsePaymentChannelsResult {
  const [query, setQueryState] =
    useState<PaymentChannelsQuery>(DEFAULT_QUERY);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [pagination, setPagination] =
    useState<PageResult<PaymentChannel>["pagination"]>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const settled = useDebouncedQuery(query);

  const setQuery = useCallback((patch: Partial<PaymentChannelsQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.page === undefined) next.page = 1;
      return next;
    });
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // The sanctioned fetch-effect shape — see useCustomers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const apiQuery: PaymentChannelListQuery = {
      page: settled.page,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      type: settled.type === "" ? undefined : settled.type,
      includeDeleted: settled.includeDeleted || undefined,
    };

    paymentChannelService
      .list(apiQuery)
      .then((result) => {
        if (!active) return;
        setChannels(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setChannels([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar channel tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [settled, nonce]);

  return { channels, pagination, query, loading, error, setQuery, refetch };
}

/** Indonesian labels for the four tabs. The visible word is copy, not the API's value. */
export const CHANNEL_TYPE_LABELS: Record<PaymentChannelType, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "EDC",
};

/** The order the POS panel renders its tabs, and this screen its groups. */
export const CHANNEL_TYPE_ORDER: PaymentChannelType[] = [
  "cash",
  "transfer",
  "qris",
  "edc",
];
