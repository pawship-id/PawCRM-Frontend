"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { branchService } from "@/services/branch.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type {
  CashTransactionChannelTotals,
  PaymentChannel,
} from "@/types/api";
import { toDecimalString, toMinor } from "@/utils/decimal";

/**
 * The "Akun Kas & Bank" table — where the money sits, and what moved through it.
 *
 * FOUR READS, none of them per row:
 *
 *   `/payment-channels`              → the rows themselves
 *   `/cash-transactions/summary`     → Σ masuk and Σ keluar per channel
 *   `/journal-entries/balances`      → the saldo behind each channel's account
 *   `/chart-of-accounts`, `/branches`→ the account code and the branch name
 *
 * THE MOVEMENT IS PER CHANNEL AND THE BALANCE IS PER ACCOUNT, which is the one
 * thing to understand about this table. A channel is a way money arrives — "QRIS
 * Gopay", "Transfer BCA" — and several of them can point at the SAME ledger
 * account. Σ in/out splits cleanly per channel; a balance does not, because the
 * account holds one figure however many channels feed it.
 *
 * So the saldo is printed ONCE PER ACCOUNT, on the first channel that uses it,
 * and the others say which row carries it. Printing it on every row would invite
 * a reader to add the column up and get twice the money the shop has — the
 * exact failure a table is worst at, because a column of numbers looks like it
 * wants summing.
 */
export interface CashAccountRow {
  channel: PaymentChannel;
  /** "1102 · Bank BCA", or null when the chart could not be read. */
  accountLabel: string | null;
  /** The branch this channel belongs to; null means every branch. */
  branchName: string | null;
  /** Σ in over the period, as a decimal string. "0" when nothing moved. */
  masuk: string;
  keluar: string;
  /**
   * The account's balance as of the period's end — on the FIRST channel using
   * that account, and null on the rest. See the note above.
   */
  saldo: string | null;
  /**
   * Set on a row whose saldo is null because another row carries it: the name of
   * that row's channel, so the table can say where the figure went rather than
   * printing a bare dash.
   */
  saldoSharedWith: string | null;
}

export interface UseCashAccountsResult {
  rows: CashAccountRow[];
  /** Σ of each ACCOUNT's balance, counted once — the "Saldo" card. */
  totalSaldo: string;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** What the table is scoped by — the page's context bar, nothing else. */
export interface CashAccountsQuery {
  dateFrom: string;
  dateTo: string;
  branchId: string;
  /** Include soft-deleted channels, so a deleted one can be restored. */
  includeDeleted: boolean;
}

export function useCashAccounts(
  query: CashAccountsQuery,
  { enabled = true }: { enabled?: boolean } = {},
): UseCashAccountsResult {
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [totals, setTotals] = useState<CashTransactionChannelTotals[]>([]);
  const [balances, setBalances] = useState<Map<string, string>>(new Map());
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
    them, not when a date picker moves. Only assets can be a channel's account,
    so only assets are worth pulling.
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

  /* ----------------------------------------------- the rows, per filter */
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    Promise.all([
      paymentChannelService.list({
        limit: 100,
        includeDeleted: query.includeDeleted || undefined,
      }),
      cashTransactionService.summaryByChannel({
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        branchId: query.branchId || undefined,
      }),
    ])
      .then(([channelPage, summary]) => {
        if (!active) return;
        setChannels(channelPage.items);
        setTotals(summary.channels);
      })
      .catch((err) => {
        if (!active) return;
        setChannels([]);
        setTotals([]);
        setError(
          err instanceof Error
            ? err.message
            : "Gagal memuat akun kas & bank.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    enabled,
    nonce,
    query.dateFrom,
    query.dateTo,
    query.branchId,
    query.includeDeleted,
  ]);

  /* ------------------------------------------------- balances, per period */
  /*
    ITS OWN EFFECT because it is a POSITION, not a movement: it takes the END of
    the range and ignores the start, so it does not need to re-run when only
    `dateFrom` moves. It also degrades on its own — a reader without
    `journalEntries:read` still gets the masuk/keluar columns.
  */
  useEffect(() => {
    if (!enabled) return;
    let active = true;

    journalEntryService
      .balances({
        asOf: query.dateTo || undefined,
        branchId: query.branchId || undefined,
        accountType: "asset",
      })
      .then((result) => {
        if (!active) return;
        setBalances(
          new Map(
            result.accounts.map((account) => [account.accountId, account.balance]),
          ),
        );
      })
      .catch(() => {
        if (active) setBalances(new Map());
      });

    return () => {
      active = false;
    };
  }, [enabled, nonce, query.dateTo, query.branchId]);

  const byChannel = useMemo(
    () =>
      new Map(
        totals
          .filter((row) => row.channelId !== null)
          .map((row) => [row.channelId as string, row]),
      ),
    [totals],
  );

  const rows = useMemo<CashAccountRow[]>(() => {
    // Which channel is the first to use each account — the one that prints its
    // balance. Built in render order, so the answer matches what a reader sees.
    const firstForAccount = new Map<string, string>();
    for (const channel of channels) {
      if (!firstForAccount.has(channel.accountId)) {
        firstForAccount.set(channel.accountId, channel._id);
      }
    }

    const nameById = new Map(channels.map((c) => [c._id, c.name]));

    return channels.map((channel) => {
      const movement = byChannel.get(channel._id);
      const owner = firstForAccount.get(channel.accountId);
      const owns = owner === channel._id;

      return {
        channel,
        accountLabel: accountLabels.get(channel.accountId) ?? null,
        branchName: channel.branchId
          ? (branchLabels.get(channel.branchId) ?? null)
          : null,
        masuk: movement?.in.amount ?? "0",
        keluar: movement?.out.amount ?? "0",
        saldo: owns ? (balances.get(channel.accountId) ?? "0") : null,
        saldoSharedWith:
          owns || !owner ? null : (nameById.get(owner) ?? null),
      };
    });
  }, [channels, byChannel, accountLabels, branchLabels, balances]);

  // Σ over the ACCOUNTS the rows name, each counted once — which is what the
  // "saldo on the first row only" rule above is there to make possible.
  const totalSaldo = useMemo(
    () =>
      toDecimalString(
        rows.reduce(
          (sum, row) => sum + (row.saldo ? (toMinor(row.saldo) ?? 0n) : 0n),
          0n,
        ),
      ),
    [rows],
  );

  return { rows, totalSaldo, loading, error, refetch };
}
