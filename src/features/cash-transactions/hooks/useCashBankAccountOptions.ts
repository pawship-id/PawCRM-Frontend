"use client";

import { CASH_ACCOUNT_CATEGORY } from "@/features/accounting";
import type { FilterOption } from "@/components";
import type { ChartOfAccount } from "@/types/accounting";

/**
 * THE KAS & BANK ACCOUNTS a transaction may be posted to, out of a chart the
 * caller already holds.
 *
 * NOT A HOOK AND NOT A REQUEST, deliberately: both forms that need this list
 * already load the whole chart through `useLineLookups` — they have to, for the
 * expense and income accounts their rows name — and a second request for a
 * subset of what is already in hand is a round trip nobody reads.
 *
 * `accountCategory: "cash_bank"` IS THE WHOLE DEFINITION, the same one the Akun
 * Kas & Bank table on the Kas & Bank page is built from, so the picker and the
 * table can never be about different accounts. A tenant that opens a third bank
 * account files it in Daftar Akun and it is here, with no release.
 */
export function cashBankAccounts(accounts: ChartOfAccount[]): ChartOfAccount[] {
  return accounts
    .filter(
      (account) =>
        account.isActive && account.accountCategory === CASH_ACCOUNT_CATEGORY,
    )
    .sort((a, b) => a.code.localeCompare(b.code, "id"));
}

/** The same list as picker options — "1101 · Kas". */
export function cashBankAccountOptions(
  accounts: ChartOfAccount[],
): FilterOption<string>[] {
  return cashBankAccounts(accounts).map((account) => ({
    value: account._id,
    label: `${account.code} · ${account.name}`,
  }));
}
