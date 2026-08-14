"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import { ApiError } from "@/services/api-error";
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
   * Income accounts only, and empty unless `withAccounting` asked for them.
   *
   * The API refuses a `salesAccountId` that is not an income account, so
   * filtering here is what stops the picker from offering a choice that cannot
   * be saved.
   */
  salesAccounts: ChartOfAccount[];
  businessLines: BusinessLine[];
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
   * perfectly well without a sales account, so this disables two selects and
   * explains itself rather than stopping the screen.
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
   * Also load the income accounts and business lines the product form's
   * accounting section picks from.
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [salesAccounts, setSalesAccounts] = useState<ChartOfAccount[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
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
         * The two accounting lists CATCH THEIR OWN FAILURES, unlike the two
         * above them.
         *
         * `chartOfAccounts:read` and `businessLines:read` are separate
         * permissions from `products:read`, and a role that manages the
         * catalogue without seeing the books is an ordinary arrangement rather
         * than a misconfiguration. Letting either rejection reach the shared
         * `catch` would take down the whole form — category picker, variant
         * matrix, opening stock and all — over an optional section.
         *
         * Categories and warehouses stay unguarded deliberately: without them
         * there is no product to save, so their failure IS the form's failure.
         */
        const [
          categoryResult,
          warehouseResult,
          accountResult,
          lineResult,
          branchResult,
        ] = await Promise.all([
            categoryService.list(),
            warehouseService.list(includeInactive ? {} : { isActive: true }),
            withAccounting
              ? chartOfAccountsService
                  .list({ accountType: "income", isActive: true })
                  .catch((err: unknown) => err as ApiError)
              : Promise.resolve(null),
            withAccounting
              ? businessLineService.list().catch((err: unknown) => err as ApiError)
              : Promise.resolve(null),
            // Swallows its own rejection, like the accounting pair: a missing
            // branch list degrades the grouping, it does not break the screen.
            withBranches
              ? branchService.list({ limit: 100 }).catch(() => null)
              : Promise.resolve(null),
          ]);
        if (!active) return;
        setCategories(categoryResult.items);
        setWarehouses(warehouseResult.items);
        setBranches(branchResult ? branchResult.items : []);
        // The rejection is carried through as the value, so the reason survives
        // rather than collapsing to "something failed".
        const accountFailure =
          accountResult instanceof Error ? accountResult : null;
        const lineFailure = lineResult instanceof Error ? lineResult : null;

        setSalesAccounts(
          accountResult && !accountFailure ? (accountResult as PageResult<ChartOfAccount>).items : [],
        );
        setBusinessLines(
          lineResult && !lineFailure ? (lineResult as PageResult<BusinessLine>).items : [],
        );

        const failure = accountFailure ?? lineFailure;
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
  }, [includeInactive, withAccounting, withBranches]);

  return {
    categories,
    warehouses,
    branches,
    salesAccounts,
    businessLines,
    loading,
    error,
    accountingError,
  };
}
