import type { ChartOfAccount } from "@/types/accounting";

import { ACCOUNT_CATEGORY_LABEL, ACCOUNT_TYPE_LABEL } from "./labels";

/**
 * The orderings the chart of accounts offers, one pair per sortable COLUMN.
 *
 * DRIVEN BY THE COLUMN HEADERS, not by a field in the filter panel — decided 20
 * September 2026 on request, against the BO mockup, and a deliberate exception
 * to ui-rules §8 which is recorded there. A chart of accounts is a reference
 * table people re-sort while reading it, and three clickable headers say which
 * orderings exist without anybody opening a panel to find out.
 *
 * NO "TERBARU". Every other list in this app opens newest-first,
 * because every other list is a stream of events. A chart of accounts is not:
 * it is a reference table people read BY NUMBER, which is why the backend's own
 * repository sorts it by `code` rather than `createdAt` (see the header of
 * chartOfAccounts.repository.js). Offering "Terbaru" here would order a chart by
 * the accident of which account somebody happened to add last.
 *
 * SORTED IN THE BROWSER, like every other filter on this screen — the whole
 * chart is already in hand. There is no `sort` parameter on
 * GET /chart-of-accounts/tree to send even if we wanted one.
 */
export type AccountSort =
  | "codeAsc"
  | "codeDesc"
  | "nameAsc"
  | "nameDesc"
  /**
   * ALPHABETICAL, by the label the badge shows. Decided 20 September 2026 on
   * request, alongside the class ordering below; it opened sorted by the
   * category's NUMBER (110, 111, 112 — report order), which groups the neraca
   * and the laba rugi neatly but is invisible logic: the column shows a word,
   * and the number it sorted by is nowhere on the row.
   */
  | "categoryAsc"
  | "categoryDesc"
  /**
   * ALPHABETICAL — Aset, Beban, Ekuitas, Kewajiban, Pendapatan. Decided 20
   * September 2026 on request; it opened in accounting-equation order (aset,
   * kewajiban, ekuitas, pendapatan, beban) and that is not what a column of
   * words looks sorted like.
   */
  | "typeAsc"
  | "typeDesc";

/** Which column a header click drives, and in which direction. */
export const SORT_BY_COLUMN = {
  code: { asc: "codeAsc", desc: "codeDesc" },
  name: { asc: "nameAsc", desc: "nameDesc" },
  category: { asc: "categoryAsc", desc: "categoryDesc" },
  type: { asc: "typeAsc", desc: "typeDesc" },
} as const satisfies Record<string, { asc: AccountSort; desc: AccountSort }>;

export type SortColumn = keyof typeof SORT_BY_COLUMN;

/** The column an ordering belongs to, and whether it is the ascending one. */
export function sortState(sort: AccountSort): {
  column: SortColumn;
  ascending: boolean;
} {
  for (const [column, pair] of Object.entries(SORT_BY_COLUMN)) {
    if (pair.asc === sort) return { column: column as SortColumn, ascending: true };
    if (pair.desc === sort) return { column: column as SortColumn, ascending: false };
  }
  // Unreachable while AccountSort and SORT_BY_COLUMN are total over each other,
  // which the type above enforces.
  return { column: "code", ascending: true };
}

export const DEFAULT_ACCOUNT_SORT: AccountSort = "codeAsc";

/**
 * The comparator for one ordering, applied to the WHOLE list.
 *
 * It used to be applied per sibling group, back when the screen drew a tree:
 * sorting flat would have put 5101 next to 1101 and detached every sub-account
 * from its parent. The list is flat now (see ChartOfAccountsScreen) and the
 * hierarchy shows as an indent, so there is no relationship left for an ordering
 * to break.
 *
 * Numeric collation so a hand-made "9" sorts before "10" rather than after it —
 * codes are strings (they may carry letters and hyphens), but the ones people
 * type are usually numbers, and "10" < "9" is never what was meant.
 */
export function compareAccounts(
  sort: AccountSort,
): (a: ChartOfAccount, b: ChartOfAccount) => number {
  switch (sort) {
    case "codeDesc":
      return (a, b) => collate(b.code, a.code);
    case "nameAsc":
      return (a, b) => collate(a.name, b.name);
    case "nameDesc":
      return (a, b) => collate(b.name, a.name);
    case "categoryAsc":
      return (a, b) => byCategory(a, b) || collate(a.code, b.code);
    case "categoryDesc":
      return (a, b) => byCategory(b, a) || collate(a.code, b.code);
    case "typeAsc":
      return (a, b) => byType(a, b) || collate(a.code, b.code);
    case "typeDesc":
      return (a, b) => byType(b, a) || collate(a.code, b.code);
    default:
      return (a, b) => collate(a.code, b.code);
  }
}

function collate(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true, sensitivity: "base" });
}

/**
 * Two accounts by their category, alphabetically, 0 when they share one.
 *
 * BY THE LABEL, NOT BY THE KEY, for the reason `byType` gives below: the keys
 * sort `aset_lancar_lainnya, aset_tetap, biaya, biaya_lainnya, cash_bank, …`,
 * which is close enough to look right and wrong wherever the key and the label
 * part company ("hpp" would land between "hutang_lainnya" and "investasi…",
 * while its label "Harga Pokok Penjualan" belongs near the front).
 *
 * The zero is what lets the caller fall back to the CODE, so a category sort
 * does not shuffle the accounts inside each group into whatever order they
 * happened to arrive in. Reversing only this half keeps that tie-break
 * ascending in both directions — the groups flip, the rows inside them do not,
 * which is what somebody scanning a re-sorted chart expects.
 */
function byCategory(a: ChartOfAccount, b: ChartOfAccount): number {
  return collate(
    ACCOUNT_CATEGORY_LABEL[a.accountCategory],
    ACCOUNT_CATEGORY_LABEL[b.accountCategory],
  );
}

/**
 * Two accounts by their CLASS, alphabetically.
 *
 * BY THE LABEL, NOT BY THE STORED KEY, and the two genuinely differ: the keys
 * sort `asset, equity, expense, income, liability` — which on screen reads
 * Aset, Ekuitas, Beban, Pendapatan, Kewajiban, alphabetical in a language
 * nobody is looking at. The visible words sort Aset, Beban, Ekuitas, Kewajiban,
 * Pendapatan, which is what somebody who clicked this header meant.
 *
 * Zero when they share a class, which lets the caller fall back to the code for
 * the same reason `byCategory` does: a class sort should group the rows, not
 * shuffle the ones inside each group.
 */
function byType(a: ChartOfAccount, b: ChartOfAccount): number {
  return collate(
    ACCOUNT_TYPE_LABEL[a.accountType],
    ACCOUNT_TYPE_LABEL[b.accountType],
  );
}
