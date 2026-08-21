"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { ApiError } from "@/services/api-error";
import { useAuth } from "@/features/auth";
import {
  accessibleBranches,
  accessibleWarehouses,
} from "@/utils/accessScope";
import type { Branch, Category, PageResult } from "@/types/api";
import type { ChartOfAccount } from "@/types/accounting";
import type { StockWarehouse } from "@/types/inventory";

interface CatalogLookups {
  categories: Category[];
  /**
   * Active only by default — an inactive warehouse cannot accept an opening
   * balance, so offering it in a picker leads to a 400. See `includeInactive`.
   */
  warehouses: StockWarehouse[];
  /**
   * The two posting overrides a product may name, empty unless `withAccounting`
   * asked for them.
   *
   * SPLIT BY TYPE BECAUSE THE API IS. It refuses an `inventoryAccountId` that is
   * not an asset and a `cogsAccountId` that is not an expense, so filtering here
   * is what stops each picker from offering a choice that cannot be saved.
   */
  inventoryAccounts: ChartOfAccount[];
  cogsAccounts: ChartOfAccount[];
  /** Empty unless `withBranches` asked for them, or the read was refused. */
  branches: Branch[];
  loading: boolean;
  /** Non-null when either list failed — the screen shows this instead of guessing. */
  error: string | null;
  /**
   * Why the accounting lists did not arrive, or null when they did.
   *
   * A REASON RATHER THAN A BOOLEAN, and that distinction was paid for: the first
   * version was a boolean and the UI rendered "your role has no access to
   * Accounting" for it — so when the real cause turned out to be a malformed
   * request from this very file (a `limit` above the API's cap, answered 400),
   * the screen confidently sent people hunting for an RBAC problem that did not
   * exist.
   *
   * A caught error must not be turned into a diagnosis. `403` genuinely is a
   * permissions answer; anything else is reported as what it was.
   *
   * Distinct from `error`, which blocks the whole form: a product saves
   * perfectly well without either posting account — the ledger falls back to the
   * seeded 1201 and 5101 — so this disables two selects and explains itself
   * rather than stopping the screen.
   */
  accountingError: { status: number; message: string } | null;
}

interface CatalogLookupsOptions {
  /**
   * Load closed locations too. For NAMING rather than for picking: a product may
   * still hold stock at a warehouse nobody may post to any more, and a detail
   * screen that dropped those rows would report less stock than exists — while
   * one that kept them without the name would show a row labelled by an id.
   */
  includeInactive?: boolean;
  /**
   * Also load the asset and expense accounts the product form's accounting
   * section picks from.
   *
   * OPT-IN so existing callers issue exactly the two requests they always did.
   * The list screen and the stock pickers have no use for either, and two extra
   * round trips on every catalogue read to fill a section that is not rendered
   * is a cost with no buyer.
   */
  withAccounting?: boolean;
  /**
   * Also load branches, so a warehouse can be shown under the branch it belongs
   * to rather than on its own.
   *
   * OPT-IN like `withAccounting`, and for the same reason: only the detail
   * screen groups by branch, and a third round trip on every catalogue read to
   * label a grouping nobody rendered is a cost with no buyer.
   *
   * FAILS SOFTLY, unlike categories and warehouses. `branches:read` is its own
   * permission, and a role that manages the catalogue without seeing the branch
   * list is ordinary — the grouping then falls back to a single "Semua gudang"
   * heading, which is exactly what the screen looked like before it grouped at
   * all.
   */
  withBranches?: boolean;
}

