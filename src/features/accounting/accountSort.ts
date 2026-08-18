import type { ChartOfAccount } from "@/types/accounting";

/**
 * The orderings the chart of accounts offers.
 *
 * FOUR, AND NO "TERBARU". Every other list in this app opens newest-first,
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
export type AccountSort = "codeAsc" | "codeDesc" | "nameAsc" | "nameDesc";

export const DEFAULT_ACCOUNT_SORT: AccountSort = "codeAsc";

/**
 * The comparator for one ordering, applied to SIBLINGS — accounts sharing a
 * parent — and never across the tree as a whole.
 *
 * That restriction is the point. Sorting a chart of accounts flat would put 5101
 * next to 1101 and detach every sub-account from the account it belongs to,
 * which loses the one relationship the tree exists to show. Ordering decides
 * which sibling comes first; it does not decide who anybody's parent is.
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
    default:
      return (a, b) => collate(a.code, b.code);
  }
}

function collate(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true, sensitivity: "base" });
}
