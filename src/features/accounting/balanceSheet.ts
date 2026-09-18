import { toDecimalString, toMinor } from "@/utils/decimal";
import type { AccountBalance } from "@/services/journalEntry.service";
import type { AccountCategory, AccountType } from "@/types/accounting";

import { ACCOUNT_CATEGORY_LABEL } from "./labels";

/**
 * The NERACA, folded out of one trial balance.
 *
 * ```
 *   Aset      = Cash & Bank + Piutang Dagang + Persediaan + Aset Lancar Lainnya
 *             + Aset Tetap + Investasi Jangka Panjang
 *   Kewajiban = Hutang Dagang + Hutang Lainnya + Hutang Jangka Panjang
 *   Modal     = Modal + Laba Ditahan
 * ```
 *
 * BO's own structure, 18 September 2026. The ten balance-sheet categories are
 * exactly the fifteen minus the five the laba rugi uses, which is what makes the
 * pair of reports show every account somewhere.
 *
 * ONE READ, NOT AN ENDPOINT OF ITS OWN. `GET /journal-entries/balances` already
 * returns every account with a posting, cumulative to `asOf`, signed by its
 * normal balance and carrying its category. What is left is grouping, and
 * grouping is a view's job.
 *
 * LABA DITAHAN IS DERIVED HERE, and it is the one figure on the page that is not
 * a row in the ledger. PawCRM has no closing entry — nothing sweeps the year's
 * profit into an equity account — so the retained earnings ARE the income and
 * expense accounts, summed from inception to `asOf`. An account called "Laba
 * Ditahan" would sit at zero forever and quietly make the sheet not balance.
 *
 * WHETHER IT BALANCES IS REPORTED, NOT ASSUMED. `balanced` is computed and the
 * screen prints it: a balance sheet that silently does not add up is the single
 * most misleading thing this module could show, and the difference is the first
 * clue to what went wrong.
 */

export interface BalanceSheetAccount {
  accountId: string;
  code: string;
  name: string;
  /** Signed by the account's normal balance, so an ordinary row is positive. */
  balance: string;
}

export interface BalanceSheetGroup {
  key: AccountCategory;
  label: string;
  accounts: BalanceSheetAccount[];
  total: string;
}

export interface BalanceSheetSection {
  key: AccountType;
  label: string;
  groups: BalanceSheetGroup[];
  total: string;
}

export interface BalanceSheet {
  /** Aset. */
  assets: BalanceSheetSection;
  /** Kewajiban. */
  liabilities: BalanceSheetSection;
  /** Modal — its `groups` hold only the real equity accounts. */
  equity: BalanceSheetSection;
  /** Σpendapatan − Σbeban to date. Shown as a row inside Modal. */
  retainedEarnings: string;
  /** Modal + laba ditahan. */
  equityTotal: string;
  /** Kewajiban + modal — what must equal the assets. */
  liabilitiesAndEquity: string;
  /** `assets − liabilitiesAndEquity`. Zero when the books balance. */
  difference: string;
  balanced: boolean;
}

/**
 * The categories of each section, in the order a neraca is read — most liquid
 * first on the asset side, shortest-dated first on the liability side.
 *
 * Mirrors BALANCE_SHEET_SECTIONS on the server. Written out rather than derived
 * from the class, because the ORDER is the report's and a class does not have
 * one: `asset` cannot say that cash comes before vehicles.
 */
const SECTIONS: Array<{ key: AccountType; label: string; categories: AccountCategory[] }> = [
  {
    key: "asset",
    label: "Aset",
    categories: [
      "cash_bank",
      "piutang_dagang",
      "persediaan",
      "aset_lancar_lainnya",
      "aset_tetap",
      "investasi_jangka_panjang",
    ],
  },
  {
    key: "liability",
    label: "Kewajiban",
    categories: ["hutang_dagang", "hutang_lainnya", "hutang_jangka_panjang"],
  },
  { key: "equity", label: "Modal", categories: ["modal"] },
];

export function balanceSheet(balances: AccountBalance[]): BalanceSheet {
  const sectionOf = (
    spec: (typeof SECTIONS)[number],
  ): BalanceSheetSection => {
    const groups = spec.categories
      .map((category) => {
        const accounts = balances
          .filter((row) => row.accountCategory === category)
          .map((row) => ({
            accountId: row.accountId,
            code: row.code,
            name: row.name,
            balance: row.balance,
          }));

        return {
          key: category,
          label: ACCOUNT_CATEGORY_LABEL[category],
          accounts,
          total: sum(accounts.map((account) => account.balance)),
        };
      })
      /*
        A CATEGORY WITH NO ACCOUNTS IS DROPPED, unlike the laba rugi's five
        groups which are always printed. The difference is what a reader infers
        from the absence: a P&L with no "Biaya Lainnya" line looks like a report
        that failed, while a neraca with no "Investasi Jangka Panjang" section
        simply says the shop has none — which is true of almost every tenant.
      */
      .filter((group) => group.accounts.length > 0);

    return {
      key: spec.key,
      label: spec.label,
      groups,
      total: sum(groups.map((group) => group.total)),
    };
  };

  const [assets, liabilities, equity] = SECTIONS.map(sectionOf);

  /*
    Every P&L account, summed. `balance` is already signed by the normal
    direction — income positive on the credit side, expense positive on the
    debit side — so the profit is simply one minus the other.
  */
  const income = sum(
    balances
      .filter((row) => row.accountType === "income")
      .map((row) => row.balance),
  );
  const expense = sum(
    balances
      .filter((row) => row.accountType === "expense")
      .map((row) => row.balance),
  );
  const retainedEarnings = minus(income, expense);

  const equityTotal = sum([equity.total, retainedEarnings]);
  const liabilitiesAndEquity = sum([liabilities.total, equityTotal]);
  const difference = minus(assets.total, liabilitiesAndEquity);

  return {
    assets,
    liabilities,
    equity,
    retainedEarnings,
    equityTotal,
    liabilitiesAndEquity,
    difference,
    balanced: (toMinor(difference) ?? 0n) === 0n,
  };
}

/** Sums decimal strings exactly, through BigInt minor units. */
function sum(values: Array<string | undefined>): string {
  return toDecimalString(
    values.reduce<bigint>((acc, value) => acc + (toMinor(value ?? "0") ?? 0n), 0n),
  );
}

/** `a − b`, exactly. */
function minus(a: string, b: string): string {
  return toDecimalString((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n));
}