/**
 * The two reference lists every catalogue screen needs: categories for the
 * filter and the form's picker, warehouses for the stock column and the opening
 * balance.
 *
 * Mirrors useLookups in the users feature — fetched in parallel, once on mount,
 * no cache and no refetch. Both are small, rarely-changing lists, and one
 * `loading`/`error` gates the section that needs them.
 *
 * THE WAREHOUSES AND BRANCHES ARE NARROWED TO THE SIGNED-IN USER'S OWN. The
 * server refuses a post outside that reach with a 403 and hides its documents
 * from every read, so offering one here could only produce a rejection after a
 * form was filled in. A courtesy over the server's answer, never the isolation
 * itself — `utils/accessScope.ts` says why.
 *
 * A FAILURE HERE IS SHOWN, NOT SWALLOWED. These are separate permissions
 * (`categories:read`, `warehouses:read`) from `products:read`, so a role granted
 * only the latter gets a form whose category picker cannot be filled — and
 * "could not load categories" is an answer its user can act on, where an empty
 * dropdown is not.
 */
export function useCatalogLookups({
  includeInactive = false,
  withAccounting = false,
  withBranches = false,
}: CatalogLookupsOptions = {}): CatalogLookups {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventoryAccounts, setInventoryAccounts] = useState<ChartOfAccount[]>(
    [],
  );
  const [cogsAccounts, setCogsAccounts] = useState<ChartOfAccount[]>([]);
  const [accountingError, setAccountingError] = useState<{
    status: number;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        /**
         * The accounts list CATCHES ITS OWN FAILURE, unlike the two above it.
         *
         * `chartOfAccounts:read` is a separate permission from `products:read`,
         * and a role that manages the catalogue without seeing the books is an
         * ordinary arrangement rather than a misconfiguration. Letting that
         * rejection reach the shared `catch` would take down the whole form —
         * category picker, variant matrix, opening stock and all — over an
         * optional section.
         *
         * IT USED TO FETCH THE BUSINESS LINES ALONGSIDE. Tagging a product with
         * a line left the catalogue entirely: the mapping belongs to Keuangan,
         * so Inventory no longer asks the question and no longer reads the list.
         *
         * Categories and warehouses stay unguarded deliberately: without them
         * there is no product to save, so their failure IS the form's failure.
         */
        const [
          categoryResult,
          warehouseResult,
          assetResult,
          expenseResult,
          branchResult,
        ] = await Promise.all([
            categoryService.list(),
            warehouseService.list(includeInactive ? {} : { isActive: true }),
            withAccounting
              ? chartOfAccountsService
                  .list({ accountType: "asset", isActive: true })
                  .catch((err: unknown) => err as ApiError)
              : Promise.resolve(null),
            withAccounting
              ? chartOfAccountsService
                  .list({ accountType: "expense", isActive: true })
                  .catch((err: unknown) => err as ApiError)
              : Promise.resolve(null),
            // Swallows its own rejection, like the accounting pair: a missing
            // branch list degrades the grouping, it does not break the screen.
            withBranches
              ? branchService.list({ limit: 100 }).catch(() => null)
              : Promise.resolve(null),
          ]);
        if (!active) return;
        setCategories(categoryResult.items);
        setWarehouses(accessibleWarehouses(user, warehouseResult.items));
        setBranches(
          branchResult ? accessibleBranches(user, branchResult.items) : [],
        );
        // The rejection is carried through as the value, so the reason survives
        // rather than collapsing to "something failed".
        const assetFailure = assetResult instanceof Error ? assetResult : null;
        const expenseFailure =
          expenseResult instanceof Error ? expenseResult : null;

        setInventoryAccounts(
          assetResult && !assetFailure
            ? (assetResult as PageResult<ChartOfAccount>).items
            : [],
        );
        setCogsAccounts(
          expenseResult && !expenseFailure
            ? (expenseResult as PageResult<ChartOfAccount>).items
            : [],
        );
        // Either half failing is the same answer to the form: the accounts
        // could not be read, so the section says why instead of offering an
        // empty picker that looks like an empty chart.
        const failure = assetFailure ?? expenseFailure;
        setAccountingError(
          failure
            ? {
                status: failure instanceof ApiError ? failure.status : 0,
                message: failure.message,
              }
            : null,
        );
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Kategori dan gudang gagal dimuat.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [includeInactive, withAccounting, withBranches, user]);

  return {
    categories,
    warehouses,
    branches,
    inventoryAccounts,
    cogsAccounts,
    loading,
    error,
    accountingError,
  };
}
