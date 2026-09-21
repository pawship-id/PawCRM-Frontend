"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import type { ChartOfAccount } from "@/types/accounting";
import { sumDecimals, toDecimalString, toMinor } from "@/utils/decimal";

import { CASH_ACCOUNT_CATEGORY } from "../financeSummary";

/**
 * The "Akun Kas & Bank" table — the ledger accounts the shop's money sits in,
 * and what moved through them.
 *
 * ROWS ARE ACCOUNTS, NOT CHANNELS (20 September 2026). This table used to list
 * payment channels — "Kas Toko Pusat", "BCA 8730…", "QRIS Xendit" — which are
 * the buttons a cashier presses, not the places money is held. Several of them
 * routinely point at one account, so the table had to print each saldo once and
 * say "ikut …" on the rest: a column a reader could not add up. Filed by
 * account, the figures are simply per row, and Σ saldo is the shop's cash
 * position without a footnote. The channels moved to Pengaturan › Channel
 * Pembayaran, where a list of buttons belongs.
 *
 * `accountCategory: "cash_bank"` IS THE WHOLE DEFINITION of which accounts
 * appear — not a hardcoded list of codes, which is what the dashboard's cash
 * card used to carry and what made a tenant's third bank account invisible.
 * A tenant that opens one files it under Kas & Bank in Daftar Akun and it is
 * here, with no release.
 *
 * TWO READS, NEITHER PER ROW:
 *
 *   `/chart-of-accounts?accountCategory=cash_bank` → the rows themselves
 *   `/journal-entries/movement`  → Σ masuk and Σ keluar over the period
 *   `/journal-entries/balances`  → the saldo at the period's end
 *
 * THE CHART IS THE ROW SOURCE AND THE LEDGER ONLY FILLS IN, which is the one
 * thing to understand about the join. A ledger fold returns accounts that MOVED;
 * an account that had a quiet month has no line to fold and would simply vanish
 * from a table built the other way round. Joined onto the chart, it keeps its
 * row and reads zero — which is the truthful figure and the one somebody is
 * looking for when they ask where the money went.
 */
export interface CashBankAccountRow {
  account: ChartOfAccount;
  /** Σ in over the period, as a decimal string. "0" when nothing moved. */
  masuk: string;
  keluar: string;
  /** The account's balance as of the period's end. */
  saldo: string;
}

export interface UseCashBankAccountsResult {
  rows: CashBankAccountRow[];
  /** Σ saldo over every row — no account counted twice, because rows ARE accounts. */
  totalSaldo: string;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** What the table is scoped by — the page's context bar, nothing else. */
export interface CashBankAccountsQuery {
  dateFrom: string;
  dateTo: string;
  branchId: string;
  /** Include accounts marked inactive in Daftar Akun. */
  includeInactive: boolean;
}

export function useCashBankAccounts(
  query: CashBankAccountsQuery,
  { enabled = true }: { enabled?: boolean } = {},
): UseCashBankAccountsResult {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [masuk, setMasuk] = useState<Map<string, string>>(new Map());
  const [keluar, setKeluar] = useState<Map<string, string>>(new Map());
  const [balances, setBalances] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /* ------------------------------------------------------ the rows */
  /*
    THE ONLY READ THAT MAY FAIL THE TABLE. Without the chart there are no rows
    to draw; without the ledger there are rows with zeroes in them, which is
    worse than useless only if it is silent — so the two folds below degrade on
    their own and this one raises.

    `isActive` is a filter rather than a post-filter so an inactive account is
    not paged out from under the visible ones.
  */
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    chartOfAccountsService
      .list({
        accountCategory: CASH_ACCOUNT_CATEGORY,
        ...(query.includeInactive ? {} : { isActive: true }),
        limit: 100,
      })
      .then((page) => {
        if (!active) return;
        setAccounts(page.items);
      })
      .catch((err) => {
        if (!active) return;
        setAccounts([]);
        setError(
          err instanceof Error ? err.message : "Gagal memuat akun kas & bank.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, nonce, query.includeInactive]);

  /* -------------------------------------------- movement, per period */
  /*
    A MOVEMENT: it takes both ends of the range. Asked with the same category
    the chart was, so a tenant with forty accounts still sends one narrow fold
    rather than the whole ledger.
  */
  useEffect(() => {
    if (!enabled) return;
    let active = true;

    journalEntryService
      .movement({
        dateFrom: query.dateFrom || undefined,
        dateTo: query.dateTo || undefined,
        branchId: query.branchId || undefined,
        accountCategory: CASH_ACCOUNT_CATEGORY,
      })
      .then((result) => {
        if (!active) return;
        setMasuk(new Map(result.accounts.map((a) => [a.accountId, a.masuk])));
        setKeluar(new Map(result.accounts.map((a) => [a.accountId, a.keluar])));
      })
      .catch(() => {
        if (!active) return;
        // Zeroes rather than a failed table — the rows and the saldo are still
        // worth reading, and an empty movement column reads as "nothing moved",
        // which the caption under the table is there to qualify.
        setMasuk(new Map());
        setKeluar(new Map());
      });

    return () => {
      active = false;
    };
  }, [enabled, nonce, query.dateFrom, query.dateTo, query.branchId]);

  /* -------------------------------------------- balances, per period */
  /*
    ITS OWN EFFECT because it is a POSITION, not a movement: it takes the END of
    the range and ignores the start, so it does not re-run when only `dateFrom`
    moves.
  */
  useEffect(() => {
    if (!enabled) return;
    let active = true;

    journalEntryService
      .balances({
        asOf: query.dateTo || undefined,
        branchId: query.branchId || undefined,
        accountCategory: CASH_ACCOUNT_CATEGORY,
      })
      .then((result) => {
        if (!active) return;
        setBalances(
          new Map(result.accounts.map((a) => [a.accountId, a.balance])),
        );
      })
      .catch(() => {
        if (active) setBalances(new Map());
      });

    return () => {
      active = false;
    };
  }, [enabled, nonce, query.dateTo, query.branchId]);

  const rows = useMemo<CashBankAccountRow[]>(
    () =>
      accounts.map((account) => ({
        account,
        masuk: masuk.get(account._id) ?? "0",
        keluar: keluar.get(account._id) ?? "0",
        saldo: balances.get(account._id) ?? "0",
      })),
    [accounts, masuk, keluar, balances],
  );

  /*
    Σ OVER THE ROWS, AND THAT IS NOW SIMPLY CORRECT. When the rows were channels
    this sum had to skip the ones whose saldo belonged to another row; rows are
    accounts, so every saldo is counted exactly once by construction.
  */
  const totalSaldo = useMemo(
    () =>
      toDecimalString(
        rows.reduce((sum, row) => sum + (toMinor(row.saldo) ?? 0n), 0n),
      ),
    [rows],
  );

  return { rows, totalSaldo, loading, error, refetch };
}

/** Σ of one column across the rows — the table's footer. */
export function sumColumn(
  rows: CashBankAccountRow[],
  key: "masuk" | "keluar" | "saldo",
): string {
  return sumDecimals(rows.map((row) => row[key]));
}
