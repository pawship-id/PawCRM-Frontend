"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { branchService } from "@/services/branch.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { PaymentChannel } from "@/types/api";

/**
 * The channel register — every named place money can arrive, and the account it
 * lands in.
 *
 * A SETTINGS LIST AGAIN (20 September 2026), which is what it was before
 * 16 September and what it is once more now that the screen lives in
 * Pengaturan. In between it was half of Kas & Bank's money table, and so it
 * fetched a period's movement and a trial balance alongside the rows. None of
 * that belongs here: a setup screen has no period, and the figures it used to
 * carry are on Kas & Bank, per account, where they add up.
 *
 * TWO LABEL READS AND NO MONEY. The chart of accounts and the branch register
 * name what a channel points at; a missing label renders as a dash rather than
 * failing the table, because a channel whose account was renamed is still a
 * channel somebody needs to edit.
 */
export interface PaymentChannelRow {
  channel: PaymentChannel;
  /** "1102 · Bank BCA", or null when the chart could not be read. */
  accountLabel: string | null;
  /** The branch this channel belongs to; null means every branch. */
  branchName: string | null;
}

export interface UsePaymentChannelListResult {
  rows: PaymentChannelRow[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface PaymentChannelListQueryState {
  search: string;
  /** Include soft-deleted channels, so a deleted one can be restored. */
  includeDeleted: boolean;
}

export function usePaymentChannelList(
  query: PaymentChannelListQueryState,
  { enabled = true }: { enabled?: boolean } = {},
): UsePaymentChannelListResult {
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [accountLabels, setAccountLabels] = useState<Map<string, string>>(
    new Map(),
  );
  const [branchLabels, setBranchLabels] = useState<Map<string, string>>(
    new Map(),
  );

  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /* ------------------------------------------------ labels, fetched once */
  /*
    The chart of accounts and the branch register change when somebody edits
    them, not when a search box does. Only assets can be a channel's account, so
    only assets are worth pulling.
  */
  useEffect(() => {
    if (!enabled) return;
    let active = true;

    Promise.allSettled([
      chartOfAccountsService.list({ accountType: "asset", limit: 100 }),
      branchService.list({ limit: 100 }),
    ]).then(([accounts, branches]) => {
      if (!active) return;

      if (accounts.status === "fulfilled") {
        setAccountLabels(
          new Map(
            accounts.value.items.map((account) => [
              account._id,
              `${account.code} · ${account.name}`,
            ]),
          ),
        );
      }
      if (branches.status === "fulfilled") {
        setBranchLabels(
          new Map(branches.value.items.map((b) => [b._id, b.name])),
        );
      }
      // A missing label renders as a dash. Failing the table here would put a
      // red banner over rows that are otherwise perfectly readable.
    });

    return () => {
      active = false;
    };
  }, [enabled, nonce]);

  /* ------------------------------------------------------------ the rows */
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    paymentChannelService
      .list({
        limit: 100,
        search: query.search || undefined,
        includeDeleted: query.includeDeleted || undefined,
      })
      .then((page) => {
        if (!active) return;
        setChannels(page.items);
      })
      .catch((err) => {
        if (!active) return;
        setChannels([]);
        setError(
          err instanceof Error
            ? err.message
            : "Gagal memuat channel pembayaran.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, nonce, query.search, query.includeDeleted]);

  const rows = useMemo<PaymentChannelRow[]>(
    () =>
      channels.map((channel) => ({
        channel,
        accountLabel: accountLabels.get(channel.accountId) ?? null,
        branchName: channel.branchId
          ? (branchLabels.get(channel.branchId) ?? null)
          : null,
      })),
    [channels, accountLabels, branchLabels],
  );

  return { rows, loading, error, refetch };
}
